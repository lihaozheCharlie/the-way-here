import { captureCalendarDate } from "./capture-dates.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { RunStore, stateRootForVault } from "@the-way-here/run-manager";
import type { CaptureEntry, CaptureHistory } from "@the-way-here/shared";
import { CapturePreferencesStore } from "./capture-preferences-store.js";
import { CaptureInputCache } from "./capture-input-cache.js";
import { ContentRequestError } from "./page-writer.js";

type State = CaptureHistory & { deleted: string[] };
const locks = new Map<string, Promise<unknown>>();
export function captureFolder(value: unknown): string {
  if (typeof value !== "string" || value.length > 500 || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith("/") || value.split("/").some(p => !p || p.startsWith(".") || p === "外部来源")) throw new ContentRequestError(400, "请选择生活记录中的有效目录");
  return value;
}
export class CaptureHistoryStore {
  constructor(private root: string) {}
  private file(id: string) { return path.join(stateRootForVault(this.root), "captures", `${createHash("sha256").update(id).digest("hex")}.json`); }
  async list(id: string): Promise<State> {
    const preferredFolder = await new CapturePreferencesStore(this.root).get(id);
    try {
      const state: State = JSON.parse(await readFile(this.file(id), "utf8"));
      state.defaultFolder = preferredFolder ?? (await new CapturePreferencesStore(this.root).set(id, captureFolder(state.defaultFolder), "legacy-import")).defaultFolder;
      const cache = new CaptureInputCache(this.root);
      for (const entry of state.entries) {
        if (entry.status !== "saved" || !entry.savedRunId) continue;
        const input = await cache.read(id, entry.savedRunId);
        // Legacy raw fields remain readable. Missing caches fall back to the saved diary for editing.
        entry.originalText ??= input?.originalText;
        entry.text ??= entry.originalText ?? entry.content ?? "";
        entry.versions?.forEach((version, i) => { version.text ??= input?.versionTexts[i] ?? ""; });
      }
      return state;
    }
    catch (error: any) { if (error.code !== "ENOENT") throw error; return { entries: [], defaultFolder: preferredFolder ?? "随手记", deleted: [] }; }
  }
  async mutate<T>(id: string, action: (state: State) => Promise<T>): Promise<T> {
    const file = this.file(id), previous = locks.get(file) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const state = await this.list(id);
      const result = await action(state);
      const stored = structuredClone(state);
      const cache = new CaptureInputCache(this.root);
      for (const entry of stored.entries) {
        if (entry.status !== "saved" || !entry.savedRunId) continue;
        if (entry.originalText !== undefined) await cache.write(id, entry.savedRunId, entry.originalText, (entry.versions || []).map(version => version.text));
        // Unsaved edits to a saved entry are protected drafts, not disposable cache material.
        if (entry.text === entry.originalText) delete (entry as Partial<CaptureEntry>).text;
        delete entry.originalText;
        entry.versions?.forEach(version => { delete (version as Partial<typeof version>).text; });
      }
      await mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(stored), { encoding: "utf8", mode: 0o600 });
      await rename(temp, file);
      return result;
    });
    locks.set(file, task);
    try { return await task; } finally { if (locks.get(file) === task) locks.delete(file); }
  }
  async importCompleted(id: string, index: import("@the-way-here/wiki-core").WikiIndex) {
    const runs = (await new RunStore(this.root).list()).filter(run => run.knowledgeBaseId === id && run.status === "completed" && run.outputTarget?.kind === "life-record" && run.result?.outputPageId);
    const known = await this.list(id);
    const missing = runs.filter(run => !known.entries.some(e => e.savedRunId === run.id) && !known.deleted.includes(run.outputTarget?.kind === "life-record" && run.outputTarget.captureId || `run-${createHash("sha256").update(run.id).digest("hex").slice(0,32)}`));
    if (!missing.length) return;
    await this.mutate(id, async state => {
      for (const run of missing) {
        const target = run.outputTarget;
        if (target?.kind !== "life-record") continue;
        const recordId = target.captureId || `run-${createHash("sha256").update(run.id).digest("hex").slice(0,32)}`;
        if (state.entries.some(e => e.id === recordId || e.savedRunId === run.id) || state.deleted.includes(recordId)) continue;
        const page = index.get(run.result!.outputPageId!);
        if (!page || !page.isSource || page.externalSource) continue;
        const pieces = page.markdown.split("\n\n---\n\n## 输入原话\n\n");
        const input = await new CaptureInputCache(this.root).read(id, run.id);
        const originalText = pieces.length === 2 ? pieces[1]!.trimEnd() : input?.originalText;
        const fileHash = createHash("sha256").update(page.markdown).digest("hex");
        state.entries.push({ id: recordId, revision: 1, createdAt: run.createdAt, updatedAt: run.result?.outputSavedAt || run.updatedAt, diaryDate: target.diaryDatePolicy === "saved-at" ? captureCalendarDate(run.result?.outputSavedAt || run.result?.outputSaveStartedAt || run.createdAt, target.diaryTimeZone) : target.diaryDate || captureCalendarDate(run.createdAt, target.diaryTimeZone), text: originalText ?? pieces[0] ?? "", originalText, content: pieces[0], status: "saved", folder: path.posix.dirname(path.posix.relative(index.config.paths.sources, page.relativePath)), pageId: page.id, storedPath: page.relativePath, fileHash, savedRunId: run.id });
      }
      state.entries.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }
  async put(id: string, body: any): Promise<CaptureEntry> {
    if (!body || typeof body.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(body.id) || typeof body.text !== "string" || body.text.length > 50_000 || !Number.isInteger(body.revision) || body.revision < 0 || typeof body.diaryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.diaryDate) || !Number.isFinite(Date.parse(body.diaryDate)) || new Date(body.diaryDate).toISOString().slice(0,10) !== body.diaryDate) throw new ContentRequestError(400, "草稿内容无效");
    const folder = captureFolder(body.folder);
    return this.mutate(id, async state => {
      const existing = state.entries.find(e => e.id === body.id);
      if (state.deleted.includes(body.id) || (existing?.revision || 0) !== body.revision) throw new ContentRequestError(409, "这条记录已在其他窗口修改，请重新从历史记录打开；当前文字仍已留在本机");
      const now = new Date().toISOString();
      const entry: CaptureEntry = { ...existing, id: body.id, text: body.text, folder: existing?.status === "saved" ? existing.folder : folder, diaryDate: existing?.diaryDate || body.diaryDate, status: existing?.status || "draft", revision: body.revision + 1, createdAt: existing?.createdAt || now, updatedAt: now };
      state.entries = [entry, ...state.entries.filter(e => e.id !== entry.id)];
      return entry;
    });
  }
  async remove(id: string, entryId: string, revision: unknown) {
    return this.mutate(id, async state => {
      const entry = state.entries.find(e => e.id === entryId);
      if (!entry || entry.revision !== revision) throw new ContentRequestError(409, "历史记录已经变化，请刷新后重试");
      state.entries = state.entries.filter(e => e.id !== entryId);
      state.deleted.push(entryId);
      return { ok: true };
    });
  }
  async setDefault(id: string, folder: unknown) { return new CapturePreferencesStore(this.root).set(id, captureFolder(folder)); }
}
