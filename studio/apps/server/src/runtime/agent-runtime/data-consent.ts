import type { AgentGlobalSettings } from "@the-way-here/shared";
import type { AgentExecutionRef, AgentRuntime } from "./types.js";

export const dataConsentVersion = 1;
export function recipientFor(runtimeId: "codex" | "pi", settings: AgentGlobalSettings): string {
  return runtimeId === "codex" ? "codex" : `pi:${settings.thirdParty.providerId}`;
}
export function hasDataConsent(runtimeId: "codex" | "pi", settings: AgentGlobalSettings): boolean {
  return settings.dataConsent?.version === dataConsentVersion
    && settings.dataConsent.recipientId === recipientFor(runtimeId, settings);
}

// Protect every runtime entry point, including background work and resumed sessions.
export function protectRuntime(runtime: AgentRuntime, settings: () => AgentGlobalSettings): AgentRuntime & { revoke(): Promise<void> } {
  const active = new Map<string, AgentExecutionRef>();
  let generation = 0;
  const key = (ref: AgentExecutionRef) => `${ref.sessionId}:${ref.turnId}`;
  const check = () => {
    if (!hasDataConsent(runtime.id, settings())) throw new Error("尚未允许向此 AI 服务发送资料，请在偏好设置 → AI 助手中阅读说明并明确同意");
  };
  runtime.subscribe(({ ref, event }) => { if (event.type === "turn.completed") active.delete(key(ref)); });
  return {
    id: runtime.id,
    inspect: () => runtime.inspect(),
    async start(input) {
      check(); const startedIn = generation;
      const ref = await runtime.start(input);
      if (startedIn !== generation || !hasDataConsent(runtime.id, settings())) {
        await runtime.interrupt(ref); throw new Error("AI 共享许可已撤回，本次任务已停止");
      }
      active.set(key(ref), ref); return ref;
    },
    async steer(ref, prompt) { check(); return runtime.steer(ref, prompt); },
    interrupt: ref => runtime.interrupt(ref),
    async decide(ref, id, decision) { if (decision === "allow-once" || decision === "allow-for-session") check(); return runtime.decide(ref, id, decision); },
    async recover(ref) { check(); const startedIn = generation; const state = await runtime.recover(ref); if (state.status === "running") { if (startedIn !== generation || !hasDataConsent(runtime.id, settings())) { await runtime.interrupt(ref); throw new Error("AI 共享许可已撤回，本次任务已停止"); } active.set(key(ref), ref); } return state; },
    deleteSession: runtime.deleteSession ? id => runtime.deleteSession!(id) : undefined,
    subscribe: listener => runtime.subscribe(listener),
    close: () => runtime.close(),
    async revoke() {
      generation++;
      const refs = [...active.values()]; active.clear();
      const results = await Promise.allSettled(refs.map(ref => runtime.interrupt(ref)));
      if (results.some(result => result.status === "rejected")) runtime.close();
    },
  };
}
