import type { AgentOutputTarget, AgentReasoningEffort, AgentRuntimePreference, SourceRunContext, WikiRun } from "@the-way-here/shared";

export type StartRunInput = {
  title?: string;
  prompt?: string;
  displayPrompt?: string;
  mode?: WikiRun["mode"];
  knowledgeBaseId?: string;
  runtimeId?: AgentRuntimePreference;
  sessionId?: string;
  model?: string;
  effort?: AgentReasoningEffort;
  outputTarget?: AgentOutputTarget;
  sourceContext?: SourceRunContext;
  contextPageId?: string;
};

export class RunRequestError extends Error {
  constructor(readonly statusCode: number, message: string, readonly payload?: unknown) {
    super(message);
  }
}

