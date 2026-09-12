import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
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
    const manifest: SnapshotManifest = { files: {} };
    for (const relativePath of files.sort()) {
      const source = path.join(this.vaultRoot, relativePath);
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
    const current = new Set(currentFiles);
    const paths = new Set([...Object.keys(manifest.files), ...currentFiles]);
    const changes: RunFileChange[] = [];
    for (const relativePath of [...paths].sort()) {
      if (relativePath.startsWith(`${config.paths.sources}/${EXTERNAL_SOURCE_FOLDER}/`)) continue;
      const beforeMeta = manifest.files[relativePath];
      const afterExists = current.has(relativePath);
      if (!beforeMeta && afterExists) {
        changes.push({ path: relativePath, kind: "added", diff: await this.createDiff(directory, relativePath, false, true) });
      } else if (beforeMeta && !afterExists) {
        changes.push({ path: relativePath, kind: "deleted", diff: await this.createDiff(directory, relativePath, true, false) });
      } else if (beforeMeta && afterExists) {
        const afterMeta = await hashFile(path.join(this.vaultRoot, relativePath));
        if (afterMeta.sha256 !== beforeMeta.sha256) {
          changes.push({ path: relativePath, kind: "modified", diff: await this.createDiff(directory, relativePath, true, true) });
        }
      }
    }
    return changes;
  }

  private async createDiff(directory: string, relativePath: string, hasBefore: boolean, hasAfter: boolean): Promise<string | undefined> {
    if (!/\.(md|txt|json|ya?ml|ts|tsx|js|jsx|py)$/i.test(relativePath)) return undefined;
    const beforePath = path.join(directory, "before", relativePath);
    const afterPath = path.join(this.vaultRoot, relativePath);
    const before = hasBefore ? await readFile(beforePath, "utf8") : "";
    const after = hasAfter ? await readFile(afterPath, "utf8") : "";
    if (before.length + after.length > 2_000_000) return "文件较大，已省略文本差异。";
    return createTwoFilesPatch(`before/${relativePath}`, `after/${relativePath}`, before, after, "任务开始", "任务结束");
  }

}
