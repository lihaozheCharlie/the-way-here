import path from "node:path";
import { access, cp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import YAML from "yaml";
import { contentBase, expandHomePath, loadVaultConfig } from "@the-way-here/wiki-core";
import type { VaultConfig } from "@the-way-here/shared";

export class MigrationRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export interface MigrationEntry {
  knowledgeBaseId: string;
  name: string;
  /** KB content directory relative to the current content base. */
  relativePath: string;
  fromPath: string;
  toPath: string;
  fileCount: number;
}

export interface MigrationPlan {
  destination: string;
  entries: MigrationEntry[];
  /** Knowledge bases that stay anchored to the workspace (bundled demo). */
  stays: Array<{ knowledgeBaseId: string; name: string }>;
  warnings: string[];
}

type BusyChecker = (knowledgeBaseId: string) => Promise<boolean>;

async function countFiles(root: string): Promise<number> {
  let count = 0;
  const queue = [root];
  while (queue.length) {
    const current = queue.pop()!;
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch (error: any) { if (error?.code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      count += 1;
      if (entry.isDirectory() && !entry.isSymbolicLink()) queue.push(path.join(current, entry.name));
    }
  }
  return count;
}

/** Validate the destination: absolute, outside workspace and current content base, existing and writable. */
export async function normalizeMigrationDestination(vaultRoot: string, config: VaultConfig, requested: unknown): Promise<string> {
  if (typeof requested !== "string" || !requested.trim()) throw new MigrationRequestError(400, "请选择新的内容存储位置");
  const raw = expandHomePath(requested.trim());
  if (!path.isAbsolute(raw)) throw new MigrationRequestError(400, "存储位置必须是绝对路径（支持 ~ 前缀）");
  const destination = path.resolve(raw);
  const workspace = path.resolve(vaultRoot);
  const current = contentBase(workspace, config);
  if (destination === workspace || destination.startsWith(`${workspace}${path.sep}`) || workspace.startsWith(`${destination}${path.sep}`)) {
    throw new MigrationRequestError(400, "存储位置不能位于工作区内或包含工作区");
  }
  if (destination === current || destination.startsWith(`${current}${path.sep}`) || current.startsWith(`${destination}${path.sep}`)) {
    throw new MigrationRequestError(400, "存储位置与当前内容位置相同或互相嵌套");
  }
  let info;
  try { info = await stat(destination); }
  catch (error: any) { if (error?.code === "ENOENT") throw new MigrationRequestError(400, `存储位置不存在：${destination}`); throw error; }
  if (!info.isDirectory()) throw new MigrationRequestError(400, `存储位置必须是目录：${destination}`);
  const probe = path.join(destination, `.twh-write-probe-${process.pid}-${Date.now()}`);
  try {
    await writeFile(probe, "probe", { flag: "wx" });
    await rm(probe, { force: true });
  } catch {
    throw new MigrationRequestError(403, "没有该目录的写入权限，请重新选择");
  }
  return destination;
}

async function migrationEntries(vaultRoot: string, destination: string): Promise<{ plan: MigrationPlan; config: VaultConfig; currentBase: string }> {
  const config = await loadVaultConfig(vaultRoot);
  const currentBase = contentBase(vaultRoot, config);
  const workspaceRoot = path.resolve(vaultRoot);
  const entries: MigrationEntry[] = [];
  const stays: MigrationPlan["stays"] = [];
  const warnings: string[] = [];
  for (const base of config.knowledgeBases) {
    const kbConfig = await loadVaultConfig(vaultRoot, base.id);
    const kbBase = contentBase(vaultRoot, kbConfig);
    // The bundled demo never follows the synced content root.
    const isBundledDemo = base.id.toLowerCase() === "demo";
    if (kbBase !== currentBase || (isBundledDemo && kbBase === workspaceRoot)) {
      stays.push({ knowledgeBaseId: base.id, name: base.name });
      continue;
    }
    const kbDir = path.posix.dirname(kbConfig.paths.wiki.replace(/\\/g, "/"));
    const relativePath = kbDir === "." || kbDir === "/" ? "" : kbDir.replace(/^\.\//, "").replace(/\/$/, "");
    if (!relativePath) {
      stays.push({ knowledgeBaseId: base.id, name: base.name });
      warnings.push(`知识库 ${base.name} 的内容目录直接位于内容根，跳过移动`);
      continue;
    }
    const entry: MigrationEntry = {
      knowledgeBaseId: base.id,
      name: base.name,
      relativePath,
      fromPath: path.join(currentBase, relativePath),
      toPath: path.join(destination, relativePath),
      fileCount: 0,
    };
    try { entry.fileCount = await countFiles(entry.fromPath); }
    catch (error: any) { if (error?.code === "ENOENT") warnings.push(`知识库 ${base.name} 的内容目录尚不存在，将只登记配置`); else throw error; }
    entries.push(entry);
  }
  return { plan: { destination, entries, stays, warnings }, config, currentBase };
}

export async function planContentMigration(vaultRoot: string, requested: unknown): Promise<MigrationPlan> {
  const config = await loadVaultConfig(vaultRoot);
  const destination = await normalizeMigrationDestination(vaultRoot, config, requested);
  const { plan } = await migrationEntries(vaultRoot, destination);
  return plan;
}

export async function applyContentMigration(
  vaultRoot: string,
  requested: unknown,
  isBusy: BusyChecker,
): Promise<{ destination: string; moved: MigrationEntry[] }> {
  const config = await loadVaultConfig(vaultRoot);
  const destination = await normalizeMigrationDestination(vaultRoot, config, requested);
  const { plan } = await migrationEntries(vaultRoot, destination);
  for (const entry of plan.entries) {
    if (await isBusy(entry.knowledgeBaseId)) {
      throw new MigrationRequestError(409, `知识库 ${entry.name} 仍有任务进行中，请先完成或取消再迁移`);
    }
  }
  const copied: Array<{ toPath: string }> = [];
  try {
    for (const entry of plan.entries) {
      try { await access(entry.fromPath); } catch (error: any) { if (error?.code === "ENOENT") continue; throw error; }
      // Exclusive copy: an occupied destination aborts before the config flips.
      await cp(entry.fromPath, entry.toPath, { recursive: true, force: false, errorOnExist: true });
      copied.push({ toPath: entry.toPath });
      const before = await countFiles(entry.fromPath);
      const after = await countFiles(entry.toPath);
      if (after !== before) throw new MigrationRequestError(500, `复制校验失败（源 ${before} 项，目标 ${after} 项），已保留原目录`);
    }
  } catch (error) {
    for (const entry of copied) await rm(entry.toPath, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  // Atomic config flip. The original directories stay untouched as recovery copies.
  const configPath = path.join(vaultRoot, "the-way-here.config.yaml");
  const source = await readFile(configPath, "utf8");
  const document = YAML.parseDocument(source);
  if (document.errors.length) throw new MigrationRequestError(409, "知识空间配置无法读取，已保留原目录，请修复配置后重试");
  document.setIn(["storage", "contentRoot"], destination);
  for (const stay of plan.stays) {
    if (!document.hasIn(["knowledgeBases", stay.knowledgeBaseId, "storage", "contentRoot"])) {
      document.setIn(["knowledgeBases", stay.knowledgeBaseId, "storage", "contentRoot"], "workspace");
    }
  }
  const temporary = path.join(vaultRoot, `.the-way-here.config.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, document.toString(), { encoding: "utf8", flag: "wx" });
  try {
    if (await readFile(configPath, "utf8") !== source) throw new MigrationRequestError(409, "配置已在别处更新，请刷新后重试");
    await rename(temporary, configPath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { destination, moved: plan.entries };
}
