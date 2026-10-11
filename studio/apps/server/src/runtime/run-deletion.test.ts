import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeEvent, WikiRun } from "@the-way-here/shared";
import { RunStore, stateRootForVault } from "@the-way-here/run-manager";
import type { AgentRuntimeProvider } from "./agent-runtime/types.js";
import type { AgentRuntimeEnvelope, StartAgentExecution } from "./agent-runtime/types.js";
import { KnowledgeRuntime } from "./knowledge-runtime.js";
import { RunCoordinator } from "./run-coordinator.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture(commands: string[][] = []) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-run-delete-")));
  await writeFile(path.join(root, "the-way-here.config.yaml"), "version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    paths:\n      wiki: demo/wiki\n      sources: demo/sources\nvalidation:\n  commands: " + JSON.stringify(commands) + "\n");
  const knowledge = await KnowledgeRuntime.create(root, "demo");
  const broadcast = vi.spyOn(knowledge.events, "broadcast");
  let listener!: (event: AgentRuntimeEnvelope) => void;
  let sequence = 0;
  const deleteSession = vi.fn(async () => undefined);
  const runtime = {
    start: vi.fn(async (input: StartAgentExecution) => ({ runtimeId: "codex" as const, sessionId: input.sessionId || `session-${++sequence}`, turnId: `turn-${sequence}` })),
    deleteSession,
  };
  const provider = {
    subscribe: (callback: typeof listener) => { listener = callback; return () => undefined; },
    resolve: vi.fn(async () => ({ runtimeId: "codex", runtime, model: { id: "test-model", inputModalities: ["text"] }, effort: "high" })),
    require: vi.fn(() => runtime),
    close: vi.fn(),
  } as unknown as AgentRuntimeProvider;
  const coordinator = new RunCoordinator(knowledge, provider, { error: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger);
  const emit = (run: WikiRun, event: AgentRuntimeEvent) => listener({ ref: { runtimeId: run.runtimeId!, sessionId: run.runtimeSessionId!, turnId: run.runtimeTurnId! }, event });
  cleanups.push(async () => { coordinator.close(); await knowledge.close(); await rm(root, { recursive: true, force: true }); await rm(stateRootForVault(root), { recursive: true, force: true }); });
  return { coordinator, deleteSession, emit, broadcast, runtime, root, knowledge };
}

