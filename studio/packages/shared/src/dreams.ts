import type { AgentRuntimeId, AgentRuntimePreference } from "./agents.js";

export interface DreamDateRange {
  earliest: string;
  latest: string;
}

/** Each origin is resolved to a confirmed point before the workflow is started. */
export type DreamPointSource =
  | { kind: "life-stage" | "decision"; pageId: string }
  | { kind: "self-described" | "conversation"; pointId: string };

export interface DreamPointNotes {
  situation?: string;
  actualChoice?: string;
  aftermath?: string;
  scenario?: string;
}
export type DreamHorizon = "one-year" | "three-years" | "now";
export interface DreamPointDescription extends DreamPointNotes {
  title: string;
  decisionAt?: DreamDateRange;
}

export interface DreamPreparation extends DreamPointNotes {
  alternatives?: string[];
  horizon?: DreamHorizon;
  supplement?: string;
  reviewFocus?: string;
}

export interface DreamEnvironment {
  before: number;
  after: number;
  until?: string;
  suggestions: string[];
  actualChoice?: string;
}

export interface DreamCollection {
  favorites: string[];
  insights: Array<{ runId: string; key: number; text: string; savedAt: string; sourceDeleted?: boolean }>;
  pointPreferences?: Record<string, "saved" | "ignored">;
}

export type DreamPointInput = DreamPointSource & DreamPreparation & {
  decisionAt?: DreamDateRange;
  question?: string;
};

export interface DreamPointCandidate {
  source: DreamPointSource;
  title: string;
  stageStart?: string;
  stageEnd?: string;
  suggestedDecisionAt?: DreamDateRange;
  stageId?: string;
  stageTitle?: string;
  reason?: string;
  notes?: DreamPointNotes;
  fresh?: boolean;
}

export interface DreamStartInput {
  knowledgeBaseId: string;
  point: DreamPointInput;
  runtimeId?: AgentRuntimePreference;
  previousRunId?: string;
}

export interface DreamPoint extends DreamPreparation {
  source: DreamPointSource;
  title: string;
  stageStart?: string;
  decisionAt: DreamDateRange;
  question?: string;
}

export interface DreamCitation {
  pageId: string;
  line: number;
  quote: string;
  date?: string;
}

export interface DreamFinding {
  text: string;
  verdict: "supported" | "partial" | "contradicted" | "unknown";
  evidence: DreamCitation[];
  revision?: string;
}

export interface DreamGroundFact {
  text: string;
  knownBy: string;
  evidence: DreamCitation[];
}

export interface DreamReport {
  groundedFacts?: DreamGroundFact[];
  branchLimitReason?: string;
  decision: string;
  summary: string;
  verification?: "reviewed" | "unreviewed";
  actualPath: DreamFinding;
  actualTimeline?: Array<{ date: string; finding: DreamFinding }>;
  unchanged?: string;
  changed?: string;
  takeaways?: string[];
  comparison?: Array<{ dimension: string; actual: string; branches: Array<{ id: string; text: string; relation?: string; claimIndex?: number }> }>;
  backtest?: Array<{ claim: string; review: DreamFinding }>;
  branches: Array<{
    id: string;
    title: string;
    intervention: string;
    status: "reviewed" | "incomplete";
    stoppingFinding?: DreamFinding;
    timeline: Array<{
      horizon: string;
      date?: string;
      possibility: string;
      condition: string;
      basis: DreamCitation[];
      review: DreamFinding;
    }>;
    gaps: string[];
  }>;
}

export interface DreamRun {
  id: string;
  knowledgeBaseId: string;
  point: DreamPoint;
  title?: string;
  runtimeId: AgentRuntimeId;
  model: string;
  status: "queued" | "running" | "ready" | "partial" | "insufficient" | "failed" | "cancelled";
  phase?: "ground" | "plan" | "analyze" | "calibrate" | "review";
  progress?: { finished: number; total: number };
  environment?: Pick<DreamEnvironment, "before" | "after">;
  updates?: Array<{ label: string; text: string }>;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  previousRunId?: string;
  until?: string;
  resumable?: boolean;
  report?: DreamReport;
}

export type DreamRunListItem = Omit<DreamRun, "report"> & {
  verification?: DreamReport["verification"];
  branchCount?: number;
};

function dreamTitleAction(value?: string): string | undefined {
  const action = value?.trim().replace(/^(?:如果|假如)\s*(?:(?:\d{4}年|那|当)[^，,\r\n]*[，,])?/u, "").trim().replace(/。$/u, "");
  if (action && /^我[^，,、。；;：:？！?!\r\n]{1,39}$/u.test(action) && !/或|还是|会怎样|会如何/u.test(action)) return action;
}

export function dreamTitle({ point, title }: Pick<DreamRun, "point" | "title">): string {
  const { earliest, latest } = point.decisionAt;
  const [year, month] = earliest.split("-");
  const time = earliest.slice(0, 7) === latest.slice(0, 7) ? `${year}年${Number(month)}月`
    : earliest.slice(0, 4) === latest.slice(0, 4) ? `${year}年` : "那段时间";
  const selected = point.alternatives?.length === 1 ? point.alternatives[0]?.trim() : undefined;
  const choice = selected && !/^(?:如果|假如|我)/u.test(selected) ? `我${selected}` : selected;
  const action = dreamTitleAction(title) ?? dreamTitleAction(choice) ?? dreamTitleAction(point.question) ??
    dreamTitleAction(point.title) ?? "我重新选一次";
  return `如果${time}，${action}`;
}
