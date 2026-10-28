import { captureCalendarDate } from "./capture-dates.js";
import { mkdir, readFile, realpath, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { cacheRootForVault } from "@the-way-here/run-manager";
import { createHash } from "node:crypto";
import { WikiIndex, pageIdForPath, linkDiaryEntities } from "@the-way-here/wiki-core";
import type { WikiRun, VaultConfig, CaptureOutputTarget } from "@the-way-here/shared";
import { isPathInside } from "../../path-policy.js";
import { CaptureInputCache } from "./capture-input-cache.js";
import { CaptureHistoryStore, captureFolder } from "./capture-history-store.js";
import { ContentRequestError } from "./page-writer.js";
import { ImportStore } from "../imports/import-store.js";

/** Only the server writes the result; paths and original words never come from the model. */
export class CaptureRecordStore {
  constructor(private readonly vaultRoot: string) {}

  async prepare(config: VaultConfig, target: CaptureOutputTarget): Promise<CaptureOutputTarget> {
    const folder = captureFolder(target.folder || "随手记");
    if (!target.captureId) return { ...target, folder, diaryDate: captureCalendarDate(new Date(), target.diaryTimeZone), diaryDatePolicy: "saved-at" };
    const state = await new CaptureHistoryStore(this.vaultRoot).list(config.knowledgeBaseId);
    const entry = state.entries.find(e => e.id === target.captureId);
    if (!entry || entry.revision !== target.captureRevision || entry.text !== target.originalText) throw new ContentRequestError(409, "草稿已经变化，请暂存后重新整理");
    if (entry.status !== "saved") return { ...target, folder: entry.folder, diaryDate: captureCalendarDate(new Date(), target.diaryTimeZone), diaryDatePolicy: "saved-at" };
    if (!entry.storedPath || !entry.fileHash) throw new ContentRequestError(409, "原日记不可用，请新建记录");
    const file = await this.safeFile(config, entry.storedPath);
    const hash = createHash("sha256").update(await readFile(file)).digest("hex");
    if (hash !== entry.fileHash) throw new ContentRequestError(409, "原日记已被修改，请先查看文件；草稿已保留");
    return { ...target, diaryDate: entry.diaryDate, diaryDatePolicy: undefined, folder: entry.folder, storedPath: entry.storedPath, expectedFileHash: hash };
  }

  private async safeFile(config: VaultConfig, storedPath: string) {
    const root = await realpath(this.vaultRoot), sources = path.resolve(root, config.paths.sources), file = path.resolve(root, storedPath);
    if (!isPathInside(root, sources) || !isPathInside(sources, file) || await realpath(file) !== file) throw new ContentRequestError(409, "原日记位置已变化，请先查看文件");
    return file;
  }

  async materialize(run: WikiRun): Promise<{ pageId: string; savedAt: string; diaryDate: string; content: string }> {
    const target = run.outputTarget;
    if (target?.kind !== "life-record" || !target.captureId) return this.writeRecord(run);
    return new CaptureHistoryStore(this.vaultRoot).mutate(run.knowledgeBaseId, async state => {
      const entry = state.entries.find(e => e.id === target.captureId);
      if (!entry || entry.revision !== target.captureRevision) throw new ContentRequestError(409, "草稿已修改或删除，整理结果未覆盖它");
      const saved = await this.writeRecord(run);
      if (entry.status === "saved") entry.versions = [...(entry.versions || []), { savedAt: entry.updatedAt, text: entry.originalText || "", content: entry.content || "" }];
      Object.assign(entry, { status: "saved", text: target.originalText, originalText: target.originalText, content: saved.content, diaryDate: saved.diaryDate, pageId: saved.pageId, storedPath: saved.storedPath, fileHash: saved.fileHash, savedRunId: run.id, updatedAt: saved.savedAt, revision: entry.revision + 1 });
      return saved;
    });
  }

  private async writeRecord(run: WikiRun): Promise<{ pageId: string; savedAt: string; storedPath: string; fileHash: string; diaryDate: string; content: string }> {
    const target = run.outputTarget;
    if (target?.kind !== "life-record") throw new Error("记录目标无效");
    const answer = run.result?.finalAnswer?.trim();
    if (!answer || answer.length > 100_000 || !/^# [^\n]+\n+\S/.test(answer)) throw new Error("整理结果不完整，原话已保留，请重新整理");
    const root = await realpath(this.vaultRoot);
    const sources = path.resolve(root, run.configSnapshot.paths.sources);
    if (!isPathInside(root, sources)) throw new Error("记录目录超出工作区");
    // Validate every existing parent before creating children, including symlinks.
    let folder = root;
    for (const part of [...path.relative(root, sources).split(path.sep), ...captureFolder(target.folder || "随手记").split("/")]) {
      folder = path.join(folder, part);
      await mkdir(folder).catch((error) => { if (error.code !== "EEXIST") throw error; });
      const resolved = await realpath(folder);
      if (!isPathInside(root, resolved) || resolved !== folder) throw new Error("记录目录不能使用符号链接");
    }
    const manifestFolder = path.join(sources, ".imports");
    await mkdir(manifestFolder).catch(error => { if (error.code !== "EEXIST") throw error; });
    if (await realpath(manifestFolder) !== manifestFolder) throw new Error("记录登记目录不能使用符号链接");
    const suffix = createHash("sha256").update(run.id).digest("hex").slice(0, 16);
    const saveInstant = run.result?.outputSaveStartedAt || run.result?.outputSavedAt || new Date().toISOString();
    const date = target.diaryDatePolicy === "saved-at" ? captureCalendarDate(saveInstant, target.diaryTimeZone) : target.diaryDate || captureCalendarDate(run.createdAt, target.diaryTimeZone);
    const title = `随手记 ${date} ${suffix}`;
    const file = target.storedPath ? await this.safeFile(run.configSnapshot, target.storedPath) : path.join(folder, `${title}.md`);
    const datedAnswer = target.diaryDatePolicy === "saved-at" ? answer.replace(/^# \d{4}-\d{2}-\d{2}(?=[ \t]|$)/, `# ${date}`) : answer;
    const diary = linkDiaryEntities(datedAnswer, target.entityLinks || []);
    const markdown = `${diary}\n`;
    // Persist input before the knowledge file, so a cache write failure cannot discard the only input.
    await new CaptureInputCache(root).write(run.knowledgeBaseId, run.id, target.originalText);
    if (target.storedPath) {
      const current = await readFile(file, "utf8");
      if (createHash("sha256").update(current).digest("hex") !== target.expectedFileHash) throw new ContentRequestError(409, "整理期间原日记被修改，未覆盖文件；原话已保留");
      // Archive the previous file before updating, including its verbatim original text.
      const archive = path.join(cacheRootForVault(root), "capture-versions", createHash("sha256").update(run.knowledgeBaseId).digest("hex"));
      await mkdir(archive, { recursive: true });
      await writeFile(path.join(archive, `${suffix}.md`), current, { encoding: "utf8", mode: 0o600 });
      const temporary = `${file}.${suffix}.tmp`;
      await writeFile(temporary, markdown, {encoding:"utf8",flag:"wx"});
      await rename(temporary, file);
    } else try { await writeFile(file, markdown, { encoding: "utf8", flag: "wx" }); }
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
    return { pageId: pageIdForPath(relativePath, run.configSnapshot), savedAt: saveInstant, diaryDate: date, content: diary, storedPath: relativePath, fileHash: createHash("sha256").update(markdown).digest("hex") };
  }
}
