import { useEffect, useState } from "react";
import type { AgentRuntimeEvent, WikiRun } from "@the-way-here/shared";
import { api } from "../../api";

type StreamState = { runId: string; draft?: WikiRun["liveDraft"]; final?: boolean };

export function useAgentStream(runId: string, enabled: boolean): StreamState {
  const [state, setState] = useState<StreamState>({ runId });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let version = 0;
    const events = new EventSource("/api/events");
    const snapshot = () => {
      const requestedAt = version;
      void api<WikiRun>(`/api/runs/${runId}`).then((run) => {
        if (active && requestedAt === version) setState({ runId, draft: run.liveDraft });
      }).catch(() => {});
    };
    const onAgent = (message: MessageEvent) => {
      let data: { runId?: string; event?: AgentRuntimeEvent };
      try { data = JSON.parse(message.data); } catch { return; }
      if (data.runId !== runId || !data.event) return;
      const event = data.event;
      if (event.type !== "assistant.delta" && event.type !== "assistant.message" && event.type !== "turn.completed") return;
      version += 1;
      setState((current) => {
        const previous = current.runId === runId ? current : { runId };
        if (event.type === "assistant.delta") {
          const prefix = previous.draft?.messageId === event.messageId ? previous.draft.text : "";
          return { runId, draft: { messageId: event.messageId, text: prefix + event.text } };
        }
        if (event.type === "assistant.message") {
          return event.final ? { runId, final: true, draft: { messageId: "final", text: event.text } } : { runId };
        }
        if (event.finalAnswer) return { runId, final: true, draft: { messageId: "final", text: event.finalAnswer } };
        return previous.final || event.outcome === "interrupted" ? previous : { runId };
      });
    };
    events.addEventListener("open", snapshot);
    events.addEventListener("agent", onAgent as EventListener);
    return () => { active = false; events.close(); };
  }, [runId, enabled]);
  return state.runId === runId ? state : { runId };
}
