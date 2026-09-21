export interface UnderstandingScore {
  version: number;
  score: number;
  threshold: number;
  scannedAt?: string;
  scanStatus?: "idle" | "running" | "ready" | "failed";
  stale?: boolean;
  error?: string;
  unlocked: boolean;
  facets: Array<{ id: string; label: string; value: number; max: number; observed: number; target: number; reason?: string; gaps?: string[]; evidence?: Array<{pageId:string;quote:string}> }>;
}
export interface PredictionView {
  knowledgeBaseId: string;
  understanding: UnderstandingScore;
  status: "locked" | "idle" | "running" | "ready" | "failed";
  stale: boolean;
  changeToken?: string;
  progress?: string;
  thoughts?: string;
  thoughtKind?: PredictionThoughtKind;
  generatedAt?: string;
  error?: string;
  report?: LifePredictionReport;
}

export type LifeDimension = "health" | "work" | "play" | "love";
export type PredictionThoughtKind = "update" | "hypothesis";
export type PredictionPathway = "inertia" | "willed" | "wildcard";
export const predictionPathwayLabels: Record<PredictionPathway, string> = { inertia: "顺从惯性", willed: "遵从意愿", wildcard: "随机事件" };
export interface LifeEvidence {
  id: string; pageId: string; quote: string; cue: string; interpretation: string;
  kind: "fact" | "wish" | "plan" | "action" | "outcome" | "hypothesis";
  dimensions: LifeDimension[];
}
export interface LifeScenario {
  id: string; title: string; pathway: PredictionPathway;
  probability: number | null;
  probabilityBasis: "overall" | "conditional";
  probabilityCondition: string | null;
  probabilityReason: string;
  confidence: "low" | "medium" | "high";
  overview: string; week: string; choice: string;
  dimensions: Array<{
    id: LifeDimension; future: string;
    verdict: { label: string; tone: "up" | "mixed" | "down" };
    gainShare: 20 | 35 | 50 | 65 | 80 | null;
    gains: string[]; costs: string[];
    notes: Array<{kind:"condition" | "risk"; title:string; detail:string}>;
  }>;
  evidenceIds: string[]; assumptions: string[]; counterEvidence: string[]; unknowns: string[];
  stages: Array<{period:"months0_3" | "months3_12" | "years1_3" | "years3_5"; change:string; condition:string}>;
  actions: Array<{action:string; observation:string; reviewAfter:string; dimensions:LifeDimension[]}>;
}
export interface LifePredictionReport {
  current: string;
  dimensions: Array<{id:LifeDimension; current:string; desired:string; constraints:string[]; evidenceIds:string[]}>;
  evidence: LifeEvidence[];
  scenarios: LifeScenario[];
}
