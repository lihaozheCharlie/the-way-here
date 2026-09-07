import { type VaultConfig } from "./config.js";
import { type SourceRunContext } from "./sources.js";
import { type AgentRuntimeId, type AgentReasoningEffort, type ApprovalRequest } from "./agents.js";

export type RunStatus =
  | "preparing"
  | "running"
  | "waiting-approval"
  | "validating"
  | "completed"
  | "failed"
  | "interrupted";

/** Terminal states release write locks and stop active-conversation controls. */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

export interface RunEvent {
  id: string;
  at: string;
  kind: string;
  method?: string;
  message?: string;
  payload?: unknown;
}

export interface RunFileChange {
  path: string;
  kind: "added" | "modified" | "deleted";
  diff?: string;
}

export interface AgentRunResult {
  finalAnswer?: string;
  completedAt?: string;
  outputSavedAt?: string;
}

export interface LetterVersionOutputTarget {
  kind: "letter-version";
  pageId: string;
  lensId: string;
  lensName: string;
  label: string;
}

export interface JourneyReportOutputTarget {
  kind: "journey-report";
  importId: string;
  storedPath: string;
  label: string;
  clueId?: string;
  expectedContentHash?: string;
}

export interface PhotoMemoryOutputTarget {
  kind: "photo-memory";
  importId: string;
  storedPath: string;
  label: string;
  phase: "enrich" | "draft";
  photoId?: string;
  expectedRevision?: number;
}

export type AgentOutputTarget = LetterVersionOutputTarget | JourneyReportOutputTarget | PhotoMemoryOutputTarget;

export interface WikiRun {
  id: string;
  knowledgeBaseId: string;
  configSnapshot: VaultConfig;
  title: string;
  prompt: string;
  displayPrompt?: string;
  runtimeId?: AgentRuntimeId;
  runtimeSessionId?: string;
  runtimeTurnId?: string;
  provider?: string;
  model?: string;
  effort?: AgentReasoningEffort;
  outputTarget?: AgentOutputTarget;
  sourceContext?: SourceRunContext;
  contextPageId?: string;
  recoveredFromLegacyWorkspace?: boolean;
  mode: "auto" | "read" | "write" | "validate";
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  result?: AgentRunResult;
  error?: string;
  events: RunEvent[];
  approvals: ApprovalRequest[];
  changes: RunFileChange[];
  validation?: Array<{
    command: string[];
    exitCode: number | null;
    output: string;
  }>;
}

export interface DeletedAgentConversation {
  threadId: string;
  deletedRunIds: string[];
}
