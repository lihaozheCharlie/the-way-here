import { useEffect, useState } from "react";
import type { AgentRuntimeEvent, WikiRun } from "@the-way-here/shared";
import { api } from "../../api";

type StreamState = { runId: string; draft?: WikiRun["liveDraft"]; phase: string; records?: string[] };

function readRecord(event: AgentRuntimeEvent): string | undefined {
  if (event.type !== "tool.started" || !event.summary) return;
  if (event.toolName !== "read_knowledge_evidence" && event.toolName !== "read_file") return;
  try {
    const args = JSON.parse(event.summary) as { action?: string; page?: unknown; path?: unknown };
    const path = event.toolName === "read_file" ? args.path : args.action === "read" ? args.page : undefined;
    if (typeof path === "string") return path.split(/[/\\]/).at(-1)?.replace(/\.md$/i, "");
  } catch { return; }
}

function phaseFor(event: AgentRuntimeEvent): string | undefined {
  if (event.type === "assistant.delta") return "正在回复";
  if (event.type === "tool.completed" || event.type === "assistant.message") return "正在组织回答";
  if (event.type !== "tool.started") return undefined;
  if (/search|grep|find|list/i.test(event.toolName + " " + (event.summary || ""))) return "正在翻阅相关记录";
  if (/read/i.test(event.toolName + " " + (event.summary || ""))) return "正在翻阅相关记录";
  if (/write|edit|file.change|patch/i.test(event.toolName + " " + (event.summary || ""))) return "正在保存更新";
  return "正在处理请求";
}

export function useAgentStream(runId: string, enabled: boolean): StreamState {
  const [state, setState] = useState<StreamState>({ runId, phase: "正在准备" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let version = 0;
    const pendingRecords = new Map<string, string>();
    const events = new EventSource("/api/events");
    const snapshot = () => {
      const requestedAt = version;
      void api<WikiRun>(`/api/runs/${runId}`).then((run) => {
        if (active && requestedAt === version) setState((current) => ({ runId, phase: current.runId === runId ? current.phase : "正在准备", records: current.runId === runId ? current.records : undefined, draft: run.liveDraft }));
      }).catch(() => {});
    };
    const onAgent = (message: MessageEvent) => {
      let data: { runId?: string; event?: AgentRuntimeEvent };
      try { data = JSON.parse(message.data); } catch { return; }
      if (data.runId !== runId || !data.event) return;
      version += 1;
      const event = data.event;
      if (event.type === "tool.started") {
        const record = readRecord(event);
        if (record) pendingRecords.set(event.callId, record);
      }
      const record = event.type === "tool.completed" && event.success ? pendingRecords.get(event.callId) : undefined;
      if (event.type === "tool.completed") pendingRecords.delete(event.callId);
      setState((current) => {
        const sameRun = current.runId === runId;
        const previousRecords = sameRun ? current.records ?? [] : [];
        const records = record && !previousRecords.includes(record) ? [...previousRecords, record].slice(-3) : previousRecords;
        const phase = phaseFor(event) || (sameRun ? current.phase : "正在准备");
        if (event.type === "assistant.delta") return { runId, phase, records, draft: { messageId: event.messageId, text: (sameRun && current.draft?.messageId === event.messageId ? current.draft.text : "") + event.text } };
        if (event.type === "assistant.message" && event.final) return { runId, phase, records, draft: { messageId: "final", text: event.text } };
        return { runId, phase, records, draft: sameRun ? current.draft : undefined };
      });
    };
    events.addEventListener("open", snapshot);
    events.addEventListener("agent", onAgent as EventListener);
    return () => { active = false; events.close(); };
  }, [runId, enabled]);
  return state.runId === runId ? state : { runId, phase: "正在准备" };
}
