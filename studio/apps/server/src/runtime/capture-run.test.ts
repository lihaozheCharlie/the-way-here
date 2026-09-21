import { mkdtemp, readFile, realpath, rm, writeFile, readdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { stateRootForVault } from "@the-way-here/run-manager";
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
  expect(await readFile(file, "utf8")).toContain(`## 输入原话\n\n${request.outputTarget.originalText}`);
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
