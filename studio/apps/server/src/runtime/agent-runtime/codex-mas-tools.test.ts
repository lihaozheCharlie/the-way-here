import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MasCodexTools } from "./codex-mas-tools.js";
import type { StartAgentExecution } from "./types.js";

let root: string;
let input: StartAgentExecution;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "twh-mas-tools-"));
  for (const dir of ["demo/wiki", "demo/sources", "other/wiki"]) await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, "demo/wiki/example.md"), "虚构记录：散步十分钟。");
  await writeFile(path.join(root, "other/wiki/private.md"), "另一知识库的内容");
  input = { cwd: root, prompt: "匿名测试", model: "demo", effort: "low", mode: "read", config: {
    version: 3, name: "Demo", knowledgeBaseId: "demo", knowledgeBases: [{ id: "demo", name: "Demo" }], adapter: "personal-growth",
    paths: { wiki: "demo/wiki", sources: "demo/sources", skills: "knowledge-engine/skills", tools: "knowledge-engine/tools", agentInstructions: "AGENTS.md" },
    views: {}, agents: { defaultRuntime: "codex", runtimes: { codex: { enabled: true, command: "codex", transport: "stdio" }, pi: { enabled: false, providers: [] } } }, validation: { commands: [] },
  } };
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("MAS Codex client tools", () => {
  it("reads bound knowledge and rejects another knowledge base and parent traversal", async () => {
    const tools = new MasCodexTools(input, () => true);
    const result = await tools.execute("read_file", { path: "demo/wiki/example.md" }, "r1");
    expect(result.contentItems[0]?.text).toContain("散步十分钟");
    await expect(tools.execute("read_file", { path: "other/wiki/private.md" }, "r2")).rejects.toThrow();
    await expect(tools.execute("read_file", { path: "../outside.md" }, "r3")).rejects.toThrow();
  });
  it("does not expose writes in read-only tasks, including strictReadOnly with write mode", async () => {
    for (const context of [input, { ...input, mode: "write" as const, strictReadOnly: true }]) {
      const tools = new MasCodexTools(context, () => true);
      await expect(tools.execute("write_file", { path: "demo/wiki/new.md", content: "不应保存" }, "w1")).rejects.toThrow("不允许");
    }
  });
  it("enforces optimistic writes and rejects protected paths", async () => {
    const tools = new MasCodexTools({ ...input, mode: "write" }, () => true);
    const result = await tools.execute("read_file", { path: "demo/wiki/example.md" }, "r1");
    const { sha256 } = JSON.parse(result.contentItems[0]!.text);
    await tools.execute("write_file", { path: "demo/wiki/example.md", content: "更新后的虚构记录", expectedSha256: sha256 }, "w1");
    expect(await readFile(path.join(root, "demo/wiki/example.md"), "utf8")).toBe("更新后的虚构记录");
    await expect(tools.execute("write_file", { path: "demo/wiki/example.md", content: "覆盖", expectedSha256: sha256 }, "w2")).rejects.toThrow();
    await expect(tools.execute("write_file", { path: "AGENTS.md", content: "修改规则" }, "w3")).rejects.toThrow();
  });
  it("fails closed for malformed arguments, arbitrary tools and revoked consent", async () => {
    let allowed = true;
    const tools = new MasCodexTools(input, () => allowed);
    await expect(tools.execute("read_file", { path: "demo/wiki/example.md", cwd: "other" }, "bad")).rejects.toThrow("未允许");
    await expect(tools.execute("read_file", {}, "bad")).rejects.toThrow();
    await expect(tools.execute("exec_command", { cmd: "cat anything" }, "bad")).rejects.toThrow("不允许");
    allowed = false;
    await expect(tools.execute("read_file", { path: "demo/wiki/example.md" }, "revoked")).rejects.toThrow("许可已撤回");
  });
});
