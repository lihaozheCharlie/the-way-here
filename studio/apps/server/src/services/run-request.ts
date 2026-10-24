import type { AgentOutputTarget, AgentReasoningEffort, AgentRuntimePreference, SourceRunContext, WikiRun } from "@the-way-here/shared";

export type StartRunInput = {
  title?: string;
  prompt?: string;
  displayPrompt?: string;
  mode?: WikiRun["mode"];
  chatOnly?: boolean;
  knowledgeBaseId?: string;
  runtimeId?: AgentRuntimePreference;
  sessionId?: string;
  model?: string;
  effort?: AgentReasoningEffort;
  sourceModule?: string;
  outputTarget?: AgentOutputTarget;
  sourceContext?: SourceRunContext;
  contextPageId?: string;
  contextTopicId?: string;
};

/** A stale tab may still name the library it was opened on. Suggestion jobs keep the frozen run library. */
export function assertRunStaysInActiveLibrary(activeKnowledgeBaseId: string, requestedKnowledgeBaseId: string | undefined, suggestionForRunId?: string): void {
  const requested = requestedKnowledgeBaseId?.trim();
  if (suggestionForRunId || !requested || requested === activeKnowledgeBaseId) return;
  throw new RunRequestError(409, "不能跨知识库开始或继续对话。知识库已切换，请重新打开页面后再试；这次不会写入另一个知识库。");
}

export class RunRequestError extends Error {
  constructor(readonly statusCode: number, message: string, readonly payload?: unknown) {
    super(message);
  }
}
