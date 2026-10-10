import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { createTwoFilesPatch } from "diff";
import { EXTERNAL_SOURCE_FOLDER, type RunFileChange, type VaultConfig } from "@the-way-here/shared";
import { atomicWriteJson } from "./run-record.js";

interface SnapshotManifest {
  files: Record<string, { sha256: string; size: number }>;
}

async function hashFile(filePath: string): Promise<{ sha256: string; size: number }> {
  const content = await readFile(filePath);
  return { sha256: createHash("sha256").update(content).digest("hex"), size: content.length };
}

function snapshotPatterns(config: VaultConfig): string[] {
  return [
    config.paths.agentInstructions,
    `${config.paths.wiki}/**/*`,
    `${config.paths.skills}/**/*`,
    `${config.paths.tools}/**/*`,
    `${config.paths.sources}/**/*`,
    // Directory sync owns these references; they are not Agent edits or source copies.
    `!${config.paths.sources}/${EXTERNAL_SOURCE_FOLDER}/**/*`,
  ];
}

export class RunSnapshots {
  constructor(private readonly vaultRoot: string) {}

  async snapshot(directory: string, config: VaultConfig): Promise<void> {
    const files = await fg(snapshotPatterns(config), {
      cwd: this.vaultRoot,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: false,
    });
    files.push(...await this.localFiles(config));
    const manifest: SnapshotManifest = { files: {} };
    for (const relativePath of files.sort()) {
      const source = this.sourcePath(relativePath, config);
      const destination = path.join(directory, "before", relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
      manifest.files[relativePath] = await hashFile(source);
    }
    await atomicWriteJson(path.join(directory, "manifest.json"), manifest);
  }

  async collectChanges(directory: string, config: VaultConfig): Promise<RunFileChange[]> {
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as SnapshotManifest;
    const currentFiles = await fg(snapshotPatterns(config), {
      cwd: this.vaultRoot,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: false,
    });
    currentFiles.push(...await this.localFiles(config));
    const current = new Set(currentFiles);
    const paths = new Set([...Object.keys(manifest.files), ...currentFiles]);
    const changes: RunFileChange[] = [];
    for (const relativePath of [...paths].sort()) {
      if (relativePath.startsWith(`${config.paths.sources}/${EXTERNAL_SOURCE_FOLDER}/`)) continue;
      const beforeMeta = manifest.files[relativePath];
      const afterExists = current.has(relativePath);
      if (!beforeMeta && afterExists) {
        changes.push({ path: relativePath.startsWith("@local/") ? this.sourcePath(relativePath, config) : relativePath, kind: "added", diff: await this.createDiff(directory, relativePath, false, true, config) });
      } else if (beforeMeta && !afterExists) {
        changes.push({ path: relativePath.startsWith("@local/") ? this.sourcePath(relativePath, config) : relativePath, kind: "deleted", diff: await this.createDiff(directory, relativePath, true, false, config) });
      } else if (beforeMeta && afterExists) {
        const afterMeta = await hashFile(this.sourcePath(relativePath, config));
        if (afterMeta.sha256 !== beforeMeta.sha256) {
          changes.push({ path: relativePath.startsWith("@local/") ? this.sourcePath(relativePath, config) : relativePath, kind: "modified", diff: await this.createDiff(directory, relativePath, true, true, config) });
        }
      }
    }
    return changes;
  }

  private sourcePath(key: string, config: VaultConfig): string {
    if (!key.startsWith("@local/")) return path.join(this.vaultRoot, key);
    const [, id, ...parts] = key.split("/");
    const connection = config.sourceConnections?.find(item => item.id === id && item.aiWritable);
    if (!connection) throw new Error("任务目录授权不存在");
    const target = path.resolve(connection.path, parts.join("/"));
    if (!target.startsWith(`${connection.path}${path.sep}`)) throw new Error("任务来源路径越界");
    return target;
  }

  private async localFiles(config: VaultConfig): Promise<string[]> {
    const files: string[] = [];
    for (const directory of config.sourceConnections || []) {
      if (!directory.aiWritable) continue;
      if (await realpath(directory.path) !== directory.path) throw new Error("本地目录位置已变化，请重新打开");
      for (const file of await fg(["**/*.md", "**/*.txt"], { cwd: directory.path, onlyFiles: true, followSymbolicLinks: false })) {
        const target = path.join(directory.path, file);
        if (!(await realpath(target)).startsWith(`${directory.path}${path.sep}`) || (await stat(target)).size > 2 * 1024 * 1024) continue;
        files.push(`@local/${directory.id}/${file}`);
      }
    }
    return files;
  }

  private async createDiff(directory: string, relativePath: string, hasBefore: boolean, hasAfter: boolean, config: VaultConfig): Promise<string | undefined> {
    if (!/\.(md|txt|json|ya?ml|ts|tsx|js|jsx|py)$/i.test(relativePath)) return undefined;
    const beforePath = path.join(directory, "before", relativePath);
    const afterPath = this.sourcePath(relativePath, config);
    const before = hasBefore ? await readFile(beforePath, "utf8") : "";
    const after = hasAfter ? await readFile(afterPath, "utf8") : "";
    if (before.length + after.length > 2_000_000) return "文件较大，已省略文本差异。";
    return createTwoFilesPatch(`before/${relativePath}`, `after/${relativePath}`, before, after, "任务开始", "任务结束");
  }

}
