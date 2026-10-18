import { CaptureInputCache } from "../modules/content/capture-input-cache.js";
import { mkdtemp, readFile, realpath, rm, writeFile, readdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { stateRootForVault, cacheRootForVault } from "@the-way-here/run-manager";
import type { WikiRun } from "@the-way-here/shared";
import type { AgentRuntimeEnvelope, AgentRuntimeProvider } from "./agent-runtime/types.js";
import { KnowledgeRuntime } from "./knowledge-runtime.js";
import { RunCoordinator } from "./run-coordinator.js";
import { CaptureRecordStore } from "../modules/content/capture-record-store.js";
import { ImportStore } from "../modules/imports/import-store.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function fixture(early = false) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-capture-run-")));
  await writeFile(path.join(root, "the-way-here.config.yaml"), "version: 3\nknowledgeBases:\n  demo:\n    paths:\n      wiki: demo/wiki\n      sources: demo/sources\n  other:\n    paths:\n      wiki: other/wiki\n      sources: other/sources\n");
  const knowledge = await KnowledgeRuntime.create(root, "demo");
  const listeners = new Set<(event: AgentRuntimeEnvelope) => void>();
  const ref = { runtimeId: "codex" as const, sessionId: "session", turnId: "turn" };
  const finish = (answer = "# 一次散步\n\n今天去公园走了一会儿。") => listeners.forEach(listener => listener({ ref, event: { type: "turn.completed", outcome: "completed", finalAnswer: answer } }));
  const start = vi.fn(async () => { if (early) finish(); return ref; });
  const provider = { subscribe: (fn: (event: AgentRuntimeEnvelope) => void) => { listeners.add(fn); return () => listeners.delete(fn); }, resolve: async () => ({ runtimeId: "codex", runtime: { start }, model: { id: "test-model" }, effort: "high" }), close() {} } as unknown as AgentRuntimeProvider;
  const coordinator = new RunCoordinator(knowledge, provider, { error: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger);
  cleanups.push(async () => { coordinator.close(); await knowledge.close(); await rm(root, { recursive:true, force:true }); await rm(stateRootForVault(root), { recursive:true, force:true }); });
  const request = { knowledgeBaseId: "demo", mode: "read" as const, prompt: "整理记录", outputTarget: { kind: "life-record" as const, label: "随手记", originalText: "嗯，今天去公园走了一会儿。" } };
  return { root, knowledge, coordinator, request, start, finish };
}

it("organizes anonymous words, saves in the bound library, and never overwrites on recovery", async () => {
  const { root, knowledge, coordinator, request, start, finish } = await fixture();
  const run = await coordinator.start(request);
  expect(start.mock.calls[0]).toBeDefined();
  expect((start.mock.calls as unknown[][])[0]![0]).toMatchObject({ mode:"read", strictReadOnly:true });
  await knowledge.activate("other");
  finish();
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
  const saved = (await coordinator.get(run.id))!;
  expect(saved.result?.outputPageId).toBeTruthy();
  expect(knowledge.index.list({ sources:true })).toHaveLength(0);
  const files = await readdir(path.join(root, "demo/sources/随手记"));
  expect(files).toHaveLength(1);
  const file = path.join(root, "demo/sources/随手记", files[0]!);
  expect(await readFile(file, "utf8")).not.toContain("## 输入原话");
  expect((await new CaptureInputCache(root).read("demo", run.id))?.originalText).toBe(request.outputTarget.originalText);
  const store = new CaptureRecordStore(root);
  await store.materialize(saved);
  expect(await readdir(path.dirname(file))).toHaveLength(1);
  await knowledge.activate("demo");
  expect((await new ImportStore(knowledge).list()).filter(batch => batch.targetFolder === "随手记")).toHaveLength(1);
  await writeFile(file, "用户修改后的记录");
  await expect(store.materialize(saved)).rejects.toThrow("未覆盖");
  expect(await readFile(file, "utf8")).toBe("用户修改后的记录");
});

it("captures a completion emitted before runtime startup returns", async () => {
  const { coordinator, request } = await fixture(true);
  const run = await coordinator.start(request);
  expect(run.status).toBe("completed");
  expect(run.result?.outputSavedAt).toBeTruthy();
});