describe("deleting Agent conversations", () => {
  it("keeps ordinary automatic chat unchanged and offers optional construction later", async () => {
    const { coordinator, emit, runtime, root } = await fixture();
    const chat = await coordinator.start({ mode: "auto", knowledgeBaseId: "demo", prompt: "我决定下周去贵州" });
    expect(runtime.start.mock.calls[0]![0]).toMatchObject({ strictReadOnly: false, mode: "auto" });
    emit(chat, { type: "turn.completed", outcome: "completed", finalAnswer: "听起来很期待，想先聊聊路线吗？" });
    await vi.waitFor(() => expect(runtime.start).toHaveBeenCalledTimes(2));
    expect((await coordinator.list()).map((run) => run.id)).toEqual([chat.id]);
    const suggestion = (await new RunStore(root).list()).find((run) => run.suggestionForRunId === chat.id)!;
    emit(suggestion, { type: "turn.completed", outcome: "completed", finalAnswer: '{"suggest":true,"summary":"已确定的贵州行程","page":"旅行计划"}' });
    await vi.waitFor(async () => expect((await coordinator.get(chat.id))?.wikiSuggestion?.summary).toBe("已确定的贵州行程"));
    const build = await coordinator.buildConversation(chat.id);
    expect(build).toMatchObject({ mode: "write", knowledgeBaseId: "demo" });
    expect(runtime.start.mock.calls[2]![0]).toMatchObject({ mode: "write", sessionId: undefined });
    expect((await coordinator.get(chat.id))?.status).toBe("completed");
  });
  it("saves an automatic rewrite in the existing conversation, validates and refreshes it", async () => {
    const { coordinator, emit, runtime, root, knowledge } = await fixture();
    const file = "demo/wiki/回信.md";
    await mkdir(path.join(root, "demo/wiki"), { recursive: true });
    await writeFile(path.join(root, file), "# 原回信\n旧正文");
    await knowledge.rebuildIfActive("demo");
    const page = knowledge.index.list().find(page => page.relativePath === file)!;
    const first = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "聊聊这篇回信", contextPageId: page.id });
    expect(runtime.start.mock.calls[0]![0].strictReadOnly).toBe(true);
    emit(first, { type: "turn.completed", outcome: "completed", finalAnswer: "读过了" });
    await vi.waitFor(async () => expect((await coordinator.get(first.id))?.status).toBe("completed"));
    const rebuild = vi.spyOn(knowledge, "rebuildIfActive");
    const rewrite = await coordinator.start({ mode: "auto", knowledgeBaseId: "demo", prompt: "重新写这篇回信并保存", sessionId: first.runtimeSessionId });
    expect(rewrite.contextPageId).toBe(page.id);
    expect(runtime.start.mock.calls[1]![0]).toMatchObject({ mode: "auto", strictReadOnly: false, sessionId: first.runtimeSessionId });
    await writeFile(path.join(root, file), "# 新回信\n新的正文");
    emit(rewrite, { type: "turn.completed", outcome: "completed", finalAnswer: "已经重写并保存。" });
    await vi.waitFor(async () => expect((await coordinator.get(rewrite.id))?.status).toBe("completed"));
    const completed = (await coordinator.get(rewrite.id))!;
    expect(completed.changes).toEqual([expect.objectContaining({ path: file, kind: "modified", diff: expect.stringContaining("新的正文") })]);
    expect(completed.validation).toEqual([]);
    expect(rebuild).toHaveBeenCalledWith("demo");
    expect(runtime.start).toHaveBeenCalledTimes(2);
    expect(completed.wikiSuggestion).toBeUndefined();
  });

  it("reports automatic write validation failures and releases the write lock", async () => {
    const { coordinator, emit, runtime, root } = await fixture([[process.execPath, "-e", "process.exit(1)"]]);
    const run = await coordinator.start({ mode: "auto", knowledgeBaseId: "demo", prompt: "保存一封回信" });
    await mkdir(path.join(root, "demo/wiki"), { recursive: true });
    await writeFile(path.join(root, "demo/wiki/新回信.md"), "# 新回信\n正文");
    emit(run, { type: "turn.completed", outcome: "completed", finalAnswer: "已写入" });
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("failed"));
    const failed = (await coordinator.get(run.id))!;
    expect(failed.validation?.[0]?.exitCode).toBe(1);
    expect(failed.error).toBe("知识质量检查未通过");
    expect(failed.changes).toEqual([expect.objectContaining({ kind: "added" })]);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    await expect(coordinator.start({ mode: "write", knowledgeBaseId: "demo", prompt: "修正检查问题" })).resolves.toMatchObject({ mode: "write" });
  });

  it("keeps managed letter versions read-only in automatic mode and follow-up turns", async () => {
    const { coordinator, emit, runtime, root, knowledge } = await fixture();
    await mkdir(path.join(root, "demo/wiki/12 回信"), { recursive: true });
    await writeFile(path.join(root, "demo/wiki/12 回信/演示.md"), "# 演示回信\n正文");
    await knowledge.rebuildIfActive("demo");
    const page = knowledge.index.list().find(page => page.category === "letters")!;
    const run = await coordinator.start({ mode: "auto", knowledgeBaseId: "demo", prompt: "用新视角重读", outputTarget: { kind: "letter-version", pageId: page.id, lensId: "demo", lensName: "演示", label: "重读版本" } });
    expect(runtime.start.mock.calls[0]![0]).toMatchObject({ strictReadOnly: true });
    expect(runtime.start.mock.calls[0]![0].prompt).toContain("这是严格只读任务");
    emit(run, { type: "turn.completed", outcome: "completed", finalAnswer: "重读版本正文" });
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
    const followup = await coordinator.start({ mode: "auto", knowledgeBaseId: "demo", prompt: "再完善一下", sessionId: run.runtimeSessionId });
    expect(followup.outputTarget).toEqual(run.outputTarget);
    expect(runtime.start.mock.calls[1]![0]).toMatchObject({ strictReadOnly: true });
  });

  it("streams draft segments without persisting every chunk and clears them on completion", async () => {
    const { coordinator, emit, broadcast } = await fixture();
    const run = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "聊聊" });
    const eventCount = (await coordinator.get(run.id))!.events.length;
    emit(run, { type: "assistant.delta", messageId: "answer-1", text: "你" });
    emit(run, { type: "assistant.delta", messageId: "answer-1", text: "好" });
    expect((await coordinator.get(run.id))?.liveDraft).toEqual({ messageId: "answer-1", text: "你好" });
    expect((await coordinator.get(run.id))?.events).toHaveLength(eventCount);
    expect(broadcast).toHaveBeenCalledWith("agent", expect.objectContaining({ runId: run.id, event: { type: "assistant.delta", messageId: "answer-1", text: "好" } }));
    emit(run, { type: "assistant.message", text: "你好", final: true });
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.result?.finalAnswer).toBe("你好"));
    expect((await coordinator.get(run.id))?.liveDraft).toBeUndefined();
  });
  it("removes every completed turn in the session and its local runtime session", async () => {
    const { coordinator, deleteSession, emit } = await fixture();
    const first = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "第一轮", sourceModule: "近况回信" });
    emit(first, { type: "turn.completed", outcome: "completed", finalAnswer: "第一轮回答" });
    await vi.waitFor(async () => expect((await coordinator.get(first.id))?.status).toBe("completed"));
    const second = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "第二轮", sessionId: first.runtimeSessionId, sourceModule: "深入聊聊" });
    expect((await coordinator.get(second.id))?.sourceModule).toBe("近况回信");
    emit(second, { type: "turn.completed", outcome: "completed", finalAnswer: "第二轮回答" });
    await vi.waitFor(async () => expect((await coordinator.get(second.id))?.status).toBe("completed"));

    await expect(coordinator.deleteConversation(second.id)).resolves.toEqual({
      threadId: first.runtimeSessionId,
      deletedRunIds: expect.arrayContaining([first.id, second.id]),
    });
    expect(await coordinator.list()).toEqual([]);
    expect(deleteSession).toHaveBeenCalledOnce();
    expect(deleteSession).toHaveBeenCalledWith(first.runtimeSessionId);
  });

  it("requires an active conversation to be stopped before deletion", async () => {
    const { coordinator, deleteSession } = await fixture();
    const active = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "还在聊" });

    await expect(coordinator.deleteConversation(active.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(deleteSession).not.toHaveBeenCalled();
    expect(await coordinator.get(active.id)).toBeDefined();
  });
});
