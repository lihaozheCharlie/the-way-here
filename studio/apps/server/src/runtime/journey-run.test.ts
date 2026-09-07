import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stateRootForVault } from "@the-way-here/run-manager";
import type { JourneyReportOutputTarget, SourceImportBatch, WikiRun } from "@the-way-here/shared";
import type { AgentRuntimeEnvelope, AgentRuntimeProvider } from "./agent-runtime/types.js";
import { KnowledgeRuntime } from "./knowledge-runtime.js";
import { RunCoordinator } from "./run-coordinator.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-journey-run-")));
  await writeFile(path.join(root, "the-way-here.config.yaml"), "version: 3\nknowledgeBases:\n  demo:\n    paths:\n      wiki: demo/wiki\n      sources: demo/sources\n  other:\n    paths:\n      wiki: other/wiki\n      sources: other/sources\n");
  const reportPath = "demo/sources/旅程.md";
  const target: JourneyReportOutputTarget = { kind: "journey-report", importId: "batch-1", storedPath: reportPath, label: "匿名旅程" };
  const batch: SourceImportBatch = {
    id: target.importId, createdAt: "2026-01-01T00:00:00.000Z", channel: "alipay", fileCount: 1, totalBytes: 1,
    files: [{ originalName: "匿名账单.csv", storedPath: reportPath, bytes: 1, buildKind: "dialogue", buildStatus: "needs-dialogue" }],
    journey: { provider: "alipay", title: "匿名旅程", reportPath, period: { start: "2026-01-01", end: "2026-01-02" }, transactionCount: 1, activeDays: 1, netExpense: 10, refundCount: 0, clusters: [], agentPrompt: "聊聊", revision: 1, clueStates: [] },
  };
  await mkdir(path.join(root, "demo/sources/.imports"), { recursive: true });
  await writeFile(path.join(root, "demo/sources/.imports/batch-1.json"), JSON.stringify(batch));
  const original = "# 匿名旅程\n\n<!-- the-way-here:journey-draft:start -->\n旧草稿\n<!-- the-way-here:journey-draft:end -->\n\n# 交易证据\n原始事实不变。";
  await writeFile(path.join(root, reportPath), original);
  const knowledge = await KnowledgeRuntime.create(root, "demo");
  let listener: (event: AgentRuntimeEnvelope) => void;
  const start = vi.fn(async () => ({ runtimeId: "codex" as const, sessionId: "session", turnId: "turn" }));
  const provider = {
    subscribe: (callback: typeof listener) => { listener = callback; return () => undefined; },
    resolve: async () => ({ runtimeId: "codex", runtime: { start }, model: { id: "test-model" }, effort: "high" }),
    close: vi.fn(),
  } as unknown as AgentRuntimeProvider;
  const coordinator = new RunCoordinator(knowledge, provider, { error: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger);
  cleanups.push(async () => { coordinator.close(); await knowledge.close(); await rm(root, { recursive: true, force: true }); await rm(stateRootForVault(root), { recursive: true, force: true }); });
  const finish = (run: WikiRun) => listener({ ref: { runtimeId: run.runtimeId!, sessionId: run.runtimeSessionId!, turnId: run.runtimeTurnId! }, event: { type: "turn.completed", outcome: "completed", finalAnswer: "记下来了。<journey-report>用户确认的匿名出游。</journey-report>" } });
  return { root, reportPath, original, coordinator, knowledge, target, start, finish };
}

describe("journey output orchestration", () => {
  it("saves a result to the run's original library after the active library changes", async () => {
    const { root, reportPath, original, coordinator, knowledge, target, finish } = await fixture();
    const run = await coordinator.start({ knowledgeBaseId: "demo", mode: "read", prompt: "聊聊这段经历", outputTarget: target });
    expect(run.outputTarget).toMatchObject({ kind: "journey-report", expectedContentHash: expect.any(String) });
    await knowledge.activate("other");
    finish(run);
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("completed"));
    const saved = await coordinator.get(run.id);
    expect(saved).toMatchObject({ knowledgeBaseId: "demo", result: { finalAnswer: "记下来了。", outputSavedAt: expect.any(String) } });
    expect(await readFile(path.join(root, reportPath), "utf8")).toBe(original.replace("旧草稿", "用户确认的匿名出游。"));
    expect(knowledge.index.config.knowledgeBaseId).toBe("other");
    expect(knowledge.index.list()).toEqual([]);
  });

  it("fails a stale result instead of overwriting a concurrent edit", async () => {
    const { root, reportPath, original, coordinator, target, finish } = await fixture();
    const run = await coordinator.start({ knowledgeBaseId: "demo", mode: "read", prompt: "聊聊", outputTarget: target });
    const manualEdit = `${original}\n用户另行补充。`;
    await writeFile(path.join(root, reportPath), manualEdit);
    finish(run);
    await vi.waitFor(async () => expect((await coordinator.get(run.id))?.status).toBe("failed"));
    expect((await coordinator.get(run.id))?.error).toContain("被修改了");
    expect((await coordinator.get(run.id))?.result?.outputSavedAt).toBeUndefined();
    expect(await readFile(path.join(root, reportPath), "utf8")).toBe(manualEdit);
  });

  it("rejects write-mode enrichment before an agent starts", async () => {
    const { coordinator, target, start } = await fixture();
    await expect(coordinator.start({ knowledgeBaseId: "demo", mode: "write", prompt: "聊聊", outputTarget: target })).rejects.toThrow("只读");
    expect(start).not.toHaveBeenCalled();
    expect(await coordinator.list()).toEqual([]);
  });
});