it("rejects empty input and write mode before invoking a model; malformed output creates no file", async () => {
  const { root, coordinator, request, start, finish } = await fixture();
  await expect(coordinator.start({ ...request, outputTarget: { ...request.outputTarget, originalText: " " } })).rejects.toThrow("目标无效");
  await expect(coordinator.start({ ...request, mode: "write" })).rejects.toThrow("只读");
  expect(start).not.toHaveBeenCalled();
  const run = await coordinator.start(request);
  finish("模型拒绝或未给出正文");
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("failed"));
  await expect(readdir(path.join(root, "demo/sources/随手记"))).rejects.toThrow();
});

it("does not follow a capture folder symlink", async () => {
  const { root, coordinator, request } = await fixture();
  const run = await coordinator.start(request);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.join(root, "demo/sources"), { recursive:true });
  await symlink(os.tmpdir(), path.join(root, "demo/sources/随手记"));
  await expect(new CaptureRecordStore(root).materialize({ ...run, result: { finalAnswer:"# 标题\n\n正文" } } as WikiRun)).rejects.toThrow("符号链接");
});

it("writes a dated diary with frozen existing identities and unchanged original words", async () => {
  const { mkdir } = await import("node:fs/promises");
  const { root, knowledge, coordinator, request, start, finish } = await fixture();
  const entityFolder = path.join(root, "demo/wiki/07 人物与城市");
  await mkdir(entityFolder, { recursive: true });
  await writeFile(path.join(entityFolder, "林舟.md"), "---\naliases: [小林]\n---\n# 林舟\n\n匿名人物。\n");
  await knowledge.index.rebuild();
  const originalText = "嗯，啊，今天和小林去公园。呃，后来聊了很久。";
  const run = await coordinator.start({ ...request, outputTarget: { ...request.outputTarget, diaryDate: "2026-10-16", originalText } });
  expect(run.outputTarget).toMatchObject({ diaryDate: "2026-10-16", entityLinks: [{ title: "林舟", matchedNames: ["小林"] }] });
  const input = (start.mock.calls as unknown[][])[0]![0] as { prompt: string };
  expect(input.prompt).toContain("林舟"); expect(input.prompt).toContain("不压缩成摘要");
  await knowledge.activate("other");
  finish("# 2026-10-16 日记\n\n今天和小林去公园，后来聊了很久。");
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
  const files = await readdir(path.join(root, "demo/sources/随手记"));
  expect(files[0]).toContain("2026-10-16");
  const markdown = await readFile(path.join(root, "demo/sources/随手记", files[0]!), "utf8");
  expect(markdown).toContain("[[wiki/07 人物与城市/林舟|小林]]");
  expect(markdown).not.toContain("## 输入原话");
  expect((await new CaptureInputCache(root).read("demo", run.id))?.originalText).toBe(originalText);
  await knowledge.activate("demo");
  const saved = (await coordinator.get(run.id))!;
  const page = knowledge.index.get(saved.result!.outputPageId!);
  expect(page?.outgoingLinks.some(link => link.resolvedId === "wiki/07 人物与城市/林舟")).toBe(true);
});

