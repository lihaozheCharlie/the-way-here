import { isTerminalRunStatus } from "@the-way-here/shared";
import { TextArea, VoiceInputForTextArea } from "../../shared/form-controls";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentApprovalDecision, AgentOutputTarget, DeletedAgentConversation, SourceRunContext, VaultInfo, WikiRun } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { ConfirmDeleteDialog } from "../../shared/ConfirmDeleteDialog";
import { resizeComposerTextarea } from "../../shared/composer-input";
import { Icon, Loading } from "../../shared/ui";
import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { useRememberedWindow } from "../../shared/use-remembered-preview";
import { AgentComposerSettings, reasoningLabels, useAgentSelection, type AgentSettingsController } from "./AgentSettings";
import { AgentAnswer } from "./AgentAnswer";
import { JOURNEY_WRAP_UP_DISPLAY_PROMPT, JOURNEY_WRAP_UP_PROMPT, agentContextIdentity, attachedContextPrompt, boundAgentThreadForPage, boundAgentThreadForTopic, collaborationModes, contextPrompt, groupAgentThreads, isJourneyWrapUpRun, plainPreview, resolveAgentAutoSubmission, resolveComposerMode, resolveRunContext, continuationModelSelection, runDisplayPrompt, runFinalAnswer, shouldSubmitAgentInput, visibleAgentAnswer, type AgentAttachedContext, type AgentAutoSubmission, type AgentContext, type AgentThread, type OpenContextAgentRequest } from "./model";
import { useAgentStream } from "./use-agent-stream";

type DockView = "compose" | "history";
type ConversationMode = "auto" | "chat" | "read" | "write";

function ModePicker({ mode, onChange }: { mode: ConversationMode; onChange: (mode: ConversationMode) => void }) {
  const labels: Record<ConversationMode, string> = { auto: "自动模式", chat: "聊天模式", read: "Wiki 只读模式", write: "Wiki 写入模式" };
  const pickerRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) pickerRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);
  return <details ref={pickerRef} className="agent-mode-picker" onKeyDown={(event) => { if (event.key === "Escape") { pickerRef.current!.open = false; event.stopPropagation(); } }}>
    <summary aria-label={`对话模式：${labels[mode]}`}><Icon name="spark" size={13} /><span>{labels[mode]}</span><Icon name="down" size={12} /></summary>
    <div className="agent-mode-menu" role="group" aria-label="选择对话模式">{(Object.keys(labels) as ConversationMode[]).map((value) => <button key={value} type="button" className={value === mode ? "is-selected" : ""} aria-pressed={value === mode} onClick={() => { onChange(value); pickerRef.current!.open = false; }}>{labels[value]}{value === mode && <Icon name="check" size={13} />}</button>)}</div>
  </details>;
}

function modelChipLabel(agent: AgentSettingsController): string {
  const model = agent.runtimeId === "codex" ? agent.codexModels.find((entry) => entry.id === agent.model)?.displayName || agent.model : agent.selectedThirdPartyModel.displayName;
  return `${model} · ${reasoningLabels[agent.effort]}`;
}

function submitAgentFormOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
  if (!shouldSubmitAgentInput({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

export function AgentDock({ revision, context, initialRunId = "", embedded = false }: { revision: number; context: AgentContext; initialRunId?: string; embedded?: boolean }) {
  const { data: vault, loading: vaultLoading } = useApi<VaultInfo>("/api/vault", revision);
  const [runListRevision, setRunListRevision] = useState(0);
  const { data: runList, loading: runsLoading, error: runsError } = useApi<WikiRun[]>("/api/runs", revision + runListRevision);
  const agent = useAgentSelection(revision);
  const [view, setView] = useState<DockView>(initialRunId ? "history" : "compose");
  const [draft, setDraft] = useState("");
  const [attachedContext, setAttachedContext] = useState<AgentAttachedContext>();
  const [runId, setRunId] = useState(initialRunId);
  const [topicRestore, setTopicRestore] = useState<"loading" | "error">();
  const topicRequestRef = useRef(0);
  const [historyReturnRunId, setHistoryReturnRunId] = useState("");
  const [mode, setMode] = useState<WikiRun["mode"]>(() => resolveComposerMode(context.defaultMode, context.defaultOutputTarget));
  const [conversationMode, setConversationMode] = useState<ConversationMode>("auto");
  const [outputTarget, setOutputTarget] = useState<AgentOutputTarget | undefined>(() => context.defaultOutputTarget);
  const [sourceContext, setSourceContext] = useState<SourceRunContext | undefined>(() => context.defaultSourceContext);
  const [runContextOverride, setRunContextOverride] = useState<AgentContext>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoredContextRef = useRef("");
  const submittingRef = useRef(false);
  const pendingAutoSubmissionRef = useRef<AgentAutoSubmission | undefined>(undefined);
  const threads = groupAgentThreads(runList || []);
  const contextIdentity = agentContextIdentity(context);
  const boundRunId = boundAgentThreadForPage(runList || [], context.pageId)?.latest.id || "";

  useEffect(() => {
    const openDock = (event: Event) => {
      const request = (event as CustomEvent<OpenContextAgentRequest>).detail || {};
      const requestVersion = ++topicRequestRef.current;
      setTopicRestore(undefined);
      pendingAutoSubmissionRef.current = undefined;
      window.dispatchEvent(new Event("show-inspector"));
      restoredContextRef.current = contextIdentity;
      setError("");
      if (request.runId) {
        setRunId(request.runId);
        setView("history");
        return;
      }
      setRunId("");
      setView(request.view || "compose");
      const requestedOutputTarget = request.outputTarget || (!request.autoSubmit ? context.defaultOutputTarget : undefined);
      const requestedSourceContext = request.sourceContext || (!request.autoSubmit ? context.defaultSourceContext : undefined);
      const resolvedRequest = { ...request, outputTarget: requestedOutputTarget, sourceContext: requestedSourceContext };
      const autoSubmission = request.view === "history" ? undefined : resolveAgentAutoSubmission(resolvedRequest, context.defaultMode);
      setDraft(request.prompt !== undefined ? autoSubmission?.displayPrompt || request.prompt : "");
      setAttachedContext(request.attachedContext);
      setMode(resolveComposerMode(request.mode || context.defaultMode, requestedOutputTarget, request.lockMode));
      setConversationMode(request.mode === "write" ? "write" : request.mode === "read" ? "read" : "auto");
      setOutputTarget(requestedOutputTarget);
      setSourceContext(requestedSourceContext);
      setRunContextOverride(request.contextOverride);
      pendingAutoSubmissionRef.current = autoSubmission;
      if (request.attachedContext?.topicId) {
        const topic = request.attachedContext;
        setTopicRestore("loading");
        void Promise.all([api<WikiRun[]>("/api/runs"), vault ? Promise.resolve(vault) : api<VaultInfo>("/api/vault")]).then(([runs, boundVault]) => {
          if (topicRequestRef.current !== requestVersion) return;
          const previous = boundAgentThreadForTopic(runs, topic, boundVault.knowledgeBaseId);
          if (previous) {
            setRunId(previous.latest.id);
            setView("history");
            pendingAutoSubmissionRef.current = undefined;
          }
          setRunListRevision((value) => value + 1);
          setTopicRestore(undefined);
        }).catch((reason: Error) => {
          if (topicRequestRef.current !== requestVersion) return;
          setError(`无法读取上次的聊天记录：${reason.message}`);
          setTopicRestore("error");
        });
      }
    };
    window.addEventListener("open-context-agent", openDock);
    return () => window.removeEventListener("open-context-agent", openDock);
  }, [context.defaultMode, context.defaultOutputTarget, context.defaultSourceContext, contextIdentity, vault?.knowledgeBaseId]);

  useEffect(() => () => { topicRequestRef.current += 1; }, []);
  const previousKnowledgeBaseRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previousKnowledgeBaseRef.current && previousKnowledgeBaseRef.current !== vault?.knowledgeBaseId) {
      topicRequestRef.current += 1;
      setTopicRestore(undefined);
      setRunId("");
      setAttachedContext(undefined);
      setRunContextOverride(undefined);
      restoredContextRef.current = "";
    }
    previousKnowledgeBaseRef.current = vault?.knowledgeBaseId;
  }, [vault?.knowledgeBaseId]);

  useLayoutEffect(() => {
    if (view === "compose" && !runId) resizeComposerTextarea(textareaRef.current);
  }, [draft, runId, view]);

  useEffect(() => {
    if (runsLoading || restoredContextRef.current === contextIdentity) return;
    restoredContextRef.current = contextIdentity;
    setDraft("");
    setAttachedContext(undefined);
    setRunId(initialRunId || boundRunId);
    setMode(resolveComposerMode(context.defaultMode, context.defaultOutputTarget));
    setConversationMode("auto");
    setOutputTarget(context.defaultOutputTarget);
    setSourceContext(context.defaultSourceContext);
    setRunContextOverride(undefined);
    setView(initialRunId || boundRunId ? "history" : "compose");
    // Restore the bound conversation quietly; only an explicit action opens the dock.
    setError("");
    pendingAutoSubmissionRef.current = undefined;
  }, [boundRunId, context.defaultMode, context.defaultOutputTarget, context.defaultSourceContext, contextIdentity, runsLoading]);

  useEffect(() => {
    const pending = pendingAutoSubmissionRef.current;
    if (topicRestore || !pending || view !== "compose" || runId || submitting || vaultLoading || agent.loading || !vault?.agentAvailable) return;
    pendingAutoSubmissionRef.current = undefined;
    void startRun(pending.prompt, pending.mode, pending.outputTarget, pending.displayPrompt, pending.sourceContext, pending.contextOverride);
  }, [agent.loading, runId, submitting, vault?.agentAvailable, vaultLoading, view, topicRestore]);

  function startNewQuestion() {
    topicRequestRef.current += 1;
    setTopicRestore(undefined);
    setRunId("");
    setHistoryReturnRunId("");
    setView("compose");
    setDraft("");
    setAttachedContext(undefined);
    setMode(resolveComposerMode(context.defaultMode, context.defaultOutputTarget));
    setConversationMode("auto");
    setOutputTarget(context.defaultOutputTarget);
    setSourceContext(context.defaultSourceContext);
    setRunContextOverride(undefined);
    setError("");
    pendingAutoSubmissionRef.current = undefined;
  }

  function showHistory(returnToRunId = "") {
    topicRequestRef.current += 1;
    setTopicRestore(undefined);
    setHistoryReturnRunId(returnToRunId);
    setRunId("");
    setView("history");
  }

  function leaveHistory() {
    if (historyReturnRunId) {
      setRunId(historyReturnRunId);
      setHistoryReturnRunId("");
      return;
    }
    setView("compose");
  }

  async function deleteConversation(thread: AgentThread): Promise<void> {
    const deleted = await api<DeletedAgentConversation>(`/api/runs/${encodeURIComponent(thread.latest.id)}`, { method: "DELETE" });
    if (deleted.deletedRunIds.includes(runId)) startNewQuestion();
    setHistoryReturnRunId((current) => deleted.deletedRunIds.includes(current) ? "" : current);
    setRunListRevision((value) => value + 1);
  }

  async function startRun(requestText: string, requestedMode = mode, requestedOutputTarget = outputTarget, displayPrompt = requestText, requestedSourceContext = sourceContext, requestedContext = runContextOverride) {
    const request = requestText.trim();
    if (requestedMode !== "validate" && !request) {
      setError("先写下你想从哪里开始。");
      return;
    }
    if (topicRestore || submittingRef.current || vaultLoading || agent.loading || !vault?.agentAvailable) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const selection = requestedMode === "validate" ? undefined : await agent.save();
      const normalizedRequest = requestedMode === "validate" ? request || "运行当前知识库的质量检查。" : request;
      const runContext = resolveRunContext(context, requestedContext, attachedContext);
      const run = await api<WikiRun>("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          mode: requestedMode === "auto" && conversationMode !== "auto" ? conversationMode === "chat" ? "read" : conversationMode : requestedMode,
          chatOnly: requestedMode === "auto" && conversationMode === "chat",
          prompt: requestedMode === "validate" ? normalizedRequest : conversationMode === "chat" ? normalizedRequest : contextPrompt(runContext, attachedContext ? attachedContextPrompt(attachedContext, normalizedRequest) : normalizedRequest),
          displayPrompt: displayPrompt.trim() || normalizedRequest,
          runtimeId: selection?.runtimeId,
          model: selection?.model,
          effort: selection?.effort,
          title: requestedMode === "validate" ? "知识健康检查" : `处理：${runContext.title}`,
          sourceModule: requestedMode === "validate" ? "系统检查" : runContext.scope.split(" · ")[0],
          outputTarget: requestedOutputTarget,
          sourceContext: requestedSourceContext,
          contextPageId: runContext.pageId,
          contextTopicId: attachedContext?.topicId,
          knowledgeBaseId: vault?.knowledgeBaseId,
        }),
      });
      setRunListRevision((value) => value + 1);
      setRunId(run.id);
      setView("history");
      setDraft("");
      setAttachedContext(undefined);
    } catch (reason: any) {
      setError(reason.message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await startRun(draft);
  }

  const selectedRun = runList?.find((candidate) => candidate.id === runId);
  const panelTitle = runId ? selectedRun?.title || `处理：${context.title}` : view === "history" ? "聊过的事" : "一起往下想";
  const closeDock = () => embedded ? startNewQuestion() : new URLSearchParams(window.location.search).has("detached") ? window.close() : window.dispatchEvent(new Event("hide-inspector"));
  const submitDisabled = submitting || (mode !== "validate" && !draft.trim()) || vaultLoading || (mode !== "validate" && agent.loading) || !vault?.agentAvailable;

  return <>
    <div className="context-agent-layer">
      <aside className="context-agent-panel" data-run-id={runId} role="complementary" aria-labelledby="context-agent-title">
        <header className="context-agent-header">
          <div className="context-agent-title">
            {!runId && view === "history" ? <button type="button" className="context-agent-icon-button" aria-label="返回对话" onClick={leaveHistory}><Icon name="back" size={17} /></button> : <span className="context-agent-spark"><Icon name="spark" size={14} /></span>}
            <h2 id="context-agent-title">{panelTitle}</h2>
          </div>
          <div className="context-agent-header-actions">
            {(runId || view === "compose") && <button type="button" className="context-agent-icon-button" aria-label={`聊过的事，${threads.length} 个话题`} title="聊过的事" onClick={() => showHistory(runId)}><Icon name="history" size={17} /></button>}
            {!runId && view === "history" && <button type="button" className="context-agent-icon-button" aria-label="开始新话题" title="开始新话题" onClick={startNewQuestion}><Icon name="plus" size={18} /></button>}
            {!embedded && <button type="button" className="context-agent-icon-button" aria-label="关闭对话窗口" onClick={closeDock}><Icon name="close" size={17} /></button>}
          </div>
        </header>
        {topicRestore === "loading" ? <Loading label="正在找回这个话题的聊天记录" /> : topicRestore === "error" ? <p role="alert">{error}。请关闭后重新打开这个话题。</p> : runId ? <ContextualRunPanel agent={agent} runId={runId} revision={revision} runList={runList || []} onRunId={setRunId} onNew={startNewQuestion} onClose={closeDock} /> : view === "history" ? <AgentHistory threads={threads} loading={runsLoading} error={runsError} knowledgeBaseName={vault?.name} onOpen={setRunId} onNew={startNewQuestion} onDelete={deleteConversation} /> : <form className="context-agent-compose" onSubmit={submit}>
          <div className={`context-agent-compose-body${draft ? " has-draft" : ""}`}>
            {outputTarget?.kind === "letter-version" && <div className="context-output-target"><Icon name="library" size={15} /><div><b>将保留为「{outputTarget.label}」</b><span>完成后会成为这封回信的最新版本，原始回信仍可随时切换查看。</span></div></div>}
            {(outputTarget?.kind === "journey-report" || outputTarget?.kind === "photo-memory") && <div className="context-output-target is-journey"><Icon name="receipt" size={15} /><div><b>只更新「{outputTarget.label}」</b><span>会查阅已有 Wiki 帮你理解线索，但这段对话不会构建或修改 Wiki。</span></div></div>}
            {mode === "validate" ? <div className="context-validate-summary"><span className="context-agent-empty-glyph"><Icon name="check" size={20} /></span><b>检查当前知识库</b><p>运行既有标签、链接与结构检查，不生成新的知识内容。</p></div> : null}
          </div>
          <div className="context-agent-composer">
            <div className={`text-field-shell context-composer-shell agent-composer-stacked${mode === "validate" ? " validate" : ""}`}>
              {mode === "validate" ? <span>运行标签、链接与结构检查</span> : <TextArea voice={false} ref={textareaRef} id={`context-prompt-${context.pageId || context.scope}`} name="context-prompt" autoComplete="off" value={draft} onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }} onKeyDown={submitAgentFormOnEnter} placeholder={attachedContext ? "我已经带上了这页的上下文，说说你想聊、补充或整理什么" : "想从哪里开始？"} rows={1} />}
              <div className="agent-composer-toolbar"><div className="agent-composer-toolbar-left">{mode !== "validate" && <ModePicker mode={conversationMode} onChange={setConversationMode} />}</div><div className="agent-composer-toolbar-right">{mode !== "validate" && <AgentComposerSettings id={`context-ai-${context.pageId || context.scope}`} agent={agent} label={modelChipLabel(agent)} />}{mode !== "validate" && <VoiceInputForTextArea textareaRef={textareaRef} />}<button type="submit" className="context-agent-send" disabled={submitDisabled} aria-label={submitting ? "正在开始" : collaborationModes[mode].action} title={submitting ? "正在开始…" : collaborationModes[mode].action}><Icon name="up" size={16} /></button></div></div>
            </div>
            {(mode !== "auto" || outputTarget?.kind === "photo-memory" || outputTarget?.kind === "journey-report") && <p className="context-agent-boundary">{outputTarget?.kind === "photo-memory" ? "只保存对话或故事草稿；回到讲故事后收进理解" : outputTarget?.kind === "journey-report" ? "Wiki 仅检索；本轮只更新消费旅程报告" : collaborationModes[mode].boundary}</p>}
            {error && <p className="context-agent-error" role="alert">{error}</p>}
            {!vaultLoading && !vault?.agentAvailable && <p className="context-agent-offline">暂时无法开始对话；请在偏好设置中连接 AI 助手。</p>}
          </div>
        </form>}
      </aside>
    </div>
  </>;
}

