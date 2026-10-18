import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cacheRootForVault } from "@the-way-here/run-manager";

interface CachedInput {
  version: 1;
  knowledgeBaseId: string;
  runId: string;
  originalText: string;
  versionTexts: string[];
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Optional recovery material, never indexed as knowledge. Deleting it must not break saved diaries. */
export class CaptureInputCache {
  constructor(private readonly root: string) {}
  file(id: string, runId: string): string {
    return path.join(cacheRootForVault(this.root), "capture-inputs", hash(id), `${hash(runId)}.json`);
  }
  async read(id: string, runId: string): Promise<CachedInput | undefined> {
    try {
      const value = JSON.parse(await readFile(this.file(id, runId), "utf8")) as CachedInput;
      if (value.version !== 1 || value.knowledgeBaseId !== id || value.runId !== runId || typeof value.originalText !== "string" || !Array.isArray(value.versionTexts) || value.versionTexts.some(text => typeof text !== "string")) throw new Error("输入缓存内容无效");
      return value;
    } catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
  }
  async write(id: string, runId: string, originalText: string, versionTexts: string[] = []): Promise<void> {
    const file = this.file(id, runId);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, knowledgeBaseId: id, runId, originalText, versionTexts } satisfies CachedInput), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  }
}