it("persists drafts per library, saves in a chosen folder and supplements the same diary with an archive", async () => {
  const { CaptureHistoryStore } = await import("../modules/content/capture-history-store.js");
  const { root, knowledge, coordinator, request, finish } = await fixture();
  const history = new CaptureHistoryStore(root);
  const entry = await history.put("demo", { id:"anonymous-draft", revision:0, text:request.outputTarget.originalText, folder:"日记/今年", diaryDate:"2026-10-17" });
  expect((await history.list("other")).entries).toHaveLength(0);
  await expect(history.put("demo", { ...entry, revision:0 })).rejects.toThrow("其他窗口修改");
  await history.setDefault("demo", "日记/今年");
  expect((await new CaptureHistoryStore(root).list("demo")).defaultFolder).toBe("日记/今年");
  const run = await coordinator.start({ ...request, outputTarget:{ ...request.outputTarget, captureId:entry.id, captureRevision:entry.revision, diaryDate:entry.diaryDate, folder:entry.folder } });
  finish();
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
  const saved = (await history.list("demo")).entries[0]!;
  expect(saved.status).toBe("saved"); expect(saved.storedPath).toContain("日记/今年/");
  const before = await readFile(path.join(root,saved.storedPath!),"utf8");
  const changed = await history.put("demo", { ...saved, text:saved.text+"\n后来还看了晚霞。" });
  const second = await coordinator.start({ ...request, outputTarget:{ ...request.outputTarget, originalText:changed.text, captureId:changed.id, captureRevision:changed.revision, folder:"其他目录" } });
  finish("# 一次散步\n\n今天去公园走了一会儿，后来还看了晚霞。");
  await vi.waitFor(async () => expect((await coordinator.get(second.id))?.status).toBe("completed"));
  const updated = (await history.list("demo")).entries[0]!;
  expect(updated.pageId).toBe(saved.pageId); expect(updated.versions?.[0]?.text).toBe(saved.originalText);
  expect(await readdir(path.dirname(path.join(root,updated.storedPath!)))).toHaveLength(1);
  const archives = path.join(cacheRootForVault(root),"capture-versions");
  const subfolder = (await readdir(archives))[0]!;
  const archive = (await readdir(path.join(archives,subfolder)))[0]!;
  expect(await readFile(path.join(archives,subfolder,archive),"utf8")).toBe(before);
  await writeFile(path.join(root,updated.storedPath!),"用户在编辑器中修改了日记");
  await expect(coordinator.start({ ...request, outputTarget:{ ...request.outputTarget, originalText:updated.text, captureId:updated.id, captureRevision:updated.revision } })).rejects.toThrow("原日记已被修改");
  await history.remove("demo",updated.id,updated.revision);
  await history.importCompleted("demo",knowledge.index);
  expect((await history.list("demo")).entries).toHaveLength(0);
  expect(await readFile(path.join(root,updated.storedPath!),"utf8")).toBe("用户在编辑器中修改了日记");
});

it("rejects unsafe capture destinations and concurrent draft changes during organization", async () => {
  const { CaptureHistoryStore } = await import("../modules/content/capture-history-store.js");
  const { root, coordinator, request, finish } = await fixture();
  const history = new CaptureHistoryStore(root);
  const input = { id:"anonymous-draft", revision:0, text:request.outputTarget.originalText, folder:"随手记", diaryDate:"2026-10-17" };
  for (const folder of ["../outside","/tmp","foo/.private","外部来源/test","foo\\bar"]) await expect(history.put("demo",{...input,folder})).rejects.toThrow("有效目录");
  const entry = await history.put("demo", input);
  const run = await coordinator.start({ ...request, outputTarget:{ ...request.outputTarget, captureId:entry.id, captureRevision:entry.revision } });
  await history.put("demo", { ...entry, text:"在另一个窗口补充的内容" });
  finish();
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("failed"));
  expect((await history.list("demo")).entries[0]?.text).toBe("在另一个窗口补充的内容");
  await expect(readdir(path.join(root,"demo/sources/随手记"))).rejects.toThrow();
});

it("freezes relationship candidates for corrected speech and preserves original input across library switches", async () => {
  const { mkdir } = await import("node:fs/promises");
  const { root, knowledge, coordinator, request, start, finish } = await fixture();
  const folder = path.join(root, "demo/wiki/07 人物与城市");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "林舟.md"), "# 林舟\n\n2026 年是我的直属上级。\n");
  await knowledge.index.rebuild();
  const originalText = "我的 leader 林周已经离职了，已经提内部转岗了。";
  const run = await coordinator.start({ ...request, outputTarget: { ...request.outputTarget, originalText } });
  expect(run.outputTarget).toMatchObject({ entityLinks: [{ title: "林舟", relationshipContext: "2026 年是我的直属上级。" }] });
  expect((start.mock.calls as unknown as [[{prompt: string}]])[0][0].prompt).toContain("2026 年是我的直属上级");
  await knowledge.activate("other");
  finish("# 日记\n\n我的 leader 林舟已经提出内部转岗了。");
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
  const files = await readdir(path.join(root, "demo/sources/随手记"));
  const markdown = await readFile(path.join(root, "demo/sources/随手记", files[0]!), "utf8");
  expect(markdown).toContain("我的 leader [[wiki/07 人物与城市/林舟|林舟]]已经提出内部转岗了。");
  expect(markdown).not.toContain("## 输入原话");
  expect((await new CaptureInputCache(root).read("demo", run.id))?.originalText).toBe(originalText);
});

