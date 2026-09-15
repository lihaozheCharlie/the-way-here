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
export interface PredictionEvidence { pageId: string; cue: string; quote: string; interpretation: string }
export interface PredictionOutcome {
  probability: number;
  probabilityReason: string;
  title: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  conditions: string[];
  factors: Array<{ label: string; direction: "support" | "risk"; strength: 1 | 2 | 3; mechanism: string }>;
  evidence: PredictionEvidence[];
  counterEvidence: string[];
  unknowns: string[];
  actions: Array<{ action: string; observation: string; reviewAfter: string }>;
}
export interface PredictionBranch { probability: number; probabilityReason: string; title: string; choice: string; summary: string; dailyLife: string; outcomes: PredictionOutcome[] }
export interface PredictionDomain {
  id: "work" | "life";
  title: string;
  current: string;
  currentDetail: string;
  gaps: string[];
  branches: PredictionBranch[];
}
export interface PredictionReport {
  version: 4;
  summary: string;
  horizon: string;
  domains: PredictionDomain[];
  tensions: string[];
  changes: string[];
}
export interface PredictionView {
  knowledgeBaseId: string;
  understanding: UnderstandingScore;
  status: "locked" | "idle" | "running" | "ready" | "failed";
  stale: boolean;
  changeToken?: string;
  thoughts?: string;
  thoughtKind?: PredictionThoughtKind;
  generatedAt?: string;
  error?: string;
  report?: PredictionArchive;
}

export type LifeDimension = "health" | "work" | "play" | "love";
export type PredictionThoughtKind = "update" | "hypothesis";
export interface LifeEvidence extends PredictionEvidence {
  id: string;
  kind: "fact" | "wish" | "plan" | "action" | "outcome" | "hypothesis";
  dimensions: LifeDimension[];
}
export interface LifeScenario {
  id: string;
  title: string;
  probability: number | null;
  probabilityReason: string;
  confidence: "low" | "medium" | "high";
  week: string;
  lenses: { work: string; life: string };
  environment: string;
  choice: string;
  dimensions: Array<{ id: LifeDimension; future: string; gain: string; cost: string }>;
  evidenceIds: string[];
  assumptions: string[];
  stages: Array<{ period: "year1" | "years2_3" | "years4_5"; change: string; condition: string }>;
  factors: PredictionOutcome["factors"];
  counterEvidence: string[];
  unknowns: string[];
  actions: PredictionOutcome["actions"];
  forks: Array<{ condition: string; then: string; otherwise: string }>;
}
export interface LifePredictionReport {
  version: 5;
  summary: string;
  horizon: string;
  current: string;
  dimensions: Array<{ id: LifeDimension; current: string; desired: string; constraints: string[]; evidenceIds: string[] }>;
  evidence: LifeEvidence[];
  probabilityMode: "independent" | "exclusive";
  probabilityScope: string;
  scenarios: LifeScenario[];
  gaps: string[];
  tensions: string[];
  changes: string[];
}
export type PredictionArchive = PredictionReport | LifePredictionReport;
