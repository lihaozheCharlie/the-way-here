import type { WikiRun } from "@the-way-here/shared";

export interface AgentNotification { title: string; body: string; route: string }
export interface PredictionNotificationEvent {
  knowledgeBaseId: string;
  status: "idle" | "running" | "ready" | "failed";
  job?: "scan" | "prediction";
  startedAt?: string;
}

function moduleForRun(run: WikiRun): string {
  if (run.sourceModule) return run.sourceModule.slice(0, 24);
  switch (run.outputTarget?.kind) {
    case "life-record": return "随手记";
    case "letter-version": return "近况回信";
    case "photo-memory": return "照片记忆";
    case "journey-report": return "账单记忆";
  }
  if (run.sourceContext) return "生活记录";
  if (run.contextTopicId) return "值得聊聊";
  if (run.mode === "validate") return "系统检查";
  if (run.contextPageId) return "已有理解";
  return "AI 对话";
}

function terminal(status: WikiRun["status"]): boolean {
  return status === "completed" || status === "failed";
}

export class AgentNotificationTracker {
  private readonly runs = new Map<string, WikiRun["status"]>();
  private readonly predictions = new Map<string, PredictionNotificationEvent["status"]>();
  private readonly startedAt = Date.now();
  constructor(private readonly notify: (message: AgentNotification) => void) {}

  observeRun(run: WikiRun): void {
    if (!run?.id || !run.knowledgeBaseId || !run.status) return;
    const key = `${run.knowledgeBaseId}:${run.id}`;
    const previous = this.runs.get(key);
    if (previous && (terminal(previous) || previous === "interrupted")) return;
    this.runs.set(key, run.status);
    if (!terminal(run.status) || previous === run.status) return;
    // Initial history is silent; a newly completed run is still caught before the first snapshot.
    if (previous === undefined && Date.parse(run.updatedAt) < this.startedAt) return;
    this.notify({
      title: `【${moduleForRun(run)}】${run.status === "completed" ? "任务已完成" : "任务未完成"}`,
      body: (run.title || "Agent 任务").slice(0, 120),
      route: `/conversation?detached=true&run=${encodeURIComponent(run.id)}`,
    });
  }

  reconcileRuns(runs: WikiRun[]): void {
    for (const run of runs) this.observeRun(run);
  }

  observePrediction(event: PredictionNotificationEvent): void {
    if (!event?.knowledgeBaseId || !event.job || !event.startedAt || !event.status) return;
    const key = `${event.knowledgeBaseId}:${event.job}:${event.startedAt}`;
    const previous = this.predictions.get(key);
    if (previous && previous !== "running") return;
    this.predictions.set(key, event.status);
    const completed = event.job === "scan" ? event.status === "idle" || event.status === "ready" : event.status === "ready";
    if (previous === event.status || !completed && event.status !== "failed") return;
    if (previous === undefined && Date.parse(event.startedAt) < this.startedAt) return;
    this.notify({
      title: `【看见未来】${event.job === "scan" ? "了解度扫描" : "预测"}${completed ? "已完成" : "未完成"}`,
      body: completed ? "点击查看结果。" : "点击查看原因并重试。",
      route: "/predictions",
    });
  }
}
