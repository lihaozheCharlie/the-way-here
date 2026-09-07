import { type SourceImportChannel } from "./content.js";

export interface SourceImportFile {
  name: string;
  relativePath?: string;
  content: string;
  encoding?: "utf8" | "base64";
  mimeType?: string;
}

export type SourceBuildKind = "direct" | "dialogue" | "identify";

export type SourceBuildStatus = "ready" | "needs-dialogue" | "in-dialogue" | "ready-to-build" | "building" | "built" | "deferred";

export interface SourceBuiltRef {
  pageId: string;
  path: string;
  title: string;
}

export interface SourceRunContext {
  importId: string;
  storedPath: string;
  storedPaths?: string[];
  allDirect?: boolean;
  flow: SourceBuildKind;
  operation?: "enrich" | "build";
}

export type PaymentJourneyClusterKind = "journey" | "place" | "routine" | "day-story" | "theme";

export type PaymentJourneyClueStatus = "pending" | "confirmed" | "brief" | "deep" | "skipped";

export interface PaymentJourneyClueState {
  clusterId: string;
  status: PaymentJourneyClueStatus;
  resultText?: string;
  note?: string;
  conversationRunId?: string;
  conversationTurns?: number;
  updatedAt?: string;
}

export interface PaymentJourneyTransactionEvidence {
  id: string;
  createdAt: string;
  merchant: string;
  product: string;
  amount: number;
  direction: string;
  status: string;
  refund: number;
  category: string;
}

export interface PaymentJourneyCluster {
  id: string;
  kind: PaymentJourneyClusterKind;
  title: string;
  summary: string;
  question: string;
  startDate: string;
  endDate: string;
  entryCount: number;
  categories: string[];
  evidence: string[];
  transactions?: PaymentJourneyTransactionEvidence[];
  proposedMemory?: string;
  confidence?: "high" | "medium";
  relatedClusterIds?: string[];
}

export interface PaymentJourneySummary {
  provider: "alipay";
  title: string;
  reportPath: string;
  period: { start: string; end: string };
  transactionCount: number;
  activeDays: number;
  netExpense: number;
  refundCount: number;
  clusters: PaymentJourneyCluster[];
  agentPrompt: string;
  revision?: number;
  clueStates?: PaymentJourneyClueState[];
}

export interface SourceImportBatch {
  id: string;
  createdAt: string;
  channel?: SourceImportChannel;
  targetFolder?: string;
  fileCount: number;
  totalBytes: number;
  files: Array<{
    originalName: string;
    storedPath: string;
    bytes: number;
    buildKind?: SourceBuildKind;
    buildStatus?: SourceBuildStatus;
    clueCount?: number;
    dialogueRunId?: string;
    buildRunId?: string;
    journeyUpdatedAt?: string;
    builtRefs?: SourceBuiltRef[];
    buildError?: string;
    buildUpdatedAt?: string;
  }>;
  journey?: PaymentJourneySummary;
}

export const JOURNEY_REPORT_OUTPUT_START = "<journey-report>";
export const JOURNEY_REPORT_OUTPUT_END = "</journey-report>";
export const JOURNEY_REPORT_DRAFT_START = "<!-- the-way-here:journey-draft:start -->";
export const JOURNEY_REPORT_DRAFT_END = "<!-- the-way-here:journey-draft:end -->";
