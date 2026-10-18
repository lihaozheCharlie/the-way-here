import { describe, it, expect, vi } from "vitest";
import { protectRuntime } from "./data-consent.js";
import type { AgentGlobalSettings } from "@the-way-here/shared";
import type { AgentRuntime, StartAgentExecution } from "./types.js";

describe("AI data consent boundary", () => {
  function fixture() {
    let settings = {thirdParty:{providerId:"deepseek"}} as AgentGlobalSettings;
    const ref = {runtimeId:"codex" as const,sessionId:"session",turnId:"turn"};
    const raw: AgentRuntime = {id:"codex",inspect:vi.fn(),start:vi.fn(async()=>ref),steer:vi.fn(),interrupt:vi.fn(),decide:vi.fn(),recover:vi.fn(async()=>({status:"running" as const})),subscribe:()=>()=>{},close:vi.fn()};
    const runtime = protectRuntime(raw,()=>settings);
    const consent = (accepted:boolean) => { settings = {...settings,dataConsent:accepted ? {version:1,recipientId:"codex",acceptedAt:new Date().toISOString()} : undefined}; };
    return {runtime,raw,ref,consent};
  }
  it("blocks start, steer, approvals and recovery before disclosure is accepted", async()=>{
    const {runtime,raw,ref} = fixture();
    await expect(runtime.start({} as StartAgentExecution)).rejects.toThrow("尚未允许");
    await expect(runtime.steer(ref,"private")).rejects.toThrow();
    await expect(runtime.decide(ref,"id","allow-once")).rejects.toThrow();
    await expect(runtime.recover(ref)).rejects.toThrow();
    expect(raw.start).not.toHaveBeenCalled();
    await runtime.interrupt(ref);
    expect(raw.interrupt).toHaveBeenCalledWith(ref);
  });
  it("stops active work on withdrawal and blocks later work",async()=>{
    const {runtime,raw,ref,consent} = fixture(); consent(true);
    await runtime.start({} as StartAgentExecution); consent(false); await runtime.revoke();
    expect(raw.interrupt).toHaveBeenCalledWith(ref);
    await expect(runtime.start({} as StartAgentExecution)).rejects.toThrow();
  });
  it("stops a start resolving after consent was withdrawn",async()=>{
    const {runtime,raw,ref,consent} = fixture(); consent(true);
    let finish!: (value: typeof ref)=>void;
    vi.mocked(raw.start).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const pending = runtime.start({} as StartAgentExecution);
    consent(false); await runtime.revoke(); finish(ref);
    await expect(pending).rejects.toThrow("撤回");
    expect(raw.interrupt).toHaveBeenCalledWith(ref);
  });
});
