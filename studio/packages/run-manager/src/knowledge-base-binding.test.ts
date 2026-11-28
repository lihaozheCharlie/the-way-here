import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunStore } from "./index";
import type { VaultConfig, WikiRun } from "@the-way-here/shared";

const temporaryRoots: string[] = [];
const config = (knowledgeBaseId: string): VaultConfig => ({
  version: 3,
  name: knowledgeBaseId,
  knowledgeBaseId,
  knowledgeBases: [{ id: knowledgeBaseId, name: knowledgeBaseId }],
  adapter: "personal-growth",
  paths: { wiki: `vault/${knowledgeBaseId}/wiki`, sources: `vault/${knowledgeBaseId}/sources`, skills: "knowledge-engine/skills", tools: "knowledge-engine/tools", agentInstructions: "AGENTS.md" },
  views: {},
  agents: { defaultRuntime: "auto", runtimes: { codex: { enabled: true, command: "codex", transport: "stdio" }, pi: { enabled: true, providers: [] } } },
  validation: { commands: [] },
});

async function storeFixture(): Promise<{ store: RunStore; stateRoot: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-run-binding-"));
  temporaryRoots.push(root);
  return { store: new RunStore(path.join(root, "workspace"), path.join(root, "state")), stateRoot: path.join(root, "state") };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Run knowledge base binding", () => {
  it("keeps knowledgeBaseId and the config snapshot through every update and a JSON round trip", async () => {
    const { store, stateRoot } = await storeFixture();
    const bound = config("personal");
    const persisted = async (id: string) => JSON.parse(await readFile(path.join(stateRoot, "runs", id, "run.json"), "utf8")) as WikiRun;
    const run = await store.create("绑定知识库的任务", "只处理这个知识库", "write", "personal", bound);
    expect(run).toMatchObject({ knowledgeBaseId: "personal", configSnapshot: bound });
    expect(await persisted(run.id)).toMatchObject({ id: run.id, knowledgeBaseId: "personal", configSnapshot: bound });

    await store.addEvent(run.id, { kind: "agent", message: "开始处理" });
    await store.addApproval(run.id, { requestId: "approval-1", runtimeId: "codex", operation: "command", title: "请求执行命令" });
    await store.update(run.id, { title: "改过标题的任务", contextPageId: "sources/日记/今天" });
    await store.resolveApproval(run.id, "approval-1");
    await store.markInterrupted(run.id, { messageId: "m1", text: "写到一半" });
    await store.setStatus(run.id, "failed", "示例错误");

    const stored = await store.get(run.id);
    expect(stored).toMatchObject({ knowledgeBaseId: "personal", configSnapshot: bound, status: "failed", title: "改过标题的任务", events: [{ message: "开始处理" }] });
    expect(JSON.parse(JSON.stringify(stored))).toMatchObject({ knowledgeBaseId: "personal", configSnapshot: { knowledgeBaseId: "personal" } });
    expect(await persisted(run.id)).toMatchObject({ knowledgeBaseId: "personal", configSnapshot: { knowledgeBaseId: "personal" } });
    const restarted = new RunStore(store.vaultRoot, stateRoot);
    expect(await restarted.get(run.id)).toMatchObject({ knowledgeBaseId: "personal", configSnapshot: bound });
    expect(await restarted.list()).toMatchObject([{ id: run.id, knowledgeBaseId: "personal" }]);
  });

  it("keeps each run bound to its own knowledge base when libraries share one state root", async () => {
    const { store } = await storeFixture();
    const personal = await store.create("个人库对话", "测试", "read", "personal", config("personal"));
    const demo = await store.create("演示库对话", "测试", "read", "demo", config("demo"));
    for (const [id, knowledgeBaseId] of [[personal.id, "personal"], [demo.id, "demo"]] as const) {
      expect(await store.get(id)).toMatchObject({ knowledgeBaseId, configSnapshot: { knowledgeBaseId } });
    }
    // 两条记录可能落在同一毫秒，列表顺序不保证；只断言每条各绑各的库。
    const listed = (await new RunStore(store.vaultRoot, store.stateRoot).list()).map((run) => [run.id, run.knowledgeBaseId]);
    expect(listed.sort()).toEqual([[demo.id, "demo"], [personal.id, "personal"]].sort());
  });
});