function AgentHistory({ threads, loading, error, knowledgeBaseName, onOpen, onNew, onDelete }: { threads: AgentThread[]; loading: boolean; error?: string; knowledgeBaseName?: string; onOpen: (id: string) => void; onNew: () => void; onDelete: (thread: AgentThread) => Promise<void> }) {
  const [deleteTarget, setDeleteTarget] = useState<AgentThread>();
  return <section className="context-agent-history">
    <p className="context-history-scope">{knowledgeBaseName ? `这些对话只留在「${knowledgeBaseName}」。` : "这里只显示当前个人空间里的对话。"}</p>
    {loading ? <Loading label="正在整理对话历史" /> : error ? <div className="context-history-empty"><b>暂时无法读取对话历史</b><p>{error}</p></div> : threads.length ? <div className="context-history-list">{threads.map((thread) => {
      const answer = runFinalAnswer(thread.latest);
      const title = runDisplayPrompt(thread.runs[0]!);
      const active = thread.runs.some((run) => !isTerminalRunStatus(run.status));
      return <article className="context-history-item" key={thread.id}>
        <button type="button" className="context-history-open" onClick={() => onOpen(thread.latest.id)}>
          <span className="context-history-meta"><RunStatus status={thread.latest.status} /><time>{new Date(thread.latest.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span>
          <b>{title}</b>
          <p>{plainPreview(answer, thread.latest.error || (thread.latest.status === "completed" ? "已完成，打开查看回答" : "任务仍在进行"))}</p>
          <small>{thread.latest.outputTarget?.kind === "letter-version" ? thread.latest.outputTarget.label : collaborationModes[thread.latest.mode].short}{thread.runs.length > 1 ? ` · ${thread.runs.length} 轮对话` : ""}</small>
        </button>
        <button type="button" className="context-history-delete" onClick={() => setDeleteTarget(thread)} disabled={active} aria-label={active ? `“${title}”仍在进行，结束后可删除` : `删除对话“${title}”`} title={active ? "结束对话后才能删除" : "删除对话"}><Icon name="trash" size={15} /></button>
      </article>;
    })}</div> : <div className="context-history-empty"><b>我们还没有聊过</b><p>从现在真正想说的事开始，这段对话会留在这里。</p><button type="button" onClick={onNew}>开始聊聊</button></div>}
    {deleteTarget ? <ConfirmDeleteDialog title="删除这段对话？" description="这会删除这段对话在当前知识库里的全部轮次。" itemName={runDisplayPrompt(deleteTarget.runs[0]!)} impact={`共 ${deleteTarget.runs.length} 轮对话将从本机永久删除。已经写入生活记录或已有理解的内容会保留，此操作不能撤销。`} confirmLabel="删除对话" onClose={() => setDeleteTarget(undefined)} onConfirm={() => onDelete(deleteTarget)} /> : null}
  </section>;
}

export function ContextualRunPanel({ agent, runId, revision, runList, onRunId, onNew, onClose }: { agent: AgentSettingsController; runId: string; revision: number; runList: WikiRun[]; onRunId: (id: string) => void; onNew: () => void; onClose: () => void }) {
  const [actionRevision, setActionRevision] = useState(0);
  const { data: run, loading, error } = useApi<WikiRun>(`/api/runs/${runId}`, revision + actionRevision);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [finishingJourney, setFinishingJourney] = useState(false);
  const [continuingAfterWrapUp, setContinuingAfterWrapUp] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [actionError, setActionError] = useState("");
  const [conversationMode, setConversationMode] = useState<ConversationMode>("auto");
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  const [buildRunId, setBuildRunId] = useState("");
  const [buildStatus, setBuildStatus] = useState<WikiRun["status"]>();
  const [buildNotice, setBuildNotice] = useState("");
  const [showBuildDone, setShowBuildDone] = useState(false);
  const buildDialogRef = useRef<HTMLDialogElement>(null);
  const buildWindow = useRememberedWindow(`agent-build:${runId}`);
  useDismissLayer(buildWindow.open, buildWindow.hide, { priority: 2, element: buildDialogRef, outside: true });
  useEffect(() => { if (buildWindow.open) { if (!buildDialogRef.current?.open) buildDialogRef.current?.show(); } else buildDialogRef.current?.close(); }, [buildWindow.open]);
  const statusRef = useRef<HTMLDivElement>(null);
  const followStreamRef = useRef(true);
  const stream = useAgentStream(runId, !!run && !isTerminalRunStatus(run.status));
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (loading || !run) return;
    const frame = window.requestAnimationFrame(() => {
      statusRef.current?.focus({ preventScroll: true });
      statusRef.current?.scrollTo({ top: statusRef.current.scrollHeight });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [runId, loading]);
  useLayoutEffect(() => resizeComposerTextarea(replyTextareaRef.current), [reply]);
  useLayoutEffect(() => {
    const body = statusRef.current;
    if (body && followStreamRef.current) body.scrollTop = body.scrollHeight;
  }, [stream.draft?.text, run?.status, run?.events.length]);
  useEffect(() => { setStopping(false); setFinishingJourney(false); setContinuingAfterWrapUp(false); }, [runId]);
  useEffect(() => { if (run) setConversationMode(run.chatOnly ? "chat" : run.mode === "write" ? "write" : run.mode === "read" ? "read" : "auto"); }, [runId]);
  useEffect(() => {
    if (!buildRunId) return;
    const timer = window.setInterval(() => {
      void api<WikiRun>(`/api/runs/${buildRunId}`).then((build) => {
        setBuildStatus(build.status);
        if (isTerminalRunStatus(build.status)) {
          window.clearInterval(timer);
          setBuildNotice(build.status === "completed" ? "日记与 Wiki 构建已完成" : `构建未完成：${build.error || "请查看任务详情"}`);
        }
      }).catch((reason: Error) => { window.clearInterval(timer); setBuildNotice(`无法读取构建进度：${reason.message}`); });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [buildRunId]);
  useEffect(() => { if (run && isTerminalRunStatus(run.status)) setStopping(false); }, [run?.status]);
  useEffect(() => {
    if (buildStatus !== "completed") return;
    setShowBuildDone(true);
    const timer = window.setTimeout(() => setShowBuildDone(false), 3200);
    return () => window.clearTimeout(timer);
  }, [buildStatus]);
  if (loading && !run) return <Loading label="正在接入知识上下文" />;
  if (error || !run) return <div className="context-run-error"><p>{error || "这次对话没有找到。"}</p><button onClick={() => onRunId("")}>返回对话历史</button></div>;
  const activeRun = run;
  const active = ["preparing", "running", "waiting-approval", "validating"].includes(activeRun.status);
  const hasFailed = activeRun.status === "failed" || activeRun.status === "interrupted";
  const isJourneyConversation = activeRun.outputTarget?.kind === "journey-report" || activeRun.sourceContext?.flow === "dialogue";
  const isPhotoConversation = activeRun.outputTarget?.kind === "photo-memory";
  const legacyJourneyConversation = isJourneyConversation && activeRun.outputTarget?.kind !== "journey-report" && !isPhotoConversation;
  const journeyWrappedUp = isJourneyWrapUpRun(activeRun);
  const draft = stream.draft;
  const visibleDraft = draft ? visibleAgentAnswer(draft.text, activeRun.outputTarget) : "";
  const phase = activeRun.status === "waiting-approval" ? "需要你确认后继续" : activeRun.status === "validating" ? "正在检查更新" : stream.phase;
  const buildInProgress = Boolean(buildRunId && buildStatus && !isTerminalRunStatus(buildStatus));
  const buildTooltip = buildInProgress ? "后台构建中…可以继续聊别的" : showBuildDone ? "日记与 Wiki 构建已完成" : "整理成日记并构建 Wiki";
  const storedThreadRuns = activeRun.runtimeSessionId ? runList.filter((candidate) => candidate.runtimeSessionId === activeRun.runtimeSessionId) : [];
  const threadRuns = [...storedThreadRuns.filter((candidate) => candidate.id !== activeRun.id), activeRun]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  async function approve(requestId: string | number, decision: AgentApprovalDecision) {
    setActionError("");
    try {
      await api(`/api/runs/${activeRun.id}/approval`, { method: "POST", body: JSON.stringify({ requestId, decision }) });
    } catch (reason: any) {
      setActionError(reason.message);
    }
  }

  async function interrupt() {
    if (!active || activeRun.status === "validating" || stopping) return;
    setStopping(true);
    setActionError("");
    try {
      await api(`/api/runs/${activeRun.id}/interrupt`, { method: "POST" });
      setActionRevision((value) => value + 1);
    } catch (reason: any) {
      setStopping(false);
      setActionError(reason.message);
    }
  }

  async function sendFollowUp(requestText: string, displayPrompt = requestText) {
    if (!requestText.trim() || sending || stopping || (!active && (agent.loading || agent.saving)) || activeRun.status === "validating") return;
    if (active && legacyJourneyConversation) {
      setActionError("这段旧对话仍在按原流程运行；等本轮结束后再继续，下一轮就会切换为只更新消费旅程报告。");
      return;
    }
    setSending(true);
    setActionError("");
    try {
      if (active) {
        await api(`/api/runs/${activeRun.id}/steer`, { method: "POST", body: JSON.stringify({ prompt: requestText }) });
      } else {
        continuationModelSelection(activeRun, agent);
        const selection = continuationModelSelection(activeRun, await agent.save());
        const legacyJourneyTarget = activeRun.sourceContext?.flow === "dialogue" && activeRun.outputTarget?.kind !== "journey-report" && !isPhotoConversation
          ? { kind: "journey-report" as const, importId: activeRun.sourceContext.importId, storedPath: activeRun.sourceContext.storedPath, label: "消费旅程报告" }
          : undefined;
        const next = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({
          mode: legacyJourneyTarget ? "read" : conversationMode === "chat" ? "read" : conversationMode,
          chatOnly: !legacyJourneyTarget && conversationMode === "chat",
          prompt: requestText,
          displayPrompt,
          ...selection,
          title: legacyJourneyTarget ? "继续丰富消费旅程" : `继续${collaborationModes[activeRun.mode].short}`,
          sessionId: activeRun.runtimeSessionId,
          knowledgeBaseId: activeRun.knowledgeBaseId,
          outputTarget: legacyJourneyTarget,
          sourceContext: legacyJourneyTarget ? { ...activeRun.sourceContext, operation: "enrich" } : undefined,
        }) });
        onRunId(next.id);
      }
      setReply("");
    } catch (reason: any) {
      setActionError(reason.message);
    } finally {
      setSending(false);
    }
  }

  async function followUp(event: React.FormEvent) {
    event.preventDefault();
    await sendFollowUp(reply);
  }

  async function finishJourney() {
    if (active || isPhotoConversation || finishingJourney) return;
    setFinishingJourney(true);
    await sendFollowUp(JOURNEY_WRAP_UP_PROMPT, JOURNEY_WRAP_UP_DISPLAY_PROMPT);
    setFinishingJourney(false);
  }

  async function startBackgroundBuild() {
    buildWindow.hide();
    setActionError("");
    setBuildNotice("");
    setShowBuildDone(false);
    try {
      const build = await api<WikiRun>(`/api/runs/${activeRun.id}/build-conversation`, { method: "POST" });
      setBuildRunId(build.id);
      setBuildStatus(build.status);
      setDismissedSuggestions((previous) => new Set([...previous, ...threadRuns.map((item) => item.id)]));
      setBuildNotice("已在后台开始整理，你可以继续聊天");
    } catch (reason: any) { setActionError(`无法开始构建：${reason.message}`); }
  }

  return <div className="context-run">
    <div ref={statusRef} tabIndex={-1} className="context-run-body" onScroll={(event) => { const body = event.currentTarget; followStreamRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 80; }}>
      {activeRun.outputTarget?.kind === "letter-version" && <div className={`context-run-artifact ${activeRun.status === "completed" ? "saved" : "pending"}`}><Icon name={activeRun.status === "completed" ? "library" : "spark"} size={15} /><div><b>{activeRun.status === "completed" ? `已保留为「${activeRun.outputTarget.label}」` : `完成后将保留为「${activeRun.outputTarget.label}」`}</b><span>{activeRun.status === "completed" ? "关闭窗口后，回信页会默认显示这个最新版本。" : "原始回信不会被覆盖，完成后可在回信页切换版本。"}</span></div></div>}
      {isPhotoConversation && <div className="context-run-artifact pending"><Icon name="image" size={15} /><div><b>讲述只保存为照片记忆草稿</b><span>关闭抽屉回到“讲故事”，核对后点击“收进理解”。</span></div></div>}
      {legacyJourneyConversation && <div className="context-run-artifact journey pending"><Icon name="receipt" size={15} /><div><b>继续聊聊会先丰富消费旅程报告</b><span>这是一段旧对话。下一段讲述开始只查阅 Wiki、更新报告；需要构建时再由你明确选择。</span></div></div>}
      <div className="context-thread" aria-label="对话内容">{threadRuns.map((threadRun) => {
      const answer = runFinalAnswer(threadRun);
      const isCurrent = threadRun.id === activeRun.id;
      return <section className="context-thread-turn" key={threadRun.id}>
        <div className="context-user-message"><p>{runDisplayPrompt(threadRun)}</p></div>
        <div className="context-message-meta"><RunStatus status={threadRun.status} /><span aria-hidden="true">·</span><span className="agent-turn-model">{threadRun.model?.split("/").at(-1) || "Agent"}</span><span aria-hidden="true">·</span><time>{new Date(threadRun.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
        {answer ? <><AgentAnswer answer={answer} run={threadRun} revision={revision} />{threadRun.wikiSuggestion && !dismissedSuggestions.has(threadRun.id) && !buildRunId && <div className="agent-wiki-suggestion" role="status"><Icon name="library" size={17} /><div><b>这段对话可以留到 Wiki</b><p>{threadRun.wikiSuggestion.summary}{threadRun.wikiSuggestion.page ? ` · 可能关联「${threadRun.wikiSuggestion.page}」` : ""}</p><div className="agent-wiki-suggestion-actions"><button type="button" onClick={() => buildWindow.show()}>整理成日记并构建 Wiki</button><button type="button" onClick={() => setDismissedSuggestions((previous) => new Set(previous).add(threadRun.id))}>继续聊天</button></div></div><button type="button" className="agent-wiki-suggestion-close" aria-label="关闭 Wiki 提示" onClick={() => setDismissedSuggestions((previous) => new Set(previous).add(threadRun.id))}><Icon name="close" size={15} /></button></div>}{isCurrent && active && <section className="context-run-working" role="status" aria-live="polite"><span className="working-mark" aria-hidden="true"><i /><i /><i /></span><b>{phase}</b></section>}</> : isCurrent && active ? <>
          {visibleDraft && <div className="context-run-answer context-streaming-answer">{visibleDraft}<span className="streaming-cursor" aria-hidden="true" /></div>}
          <section className="context-run-working" role="status" aria-live="polite"><span className="working-mark" aria-hidden="true"><i /><i /><i /></span><b>{phase}</b></section>
        </> : <div className="context-run-missing"><b>{threadRun.error ? "这次没有顺利完成" : "这轮没有留下可读回答"}</b><p>{threadRun.error || "可以在下方继续聊，或者把范围说得更具体一些。"}</p></div>}
      </section>;
      })}</div>
      {activeRun.approvals.map((approval) => <section className="context-approval-box" key={String(approval.requestId)} aria-live="polite"><span>需要你确认</span><h3>{approval.title}</h3><p>{approval.detail || String(approval.params?.reason || approval.params?.command || approval.method || approval.operation)}</p><small>允许只对这一次请求生效；拒绝后会保留现状。</small><div><button type="button" onClick={() => approve(approval.requestId, "deny")}>先不要</button><button type="button" className="primary-action" onClick={() => approve(approval.requestId, "allow-once")}>允许一次</button></div></section>)}
      {actionError && <p className="context-agent-error" role="alert">{actionError}</p>}
      {hasFailed && <button type="button" className="context-retry-run" onClick={onNew}>带着新问题重新开始</button>}
    </div>
    {buildNotice && <div className="agent-build-toast" role="status"><span>{buildNotice}</span>{buildRunId && buildStatus && isTerminalRunStatus(buildStatus) && <button type="button" onClick={() => onRunId(buildRunId)}>查看改动</button>}<button type="button" aria-label="关闭通知" onClick={() => setBuildNotice("")}><Icon name="close" size={13} /></button></div>}
    {activeRun.mode !== "validate" && journeyWrappedUp && !active && !continuingAfterWrapUp ? <section className="context-journey-complete" aria-live="polite">
      <div><Icon name="check" size={16} /><span><b>这段旅程已经整理好了</b><small>你说过的内容已留在报告里，没有说清的地方会保持未知。</small></span></div>
      <footer><button type="button" onClick={() => setContinuingAfterWrapUp(true)}>我还想补一句</button><button type="button" className="primary" onClick={onClose}>关闭对话</button></footer>
    </section> : activeRun.mode !== "validate" && <form className={`context-run-reply${isJourneyConversation ? " is-journey" : ""}`} onSubmit={followUp}>
      {isJourneyConversation ? <header className="context-journey-reply-heading"><span><b>{isPhotoConversation ? "继续聊聊，丰富这段记忆" : "继续聊聊，丰富旅程"}</b><small>你的下一段讲述只会更新报告，不会构建 Wiki。</small></span>{!isPhotoConversation && !active ? <button type="button" disabled={sending || finishingJourney} onClick={() => void finishJourney()}>{finishingJourney ? "正在整理…" : "这段先聊到这里"}</button> : null}</header> : null}
      <label className="sr-only" htmlFor={`context-run-reply-${run.id}`}>{active ? "再补充一句" : "沿着这件事继续聊"}</label>
      <div className="text-field-shell context-composer-shell agent-composer-stacked">
        <TextArea voice={false} ref={replyTextareaRef} id={`context-run-reply-${run.id}`} name="context-run-reply" autoComplete="off" value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={submitAgentFormOnEnter} placeholder={activeRun.status === "validating" ? "检查完成后即可继续聊聊…" : active && legacyJourneyConversation ? "本轮结束后即可按新流程继续…" : active ? "补充说明，按 Enter 发送…" : isJourneyConversation ? "补充人物、动机、当时的感受，或告诉我哪里需要修正…" : "接着说，或者提出新的要求"} rows={1} disabled={active && legacyJourneyConversation} />
        <div className="agent-composer-toolbar"><div className="agent-composer-toolbar-left">{!isJourneyConversation && <ModePicker mode={conversationMode} onChange={setConversationMode} />}</div><div className="agent-composer-toolbar-right">{!isJourneyConversation && <button type="button" className={`agent-wiki-build-button${buildInProgress ? " is-building" : showBuildDone ? " is-done" : " is-ready"}`} aria-disabled={buildInProgress} aria-label="整理成日记并构建 Wiki" onClick={() => { if (!buildInProgress) buildWindow.show(); }}><svg className="agent-wiki-build-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg><span className="agent-wiki-build-spinner" aria-hidden="true" /><Icon name="check" size={16} /><span className="agent-wiki-build-dot" aria-hidden="true" /><span className="agent-wiki-build-tooltip" role="tooltip">{buildTooltip}</span></button>}<AgentComposerSettings id={`context-reply-ai-${run.id}`} agent={agent} runtimeId={activeRun.runtimeId} label={modelChipLabel(agent)} />{!(active && legacyJourneyConversation) && <VoiceInputForTextArea textareaRef={replyTextareaRef} />}{active ? <button type="button" className="context-agent-send" onClick={interrupt} disabled={stopping || activeRun.status === "validating"} aria-label={stopping ? "正在停止" : "停止任务"} title={stopping ? "正在停止…" : activeRun.status === "validating" ? "正在检查，暂时无法停止" : "停止任务"} aria-busy={stopping}><Icon name="stop" size={16} /></button>
          : <button type="submit" className="context-agent-send" disabled={sending || agent.loading || agent.saving || !reply.trim()} aria-label={sending ? "正在发送" : "继续聊聊"} title={sending ? "正在发送…" : "继续聊聊"}><Icon name="up" size={16} /></button>}</div></div>
      </div>
    </form>}
    <dialog ref={buildDialogRef} className="agent-build-dialog" aria-labelledby="agent-build-dialog-title" onCancel={event => { event.preventDefault(); buildWindow.hide(); }}><div className="agent-build-dialog-heading"><Icon name="library" size={20} /><button type="button" aria-label="关闭弹窗" onClick={() => buildWindow.hide()}><Icon name="close" size={17} /></button></div><h2 id="agent-build-dialog-title">整理成日记并构建 Wiki</h2><p>将这段对话中你亲自讲述的内容整理成日记，再更新有充分依据的 Wiki 页面。Agent 的建议不会当作你的经历写入。</p><div className="agent-build-dialog-scope"><b>本次整理范围</b><span>当前对话 · {threadRuns.length} 轮</span><span>知识库 · {activeRun.knowledgeBaseId}</span></div><footer><button type="button" onClick={() => buildWindow.hide()}>继续聊天</button><button type="button" className="primary-action" onClick={() => void startBackgroundBuild()}>开始后台构建</button></footer></dialog>
  </div>;
}

function RunStatus({ status }: { status: WikiRun["status"] }) {
  const labels: Record<WikiRun["status"], string> = {
    preparing: "准备中", running: "运行中", "waiting-approval": "等待确认", validating: "正在验证", completed: "已完成", failed: "失败", interrupted: "已停止",
  };
  return <span className={`run-status ${status}`}><i />{labels[status]}</span>;
}
