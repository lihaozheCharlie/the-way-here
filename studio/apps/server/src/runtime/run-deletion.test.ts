import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeEvent, WikiRun } from "@the-way-here/shared";
import { stateRootForVault } from "@the-way-here/run-manager";
import type { AgentRuntimeProvider } from "./agent-runtime/registry.js";
import type { AgentRuntimeEnvelope, StartAgentExecution } from "./agent-runtime/types.js";
import { KnowledgeRuntime } from "./knowledge-runtime.js";
import { RunCoordinator } from "./run-coordinator.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-run-delete-")));
  await writeFile(path.join(root, "the-way-here.config.yaml"), "version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    paths:\n      wiki: demo/wiki\n      sources: demo/sources\n");
  const knowledge = await KnowledgeRuntime.create(root, "demo");
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
  return { coordinator, deleteSession, emit };
}

describe("deleting Agent conversations", () => {
  it("removes every completed turn in the session and its local runtime session", async () => {
    const { coordinator, deleteSession, emit } = await fixture();
    const first = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "第一轮" });
    emit(first, { type: "turn.completed", outcome: "completed", finalAnswer: "第一轮回答" });
    await vi.waitFor(async () => expect((await coordinator.get(first.id))?.status).toBe("completed"));
    const second = await coordinator.start({ mode: "read", knowledgeBaseId: "demo", prompt: "第二轮", sessionId: first.runtimeSessionId });
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
