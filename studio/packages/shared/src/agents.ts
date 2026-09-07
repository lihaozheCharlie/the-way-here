

export type AgentRuntimeId = "codex" | "pi";
export type AgentRuntimePreference = AgentRuntimeId | "auto";
export type AgentReasoningEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type AgentProviderProtocol = "openai-completions" | "openai-responses" | "anthropic-messages";

export interface AgentProviderModelConfig {
  inputModalities?: Array<"text" | "image">;
  id: string;
  displayName: string;
  reasoning: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportedReasoningEfforts?: AgentReasoningEffort[];
  defaultReasoningEffort?: AgentReasoningEffort;
}

export interface AgentProviderConfig {
  id: string;
  name?: string;
  protocol: AgentProviderProtocol;
  baseUrl: string;
  apiKeyEnv?: string;
  models: AgentProviderModelConfig[];
}

export interface AgentRuntimeConfig {
  defaultRuntime: AgentRuntimePreference;
  runtimes: {
    codex: {
      enabled: boolean;
      command: string;
      transport: "stdio";
    };
    pi: {
      enabled: boolean;
      providers: AgentProviderConfig[];
    };
  };
}

export interface AgentModelOption {
  inputModalities?: Array<"text" | "image">;
  runtimeId: AgentRuntimeId;
  id: string;
  provider?: string;
  providerDisplayName?: string;
  displayName: string;
  description?: string;
  supportedReasoningEfforts: AgentReasoningEffort[];
  defaultReasoningEffort?: AgentReasoningEffort;
}

export interface AgentRuntimeDescriptor {
  id: AgentRuntimeId;
  displayName: string;
  available: boolean;
  reason?: string;
  models: AgentModelOption[];
}

export interface AgentProviderPreset {
  id: string;
  displayName: string;
  description: string;
  models: Array<{
    id: string;
    displayName: string;
    description?: string;
    supportedReasoningEfforts: AgentReasoningEffort[];
    defaultReasoningEffort: AgentReasoningEffort;
  }>;
}

export interface AgentGlobalSettings {
  runtimeId: AgentRuntimeId;
  codex: {
    model: string;
    effort: AgentReasoningEffort;
  };
  thirdParty: {
    providerId: string;
    model: string;
    effort: AgentReasoningEffort;
    apiKeyConfigured: boolean;
    apiKeyConfiguredProviders: string[];
    ready: boolean;
  };
}

export interface UpdateAgentGlobalSettings {
  runtimeId: AgentRuntimeId;
  codex: {
    model: string;
    effort: AgentReasoningEffort;
  };
  thirdParty: {
    providerId: string;
    model: string;
    effort: AgentReasoningEffort;
    apiKey?: string;
    clearApiKey?: boolean;
  };
}

export type AgentApprovalDecision = "allow-once" | "allow-for-session" | "deny" | "cancel";

export interface ApprovalRequest {
  requestId: number | string;
  runtimeId: AgentRuntimeId;
  operation: "command" | "file-write" | "network" | "tool";
  title: string;
  detail?: string;
  method?: string;
  params?: Record<string, unknown>;
}

export type AgentRuntimeEvent =
  | { type: "turn.started"; sessionId: string; turnId: string }
  | { type: "assistant.message"; text: string; final: boolean }
  | { type: "tool.started"; callId: string; toolName: string; summary?: string }
  | { type: "tool.completed"; callId: string; toolName: string; success: boolean; summary?: string }
  | { type: "approval.requested"; approval: ApprovalRequest }
  | { type: "turn.completed"; outcome: "completed" | "failed" | "interrupted"; finalAnswer?: string; error?: string }
  | { type: "diagnostic"; level: "info" | "warning" | "error"; message: string };
