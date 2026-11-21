import type { AgentRuntimeEvent } from "@the-way-here/shared";
import type { AgentExecutionRef, AgentRuntime, StartAgentExecution } from "../agent-runtime/types.js";

type Completion = Extract<AgentRuntimeEvent, { type: "turn.completed" }>;
const sameTurn = (a: AgentExecutionRef, b: AgentExecutionRef) =>
  a.runtimeId === b.runtimeId && a.sessionId === b.sessionId && a.turnId === b.turnId;

/** Subscribe before startup or recovery; a runtime can finish before start() returns. */
export async function executeDreamTurn(
  runtime: AgentRuntime,
  input: StartAgentExecution,
  previous: AgentExecutionRef | undefined,
  checkpoint: (ref: AgentExecutionRef) => Promise<void>,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  let ref = previous;
  let running = !!previous;
  const early: Array<{ ref: AgentExecutionRef; event: Completion }> = [];
  let onCompletion: ((event: Completion) => void) | undefined;
  let onAbort: (() => void) | undefined;
  const unsubscribe = runtime.subscribe(envelope => {
    if (envelope.event.type !== "turn.completed") return;
    if (ref && !sameTurn(ref, envelope.ref)) return;
    if (onCompletion) onCompletion(envelope.event);
    else {
      if (early.length === 32) early.shift();
      early.push({ ref: envelope.ref, event: envelope.event });
    }
  });
  try {
    if (ref) {
      const recovered = await runtime.recover(ref);
      signal.throwIfAborted();
      running = recovered.status === "running";
      if (recovered.status === "completed") return recovered.finalAnswer || "";
      if (recovered.status === "failed") throw new Error(recovered.error || "梦境阶段执行失败");
    }
    if (!running) {
      ref = undefined;
      ref = await runtime.start(input);
      running = true;
      await checkpoint(ref);
    }
    signal.throwIfAborted();
    const turn = ref!;
    const event = early.find(item => sameTurn(item.ref, turn))?.event ?? await new Promise<Completion>((resolve, reject) => {
      onCompletion = resolve;
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    running = false;
    if (event.outcome !== "completed") throw new Error(event.error || "梦境阶段未完成");
    return event.finalAnswer || "";
  } finally {
    unsubscribe();
    if (onAbort) signal.removeEventListener("abort", onAbort);
    if (running && ref) await runtime.interrupt(ref).catch(() => undefined);
  }
}
