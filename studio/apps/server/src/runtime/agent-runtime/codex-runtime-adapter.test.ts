import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAppServer } from "@the-way-here/codex-bridge";
import type { VaultConfig } from "@the-way-here/shared";
import { CodexRuntimeAdapter } from "./codex-runtime-adapter.js";
import type { StartAgentExecution } from "./types.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const config: VaultConfig = {
  version: 3, name: "Demo", knowledgeBaseId: "demo", knowledgeBases: [{ id: "demo", name: "Demo" }], adapter: "personal-growth",
  paths: { wiki: "demo/wiki", sources: "demo/sources", skills: "knowledge-engine/skills", tools: "knowledge-engine/tools", agentInstructions: "AGENTS.md" },
  views: {}, agents: { defaultRuntime: "auto", runtimes: { codex: { enabled: true, command: "codex", transport: "stdio" }, pi: { enabled: true, providers: [] } } },
  validation: { commands: [] },
};
afterEach(() => vi.restoreAllMocks());

describe("Codex executable diagnostics", () => {
  it("distinguishes a missing program from a permission failure", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "twh-codex-probe-"));
    try {
      const missing = await new CodexRuntimeAdapter(path.join(directory, "missing")).inspect();
      expect(missing).toMatchObject({ available: false, reason: expect.stringContaining("未找到") });
      if (process.platform !== "win32") {
        const blocked = path.join(directory, "blocked");
        await writeFile(blocked, "#!/bin/sh\nexit 0\n", { mode: 0o600 });
        const result = await new CodexRuntimeAdapter(blocked).inspect();
        expect(result).toMatchObject({ available: false, reason: expect.stringContaining("EACCES") });
      }
      expect(CodexAppServer.availability(process.execPath)).toEqual({ available: true });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

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

describe("MAS Codex request binding", () => {
  it("routes only the active turn and disables queued tools on interruption", async () => {
    vi.spyOn(CodexAppServer.prototype, "startThread").mockResolvedValue("mas-thread");
    const start = vi.spyOn(CodexAppServer.prototype, "startTurn").mockResolvedValue("mas-turn");
    vi.spyOn(CodexAppServer.prototype, "interrupt").mockResolvedValue(undefined);
    const respond = vi.spyOn(CodexAppServer.prototype, "respondToServerRequest").mockImplementation(() => undefined);
    const adapter = new CodexRuntimeAdapter("unused", {mas:true,masCwd:"/isolated-codex",allowTools:()=>true});
    try {
      const ref=await adapter.start({cwd:"/demo",prompt:"匿名读取",model:"demo",effort:"low",config,mode:"read"});
      expect(start.mock.calls[0]?.[2]).toBe("/isolated-codex");
      expect(start.mock.calls[0]?.[3]).toMatchObject({readOnly:true});
      const server=(adapter as unknown as {codex:CodexAppServer}).codex;
      server.emit("request",{id:1,method:"item/tool/call",params:{threadId:ref.sessionId,turnId:"wrong-turn",callId:"forged",tool:"list_files",arguments:{}}});
      expect(respond).toHaveBeenLastCalledWith(1,expect.objectContaining({success:false}));
      server.emit("request",{id:2,method:"item/tool/call",params:{threadId:ref.sessionId,turnId:ref.turnId,callId:"queued",tool:"list_files",arguments:{}}});
      await adapter.interrupt(ref);
      await vi.waitFor(()=>expect(respond).toHaveBeenCalledWith(2,expect.objectContaining({success:false})));
    } finally {adapter.close();}
  });
});
