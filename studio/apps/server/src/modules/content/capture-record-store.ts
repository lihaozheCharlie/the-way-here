import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { WikiIndex, pageIdForPath } from "@the-way-here/wiki-core";
import type { WikiRun } from "@the-way-here/shared";
import { isPathInside } from "../../path-policy.js";
import { ImportStore } from "../imports/import-store.js";

/** Only the server writes the result; paths and original words never come from the model. */
export class CaptureRecordStore {
  constructor(private readonly vaultRoot: string) {}

  async materialize(run: WikiRun): Promise<{ pageId: string; savedAt: string }> {
    const target = run.outputTarget;
    if (target?.kind !== "life-record") throw new Error("记录目标无效");
    const answer = run.result?.finalAnswer?.trim();
    if (!answer || answer.length > 100_000 || !/^# [^\n]+\n+\S/.test(answer)) throw new Error("整理结果不完整，原话已保留，请重新整理");
    const root = await realpath(this.vaultRoot);
    const sources = path.resolve(root, run.configSnapshot.paths.sources);
    if (!isPathInside(root, sources)) throw new Error("记录目录超出工作区");
    // Validate every existing parent before creating children, including symlinks.
    let folder = root;
    for (const part of [...path.relative(root, sources).split(path.sep), "随手记"]) {
      folder = path.join(folder, part);
      await mkdir(folder).catch((error) => { if (error.code !== "EEXIST") throw error; });
      const resolved = await realpath(folder);
      if (!isPathInside(root, resolved) || resolved !== folder) throw new Error("记录目录不能使用符号链接");
    }
    const manifestFolder = path.join(sources, ".imports");
    await mkdir(manifestFolder).catch(error => { if (error.code !== "EEXIST") throw error; });
    if (await realpath(manifestFolder) !== manifestFolder) throw new Error("记录登记目录不能使用符号链接");
    const suffix = createHash("sha256").update(run.id).digest("hex").slice(0, 16);
    const title = `随手记 ${run.createdAt.slice(0, 10)} ${suffix}`;
    const file = path.join(folder, `${title}.md`);
    const markdown = `${answer}\n\n---\n\n## 输入原话\n\n${target.originalText}\n`;
    try { await writeFile(file, markdown, { encoding: "utf8", flag: "wx" }); }
    catch (error: any) {
      if (error.code !== "EEXIST" || await readFile(file, "utf8") !== markdown) throw new Error("记录文件已存在或无法保存；未覆盖已有记录");
    }
    const relativePath = path.relative(root, file).split(path.sep).join("/");
    const index = new WikiIndex(root, run.knowledgeBaseId);
    // Registration uses the frozen configuration, even if the active library changed.
    index.config = run.configSnapshot;
    const imports = new ImportStore({ vaultRoot: root, index, events: { broadcast() {} } });
    if (!(await imports.list()).some(batch => batch.files.some(item => item.storedPath === relativePath))) {
      await imports.trackCreatedSource({ relativePath, title, markdown });
    }
    return { pageId: pageIdForPath(relativePath, run.configSnapshot), savedAt: new Date().toISOString() };
  }
}
