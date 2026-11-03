import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import type { MobileManifest, VaultConfig } from "@the-way-here/shared";
import { MobileFiles } from "./files.js";
import { CapturePreferencesStore } from "../content/capture-preferences-store.js";

export async function copyCaptureDirectoryPreference(sourceRoot: string, sourceId: string, destinationRoot: string, destinationId: string): Promise<void> {
  const folder = await new CapturePreferencesStore(sourceRoot).get(sourceId);
  if (folder !== undefined) await new CapturePreferencesStore(destinationRoot).set(destinationId, folder, "legacy-import");
}

/** Explicitly invoked from the native directory picker. Originals are untouched;
 * only the selected library and shared engine are copied. No caches, settings,
 * keys, external-folder contents, other libraries or repository metadata enter iCloud.
 */
export async function prepareMobileWorkspace(root: string, config: VaultConfig, destinationParent: string, companionshipStartedAt?: string): Promise<string> {
  if (config.knowledgeBaseId === "demo") throw new Error("演示空间不能转成个人 iCloud 空间");
  const parent = await realpath(destinationParent);
  if (!(await lstat(parent)).isDirectory()) throw new Error("请选择 iCloud Drive 中的 Spaces 文件夹");
  const sourceRoot = await realpath(root);
  // A prepared directory is an independent portable library, never an alias of
  // its source. Keep content paths unchanged; only machine-owned IDs are rebound.
  const portableId = randomUUID();
  const destination = path.join(parent, `${config.knowledgeBaseId}-${portableId}`);
  if (destination === sourceRoot || destination.startsWith(sourceRoot + path.sep) || sourceRoot.startsWith(destination + path.sep)) throw new Error("同步目标不能与当前工作区互相包含");
  await mkdir(destination, { recursive: false });
  const source = new MobileFiles(sourceRoot);
  async function copy(relative: string) {
    const from = await source.resolve(relative), to = path.join(destination, relative);
    await cp(from, to, { recursive: true, errorOnExist: true, force: false, filter: async file => {
      const name = path.basename(file);
      if ([".git", ".runtime", ".DS_Store", "__pycache__", "node_modules", ".external-sources", "外部来源"].includes(name)) return false;
      if ((await lstat(file)).isSymbolicLink()) throw new Error("同步拷贝包含符号链接，已停止；原空间未修改");
      return true;
    } });
  }
  try {
    await copy(config.paths.wiki); await copy(config.paths.sources);
    await copy(config.paths.skills); await copy(config.paths.tools);
    const prediction = path.posix.join(path.posix.dirname(config.paths.wiki), "predictions/state.json");
    const outputFiles = new MobileFiles(destination);
    try {
      const predictionState = await source.json(prediction, 32 * 1024 * 1024) as Record<string, unknown> | undefined;
      if (predictionState !== undefined) {
        if (!predictionState || Array.isArray(predictionState) || predictionState.knowledgeBaseId !== config.knowledgeBaseId) throw new Error("预测结果与当前知识库不匹配，已停止复制；原空间未修改。");
        await outputFiles.write(prediction, { ...predictionState, knowledgeBaseId: portableId }, true);
      }
    } catch (error: any) { if (error.code !== "ENOENT") throw error; }
    const raw = YAML.parse(await readFile(await source.resolve("the-way-here.config.yaml"), "utf8"));
    const selected = raw.knowledgeBases?.[config.knowledgeBaseId] || {};
    const exportConfig = { version: 3, name: config.name, adapter: config.adapter, defaultKnowledgeBase: portableId,
      paths: { skills: config.paths.skills, tools: config.paths.tools, agentInstructions: "AGENTS.md" },
      knowledgeBases: { [portableId]: { name: config.name, description: selected.description, paths: { wiki: config.paths.wiki, sources: config.paths.sources } } },
      agents: { defaultRuntime: "auto", runtimes: { codex: { enabled: true, command: "codex", transport: "stdio" }, pi: { enabled: true, providers: [] } } },
      validation: config.validation,
    };
    await writeFile(path.join(destination, "the-way-here.config.yaml"), YAML.stringify(exportConfig), { flag: "wx" });
    // Preserve the existing public routing protocol, not source-note content.
    const instructions = await source.resolve(config.paths.agentInstructions);
    await cp(instructions, path.join(destination, "AGENTS.md"), { errorOnExist: true, force: false });
    const manifest: MobileManifest = { version: 1, knowledgeBaseId: portableId, name: config.name, sourcesPath: config.paths.sources, wikiPath: config.paths.wiki, createdAt: new Date().toISOString(), readOnly: false };
    await new MobileFiles(destination).write("mobile-space.json", manifest, true);
    await new MobileFiles(destination).write(".mobile/identity-state.json", { knowledgeBaseId: portableId, name: config.name }, true);
    if (companionshipStartedAt) await new MobileFiles(destination).write(".mobile/companionship.json", { startedAt: companionshipStartedAt }, true);
    // This protected choice stays in local app state, outside the shared copy.
    await copyCaptureDirectoryPreference(sourceRoot, config.knowledgeBaseId, destination, portableId);
    return destination;
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}
