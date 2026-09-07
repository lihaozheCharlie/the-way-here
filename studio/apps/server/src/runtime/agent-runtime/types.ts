import type {
  AgentApprovalDecision,
  AgentGlobalSettings,
  AgentModelOption,
  AgentProviderPreset,
  AgentRuntimePreference,
  UpdateAgentGlobalSettings,
  AgentReasoningEffort,
  AgentRuntimeDescriptor,
  AgentRuntimeEvent,
  AgentRuntimeId,
  VaultConfig,
  WikiRun,
} from "@the-way-here/shared";

export interface AgentExecutionRef {
  runtimeId: AgentRuntimeId;
  sessionId: string;
  turnId: string;
}

export interface StartAgentExecution {
  strictReadOnly?: boolean;
  images?: Array<{ path: string; mimeType: "image/jpeg" }>;
  cwd: string;
  prompt: string;
  model: string;
  effort: AgentReasoningEffort;
  mode: Exclude<WikiRun["mode"], "validate">;
  config: VaultConfig;
  sessionId?: string;
}

export interface AgentRuntimeEnvelope {
  ref: AgentExecutionRef;
  event: AgentRuntimeEvent;
}

export interface AgentRecoveryState {
  status: "running" | "completed" | "failed" | "interrupted" | "missing";
  finalAnswer?: string;
  error?: string;
}

export interface AgentRuntime {
  readonly id: AgentRuntimeId;
  inspect(): Promise<AgentRuntimeDescriptor>;
  start(input: StartAgentExecution): Promise<AgentExecutionRef>;
  steer(ref: AgentExecutionRef, prompt: string): Promise<void>;
  interrupt(ref: AgentExecutionRef): Promise<void>;
  decide(ref: AgentExecutionRef, approvalId: string | number, decision: AgentApprovalDecision): Promise<void>;
  recover(ref: AgentExecutionRef): Promise<AgentRecoveryState>;
  deleteSession?(sessionId: string): Promise<void>;
  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void;
  close(): void;
}

export abstract class RuntimeEventSource {
  private readonly listeners = new Set<(envelope: AgentRuntimeEnvelope) => void>();

  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(envelope: AgentRuntimeEnvelope): void {
    for (const listener of this.listeners) listener(envelope);
  }
}

export interface ResolvedAgentSelection {
  runtime: AgentRuntime;
  runtimeId: AgentRuntimeId;
  model: AgentModelOption;
  effort: AgentReasoningEffort;
}

export interface AgentRuntimeProvider {
  resolve(preference: AgentRuntimePreference | undefined, requestedModel: string | undefined, requestedEffort: AgentReasoningEffort | undefined): Promise<ResolvedAgentSelection>;
  require(id: AgentRuntimeId): AgentRuntime;
  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void;
  close(): void;
}

export interface AgentRuntimeSettings {
  catalog(): Promise<AgentRuntimeDescriptor[]>;
  providerPresets(): AgentProviderPreset[];
  settings(): AgentGlobalSettings;
  updateSettings(input: UpdateAgentGlobalSettings): Promise<AgentGlobalSettings>;
}
