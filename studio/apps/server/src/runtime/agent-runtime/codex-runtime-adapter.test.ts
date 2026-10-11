import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAppServer } from "@the-way-here/codex-bridge";
import type { VaultConfig } from "@the-way-here/shared";
import { CodexRuntimeAdapter } from "./codex-runtime-adapter.js";
import type { StartAgentExecution } from "./types.js";

const config: VaultConfig = {
  version: 3, name: "Demo", knowledgeBaseId: "demo", knowledgeBases: [{ id: "demo", name: "Demo" }], adapter: "personal-growth",
  paths: { wiki: "demo/wiki", sources: "demo/sources", skills: "knowledge-engine/skills", tools: "knowledge-engine/tools", agentInstructions: "AGENTS.md" },
  views: {}, agents: { defaultRuntime: "auto", runtimes: { codex: { enabled: true, command: "codex", transport: "stdio" }, pi: { enabled: true, providers: [] } } },
  validation: { commands: [] },
};
afterEach(() => vi.restoreAllMocks());

describe("Codex per-turn permissions", () => {
  it.each([
    ["auto", false, false], ["write", false, false], ["read", false, true], ["auto", true, true], ["write", true, true],
  ] as const)("uses %s mode with strictReadOnly=%s", async (mode, strictReadOnly, readOnly) => {
    const start = vi.spyOn(CodexAppServer.prototype, "startTurn").mockResolvedValue("turn-1");
    const adapter = new CodexRuntimeAdapter("unused");
    try {
      await adapter.start({ cwd: "/demo", prompt: "用户请求", model: "demo", effort: "high", config, mode, strictReadOnly, sessionId: "existing-session" });
      expect(start).toHaveBeenCalledWith("existing-session", expect.any(String), "/demo", expect.objectContaining({ readOnly }));
    } finally { adapter.close(); }
  });

  it("keeps automatic write permissions after resuming an existing session", async () => {
    const start = vi.spyOn(CodexAppServer.prototype, "startTurn").mockRejectedValueOnce(new Error("session needs resume")).mockResolvedValue("turn-2");
    const resume = vi.spyOn(CodexAppServer.prototype, "resumeThread").mockResolvedValue(undefined);
    const adapter = new CodexRuntimeAdapter("unused");
    try {
      const input: StartAgentExecution = { cwd: "/demo", prompt: "重新生成回信并保存", model: "demo", effort: "high", config, mode: "auto", sessionId: "existing-session" };
      await adapter.start(input);
      expect(resume).toHaveBeenCalledWith("existing-session", "/demo");
      expect(start).toHaveBeenCalledTimes(2);
      expect(start.mock.calls[1]![3]).toMatchObject({ readOnly: false });
    } finally { adapter.close(); }
  });
});