it("keeps saved inputs out of Markdown and protected metadata, and tolerates cache removal without losing edits", async () => {
  const { CaptureHistoryStore } = await import("../modules/content/capture-history-store.js");
  const { root, coordinator, request, finish } = await fixture();
  const history = new CaptureHistoryStore(root);
  const entry = await history.put("demo", { id: "cache-separation", revision: 0, text: request.outputTarget.originalText, folder: "随手记", diaryDate: "2026-10-17" });
  const run = await coordinator.start({ ...request, outputTarget: { ...request.outputTarget, captureId: entry.id, captureRevision: entry.revision } });
  finish();
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
  const saved = (await history.list("demo")).entries[0]!;
  expect(saved.originalText).toBe(request.outputTarget.originalText);
  const metadataFolder = path.join(stateRootForVault(root), "captures");
  const metadata = await readFile(path.join(metadataFolder, (await readdir(metadataFolder))[0]!), "utf8");
  expect(metadata).not.toContain(request.outputTarget.originalText);
  expect(metadata).not.toContain('"originalText"');
  const diary = await readFile(path.join(root, saved.storedPath!), "utf8");
  expect(diary).toBe("# 一次散步\n\n今天去公园走了一会儿。\n");
  await history.put("demo", { ...saved, text: "尚未提交的补充，不能被清理" });
  await rm(cacheRootForVault(root), { recursive: true, force: true });
  const after = (await history.list("demo")).entries[0]!;
  expect(after.text).toBe("尚未提交的补充，不能被清理");
  expect(after.originalText).toBeUndefined();
  expect(after.storedPath).toBe(saved.storedPath);
  expect(await readFile(path.join(root, saved.storedPath!), "utf8")).toBe(diary);
  expect((await history.list("other")).entries).toEqual([]);
});

it("reads saved diaries as editing fallback when optional inputs were cleared", async () => {
  const { CaptureHistoryStore } = await import("../modules/content/capture-history-store.js");
  const { root, knowledge, coordinator, request, finish } = await fixture();
  const history = new CaptureHistoryStore(root);
  const entry = await history.put("demo", { id: "cache-fallback", revision: 0, text: request.outputTarget.originalText, folder: "随手记", diaryDate: "2026-10-17" });
  const run = await coordinator.start({ ...request, outputTarget: { ...request.outputTarget, captureId: entry.id, captureRevision: entry.revision } });
  finish();
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
  await rm(cacheRootForVault(root), { recursive: true, force: true });
  const restored = (await history.list("demo")).entries[0]!;
  expect(restored.text).toBe(restored.content);
  expect(restored.originalText).toBeUndefined();
  // Listing history must not reconstruct discarded input from completed run records.
  await history.importCompleted("demo", knowledge.index);
  expect((await history.list("demo")).entries[0]?.originalText).toBeUndefined();
});

it("does not resurrect cleared input from run snapshots when importing a diary for the first time", async () => {
  const { CaptureHistoryStore } = await import("../modules/content/capture-history-store.js");
  const { root, knowledge, coordinator, request, finish } = await fixture();
  const run = await coordinator.start(request);
  finish();
  await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
  await rm(cacheRootForVault(root), { recursive: true, force: true });
  const history = new CaptureHistoryStore(root);
  await history.importCompleted("demo", knowledge.index);
  const entry = (await history.list("demo")).entries[0]!;
  expect(entry.originalText).toBeUndefined();
  expect(entry.text).toBe(entry.content);
  expect(await new CaptureInputCache(root).read("demo", run.id)).toBeUndefined();
});
