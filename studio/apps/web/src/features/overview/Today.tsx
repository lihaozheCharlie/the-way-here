import { SourceConnectionsPanel } from "../sources/SourceConnectionsPanel";
import { openDesktopWindow } from "../desktop/bridge";
import { PageLink } from "../../shared/routing";
import { TextArea } from "../../shared/form-controls";
import React, { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { PaymentJourneySummary, SourceImportBatch, TodayView, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
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

  if (sourcePages && !sourcePages.length && !data.recentPages.length && !data.latestLetter) return (
    <div className="home-overview first-library">
      <header className="desktop-today-head"><h1>从你的第一段记录开始</h1><p>你的知识库已经准备好。连接已有资料，或先记下今天的一件事。</p></header>
      <section className="desktop-today-capture"><h2>把已有资料连接进来</h2><SourceConnectionsPanel /></section>
      <section className="desktop-today-capture"><h2>也可以先记一笔</h2><p>记录和浏览资料不需要配置 AI。想一起整理、聊聊时，再选择你的 AI 助手。</p><div>
        <button type="button" onClick={() => window.desktop ? void openDesktopWindow("/capture", "capture") : navigate("/capture")}>写下第一段记录</button>
        <button type="button" onClick={() => window.desktop ? void openDesktopWindow("/preferences?tab=ai", "settings") : navigate("/preferences?tab=ai")}>设置 AI 助手</button>
      </div></section>
    </div>
  );

  return (
    <div className="home-overview">
      {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" onClose={() => setImportOpen(false)} onImported={openImportedFolder} onJourney={setImportedJourney} /> : null}
      <header className="desktop-today-head"><h1>{new Date().getHours() < 12 ? "早上好" : new Date().getHours() < 18 ? "下午好" : "晚上好"}，欢迎回来</h1><p>{new Date().toLocaleDateString("zh-CN", { month:"long", day:"numeric", weekday:"long" })} · {data.conversationPrompts.filter(item => item.status === "active").length} 条值得聊聊的话题{data.latestLetter ? " · 有一封近况回信等你读" : ""}</p></header>
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
      <section className="desktop-today-reminder"><Icon name="spark" size={18} /><div><h2>今日提醒</h2><p>{data.conversationPrompts.find(item => item.status === "active")?.question || data.guidingQuestion || "最近发生的事，都可以从一句话开始说。"}</p></div><NavLink to="/questions">看看话题 <Icon name="arrow" size={14} /></NavLink></section>
      <div className="desktop-today-grid"><section><h2>最近的线索</h2><div className="desktop-keywords">{[...new Set(data.recentPages.flatMap(page => page.tags.filter(tag => !tag.includes("/"))))].slice(0,5).map(tag => <NavLink to={`/search?q=${encodeURIComponent(tag)}`} key={tag}>{tag}</NavLink>)}{!data.recentPages.some(page => page.tags.length) ? <p>留下生活记录，线索会慢慢浮现。</p> : null}</div></section><section><h2>近期理解</h2>{data.recentPages.filter(page => !page.isSource && page.category !== "maintenance").slice(0,2).map(page => <PageLink key={page.id} page={page} />)}{!data.recentPages.length ? <p>你的理解会从真实记录里生长。</p> : null}</section></div>
      <section className="desktop-today-capture"><h2>随手记一笔</h2><p>日记、照片、AI 对话和账单，都可以成为下一次理解的来路。</p><div><button type="button" onClick={() => window.desktop ? void openDesktopWindow("/capture", "capture") : navigate("/capture")}><Icon name="journal" size={15} />写一段或说一段</button><RecordImportTrigger onClick={() => setImportOpen(true)} /></div></section>
      <PageAgentContext context={{ scope: "此刻 · 随口话头", title: featuredQuestion.question, summary: "从一个新近发生的具体片段开始；收到回答后，再沿相关 Wiki 和原始记录理解它的来路。", defaultMode: "read", suggestions: [featuredQuestion.agentPrompt, journeyPrompt || "我想讲一件最近发生、但还没有说清楚的事。请一次问我一个具体问题，先陪我理解。"] }} />
    </div>
  );
}
