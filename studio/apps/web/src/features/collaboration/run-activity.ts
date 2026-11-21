import type { AgentRuntimeEvent, WikiRun } from "@the-way-here/shared";
import type { IconName } from "../../shared/ui";

type ToolStart = Extract<AgentRuntimeEvent, { type: "tool.started" }>;
type RunActivity = { label: string; icon: IconName; records?: string[] };

function readRecord(event: ToolStart | undefined): string | undefined {
  if (!event?.summary || !["read_knowledge_evidence", "read_file"].includes(event.toolName)) return;
  try {
    const args = JSON.parse(event.summary) as { action?: string; page?: unknown; path?: unknown };
    const path = event.toolName === "read_file" ? args.path : args.action === "read" ? args.page : undefined;
    if (typeof path === "string") return path.split(/[/\\]/).at(-1)?.replace(/\.md$/i, "");
  } catch { return; }
}

export function runActivity(run: WikiRun, { replying = false, final = false, stopping = false } = {}): RunActivity {
  if (stopping) return { label: "正在停止", icon: "stop" };
  if (run.status === "waiting-approval") return { label: "需要你确认后继续", icon: "info" };
  if (run.status === "preparing") return { label: "正在准备", icon: "spark" };
  if (run.status === "validating") {
    return { label: run.mode === "validate" ? "正在检查知识库" : "正在检查更新", icon: "check" };
  }

  const tools = new Map<string, ToolStart>();
  const records = new Set<string>();
  for (const { payload } of run.events) {
    const event = payload as AgentRuntimeEvent | undefined;
    if (event?.type === "tool.started") tools.set(event.callId, event);
    if (event?.type === "tool.completed") {
      const record = event.success && readRecord(tools.get(event.callId));
      if (record) records.add(record);
      tools.delete(event.callId);
    }
  }
  const tool = Array.from(tools.values()).at(-1);
  const recentRecords = Array.from(records).slice(-3);
  if (final) return { label: "正在收尾", icon: "spark", records: recentRecords };
  if (tool?.toolName === "command") return { label: "正在运行命令", icon: "terminal", records: recentRecords };
  if (tool && /read|search|grep|find|list/i.test(tool.toolName)) return { label: "正在翻阅相关记录", icon: "search", records: recentRecords };
  if (tool && /file-change|write|edit|patch/i.test(tool.toolName)) return { label: "正在修改文件", icon: "edit", records: recentRecords };
  if (tool) return { label: "正在使用工具", icon: "controls", records: recentRecords };
  if (replying) return { label: "正在回复", icon: "message", records: recentRecords };
  return { label: "正在思考", icon: "spark", records: recentRecords };
}
