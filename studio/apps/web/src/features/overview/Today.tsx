import { TextArea } from "../../shared/form-controls";
import React, { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { PaymentJourneySummary, SourceImportBatch, TodayView, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent, shouldSubmitAgentInput } from "../collaboration/model";
import { ImportMaterialsModal, RecordImportTrigger } from "../sources/ImportMaterialsModal";
import { cleanSourcePath, importedFolderForBatch, pendingSourceBuildRecords } from "../sources/source-model";
import { resizeComposerTextarea } from "../../shared/composer-input";
import { Empty, Icon, Loading } from "../../shared/ui";
import { dailyPromptSeed, groundedConversationReplyPrompt, stablePromptOrder } from "./conversation-prompts";
import { todayOpeners, todayStarterPhrases } from "./talking-questions";

export function Today({ revision }: { revision: number }) {
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [importedJourney, setImportedJourney] = useState<PaymentJourneySummary>();
  const [questionOffset, setQuestionOffset] = useState(0);
  const [conversationDraft, setConversationDraft] = useState("");
  const conversationInputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => resizeComposerTextarea(conversationInputRef.current), [conversationDraft]);
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找回我们上次聊到的地方" />;
  if (error || !data) return <Empty>{error || "暂无数据"}</Empty>;
  const recentJourney = importedJourney || importBatches?.find((batch) => batch.journey)?.journey;
  const pendingBuilds = pendingSourceBuildRecords(importBatches || []);
  const pendingDialogueCount = pendingBuilds.filter(({ file }) => file.buildKind === "dialogue").length;
  const openers = stablePromptOrder([...todayOpeners], dailyPromptSeed());
  const featuredQuestion = openers[questionOffset % openers.length]!;
  const importFolders = [...new Set((sourcePages || []).map((page) => cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const journeyPrompt = recentJourney
    ? `最近的账单记录里出现了 ${recentJourney.clusters.length} 段可能的生活旅程。交易只能说明时间、地点和发生过什么，不能说明人物、动机和感受。请从最有画面的一条线索开始，一次问我一个问题，先陪我把这段经历说出来。`
    : "";

  function beginConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = conversationDraft.trim();
    if (!answer) return;
    openContextAgent({ mode: "read", prompt: groundedConversationReplyPrompt(featuredQuestion.agentPrompt, answer), displayPrompt: answer, autoSubmit: true });
    setConversationDraft("");
  }

  function submitConversationOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitAgentInput({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function beginWith(phrase: string) {
    setConversationDraft(phrase);
    window.setTimeout(() => conversationInputRef.current?.focus(), 0);
  }

  function cycleOpener() {
    setQuestionOffset((current) => current + 1);
    setConversationDraft("");
    window.setTimeout(() => conversationInputRef.current?.focus(), 0);
  }

  function openImportedFolder(batch: SourceImportBatch) {
    const importedFolder = importedFolderForBatch(batch);
    navigate({ pathname: "/sources", search: `?${new URLSearchParams({ ...(importedFolder ? { folder: importedFolder } : {}), batch: batch.id })}` });
  }

  return (
    <div className="home-overview">
      {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" onClose={() => setImportOpen(false)} onImported={openImportedFolder} onJourney={setImportedJourney} /> : null}
      <section className="home-intro-card" aria-labelledby="home-intro-title">
        <div className="home-intro-main">
          <span className="friend-mark" aria-hidden="true"><Icon name="message" size={22} /></span>
          <div>
            <div className="home-intro-identity"><h1 id="home-intro-title">The Way Here</h1><span>一个会越来越懂你的朋友</span></div>
            <p>我们聊得越多，我就越懂你。<br />你也可以把日记、聊天记录或账单带给我看，帮我更快跟上你。</p>
          </div>
        </div>
        <div className="home-intro-ways">
          <button type="button" onClick={() => openContextAgent({ mode: "read" })}><Icon name="message" size={16} />和你聊天</button>
          <RecordImportTrigger onClick={() => setImportOpen(true)} />
        </div>
      </section>

      {pendingBuilds.length ? <NavLink className="home-pending-build" to="/sources?type=pending"><i aria-hidden="true" /><span><b>{pendingBuilds.length} 份新带进来的记录还没聊透</b>{pendingDialogueCount ? ` · ${pendingDialogueCount} 份在等一次对话` : " · 随时可以收进已有理解"}</span><Icon name="arrow" size={15} /></NavLink> : null}

      <section className="home-opener" aria-labelledby="home-opener-title">
        <div className="home-opener-copy">
          <span className="home-memory-label"><i aria-hidden="true" />此刻的话头</span>
          <h2 id="home-opener-title">{featuredQuestion.question}</h2>
        </div>
        <div className="home-opener-starters" aria-label="帮我起个头">
          {todayStarterPhrases.map((phrase) => <button type="button" key={phrase} onClick={() => beginWith(phrase)}>{phrase}</button>)}
        </div>
        <form className="home-opener-form" onSubmit={beginConversation}>
          <div className="text-field-shell">
            <TextArea ref={conversationInputRef} rows={1} aria-label="接着说" value={conversationDraft} onChange={(event) => setConversationDraft(event.target.value)} onKeyDown={submitConversationOnEnter} placeholder="接着说，先说一句就行" />
            <button type="submit" aria-label="发送" disabled={!conversationDraft.trim()}><Icon name="up" size={19} /></button>
          </div>
          <div className="home-opener-foot">
            <button type="button" className="home-opener-cycle" onClick={cycleOpener}><Icon name="refresh" size={16} />换一个随口话头</button>
            <span>我会先看看你的来路</span>
          </div>
        </form>
      </section>
      <ContextualAgentDock revision={revision} context={{ scope: "此刻 · 随口话头", title: featuredQuestion.question, summary: "从一个新近发生的具体片段开始；收到回答后，再沿相关 Wiki 和原始记录理解它的来路。", defaultMode: "read", launcherLabel: "找我聊聊", compactLauncher: true, suggestions: [featuredQuestion.agentPrompt, journeyPrompt || "我想讲一件最近发生、但还没有说清楚的事。请一次问我一个具体问题，先陪我理解。"] }} />
    </div>
  );
}
