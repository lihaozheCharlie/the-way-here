import type { DreamRun, WikiRun } from "@the-way-here/shared";
import { currentLocale, translate, translateInterpolated } from "../../shared/i18n";

const tr = (message: string, params?: Record<string, string | number | null | undefined>) => translate(currentLocale(), message, params);

export interface AgentNotification { title: string; body: string; route: string }
export function dreamNotificationRoute(run: Pick<DreamRun, "id" | "knowledgeBaseId">) {
  return `/dreams/${encodeURIComponent(run.id)}?knowledgeBaseId=${encodeURIComponent(run.knowledgeBaseId)}`;
}
export interface PredictionNotificationEvent {
  knowledgeBaseId: string;
  status: "idle" | "running" | "ready" | "failed";
  job?: "scan" | "prediction";
  startedAt?: string;
}

function moduleForRun(run: WikiRun): string {
  if (run.sourceModule) return tr(run.sourceModule.slice(0, 24));
  switch (run.outputTarget?.kind) {
    case "life-record": return tr("随手记");
    case "letter-version": return tr("近况回信");
    case "photo-memory": return tr("照片记忆");
    case "journey-report": return tr("账单记忆");
  }
  if (run.sourceContext) return tr("生活记录");
  if (run.contextTopicId) return tr("值得聊聊");
  if (run.mode === "validate") return tr("系统检查");
  if (run.contextPageId) return tr("已有理解");
  return tr("AI 对话");
}

function terminal(status: WikiRun["status"]): boolean {
  return status === "completed" || status === "failed";
}

export class AgentNotificationTracker {
  private readonly runs = new Map<string, WikiRun["status"]>();
  private readonly predictions = new Map<string, PredictionNotificationEvent["status"]>();
  private readonly dreams = new Map<string, string>();
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
      title: tr("【${module}】${status}", { module: moduleForRun(run), status: run.status === "completed" ? tr("任务已完成") : tr("任务未完成") }),
      body: (run.title ? translateInterpolated(currentLocale(), run.title) : tr("Agent 任务")).slice(0, 120),
      route: `/conversation?detached=true&run=${encodeURIComponent(run.id)}`,
    });
  }

  reconcileRuns(runs: WikiRun[]): void {
    for (const run of runs) this.observeRun(run);
  }

  observeDream(run: Pick<DreamRun, "id" | "knowledgeBaseId" | "status" | "finishedAt">): void {
    if (!run?.id || !run.knowledgeBaseId || !run.finishedAt || Date.parse(run.finishedAt) < this.startedAt) return;
    if (!["ready", "partial", "insufficient", "failed"].includes(run.status)) return;
    const key = run.knowledgeBaseId + ":" + run.id;
    if (this.dreams.get(key) === run.finishedAt) return;
    this.dreams.set(key, run.finishedAt);
    this.notify({
      title: tr(run.status === "failed" ? "梦境未完成" : "梦境已醒来"),
      body: tr(run.status === "failed" ? "点击查看原因并重试。" : "点击查看结果。"),
      route: dreamNotificationRoute(run),
    });
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
    const status = tr(completed ? "已完成" : "未完成");
    const gap = currentLocale() === "en" && status && !/^\s/.test(status) ? " " : "";
    this.notify({
      title: tr("【${name}】${job}${gap}${status}", { name: tr("看见未来"), job: tr(event.job === "scan" ? "了解度扫描" : "预测"), gap, status }),
      body: completed ? tr("点击查看结果。") : tr("点击查看原因并重试。"),
      route: "/predict-self",
    });
  }
}
