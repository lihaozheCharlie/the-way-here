import { useEffect, useState } from "react";
import type { AgentRuntimeEvent, WikiRun } from "@the-way-here/shared";
import { api } from "../../api";

type StreamState = { runId: string; draft?: WikiRun["liveDraft"]; phase: string };

function phaseFor(event: AgentRuntimeEvent): string | undefined {
  if (event.type === "assistant.delta") return "正在回复";
  if (event.type === "tool.completed" || event.type === "assistant.message") return "正在组织回答";
  if (event.type !== "tool.started") return undefined;
  if (/search|grep|find|list/i.test(event.toolName + " " + (event.summary || ""))) return "正在查找相关记录";
  if (/read/i.test(event.toolName + " " + (event.summary || ""))) return "正在核对相关内容";
  if (/write|edit|file.change|patch/i.test(event.toolName + " " + (event.summary || ""))) return "正在保存更新";
  return "正在处理请求";
}

export function useAgentStream(runId: string, enabled: boolean): StreamState {
  const [state, setState] = useState<StreamState>({ runId, phase: "正在准备" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let version = 0;
    const events = new EventSource("/api/events");
    const snapshot = () => {
      const requestedAt = version;
      void api<WikiRun>(`/api/runs/${runId}`).then((run) => {
        if (active && requestedAt === version) setState((current) => ({ ...current, runId, draft: run.liveDraft }));
      }).catch(() => {});
    };
    const onAgent = (message: MessageEvent) => {
      let data: { runId?: string; event?: AgentRuntimeEvent };
      try { data = JSON.parse(message.data); } catch { return; }
      if (data.runId !== runId || !data.event) return;
      version += 1;
      const event = data.event;
      setState((current) => {
        const phase = phaseFor(event) || current.phase;
        if (event.type === "assistant.delta") return { runId, phase, draft: { messageId: event.messageId, text: (current.draft?.messageId === event.messageId ? current.draft.text : "") + event.text } };
        if (event.type === "assistant.message" || event.type === "turn.completed") return { runId, phase, draft: undefined };
        return { ...current, runId, phase };
      });
    };
    events.addEventListener("open", snapshot);
    events.addEventListener("agent", onAgent as EventListener);
    return () => { active = false; events.close(); };
  }, [runId, enabled]);
  return state.runId === runId ? state : { runId, phase: "正在准备" };
}
