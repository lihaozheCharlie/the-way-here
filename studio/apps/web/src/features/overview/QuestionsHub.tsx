import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { PaymentJourneySummary, SourceImportBatch, TodayView, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { ImportMaterialsModal, RecordImportTrigger } from "../sources/ImportMaterialsModal";
import { cleanSourcePath, importedFolderForBatch } from "../sources/source-model";
import { Empty, Icon, Loading } from "../../shared/ui";
import { openLifeConversation, type ConversationTopicKind, conversationTopicKinds, talkingQuestions } from "./talking-questions";

export function QuestionsHub({ revision }: { revision: number }) {
  const navigate = useNavigate();
  const [topicKind, setTopicKind] = useState<ConversationTopicKind | "all">("all");
  const [topicLimit, setTopicLimit] = useState(6);
  const [importOpen, setImportOpen] = useState(false);
  const [importedJourney, setImportedJourney] = useState<PaymentJourneySummary>();
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: sourcePages } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找出还想听你说的地方" />;
  if (error || !data) return <Empty>{error || "暂时没有可以继续聊的内容"}</Empty>;
  const recentJourney = importedJourney || importBatches?.find((batch) => batch.journey)?.journey;
  const questions = talkingQuestions(data, recentJourney);
  const availableKinds = (Object.keys(conversationTopicKinds) as ConversationTopicKind[]).filter((kind) => questions.some((question) => question.kind === kind));
  const filteredQuestions = topicKind === "all" ? questions : questions.filter((question) => question.kind === topicKind);
  const concernQuestions = topicKind === "all" ? questions.filter((question) => question.kind === "state").slice(0, 3) : [];
  const concernIds = new Set(concernQuestions.map((question) => question.id));
  const wallQuestions = topicKind === "all" ? filteredQuestions.filter((question) => !concernIds.has(question.id)) : filteredQuestions;
  const topicCards = wallQuestions.slice(0, topicLimit);
  const importFolders = [...new Set((sourcePages || []).map((page) => cleanSourcePath(page.relativePath).split("/").slice(0, -1).join("/")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));

  function openImportedFolder(batch: SourceImportBatch) {
    const importedFolder = importedFolderForBatch(batch);
    navigate({ pathname: "/sources", search: `?${new URLSearchParams({ ...(importedFolder ? { folder: importedFolder } : {}), batch: batch.id })}` });
  }

  return <div className="questions-hub">
    {importOpen ? <ImportMaterialsModal folders={importFolders} currentFolder="" onClose={() => setImportOpen(false)} onImported={openImportedFolder} onJourney={setImportedJourney} /> : null}
    <header className="questions-intro">
      <h1>这段时间你说的话，我都还记得。</h1>
    </header>

    <section className="questions-wall" aria-labelledby="questions-wall-title">
      <div className="questions-wall-head">
        <div><h2 id="questions-wall-title">挑一个话题</h2><p>从你现在想说的开始，或者看看我留意到的几条还没有说完的线索。</p></div>
        <div className="questions-filters" aria-label="筛选话题">
          <button type="button" className={topicKind === "all" ? "active" : ""} aria-pressed={topicKind === "all"} onClick={() => { setTopicKind("all"); setTopicLimit(6); }}>全部</button>
          {availableKinds.map((kind) => <button type="button" key={kind} className={topicKind === kind ? "active" : ""} aria-pressed={topicKind === kind} title={conversationTopicKinds[kind].description} onClick={() => { setTopicKind(kind); setTopicLimit(6); }}>{conversationTopicKinds[kind].label}</button>)}
        </div>
      </div>
      {topicCards.length ? <div className="questions-topic-grid">
        {topicCards.map((question, index) => {
          const kind = conversationTopicKinds[question.kind];
          const evidenceStrength = Math.min(question.evidenceCount, 3);
          const headingId = `question-topic-${index}`;
          return <article className={`questions-topic-card is-${question.kind}`} key={question.id} aria-labelledby={headingId}>
            <span className="questions-topic-kind">{kind.label}</span>
            <h3 id={headingId}>{question.question}</h3>
            <p>{question.reason}</p>
            <div className="questions-topic-evidence">
              <span aria-hidden="true">{[0, 1, 2].map((index) => <i className={index < evidenceStrength ? "on" : ""} key={index} />)}</span>
              <small>{question.evidenceCount ? `${question.evidenceCount} 条相关记录` : "等你补充第一条记录"}</small>
            </div>
            <footer>
              <button type="button" onClick={() => openLifeConversation(question)}>聊聊这个 <Icon name="arrow" size={15} /></button>
              {question.sourceHref ? <NavLink to={question.sourceHref} state={{ returnTo: "/questions", returnLabel: "返回值得聊聊" }}>{question.sourceLabel || "查看依据"}</NavLink> : null}
            </footer>
          </article>;
        })}
      </div> : <div className="questions-wall-empty"><b>这一类还没有话题</b><p>换个分类看看，或者带进一份新的生活记录。</p></div>}
      {wallQuestions.length > topicCards.length ? <button type="button" className="questions-wall-more" onClick={() => setTopicLimit((current) => current + 6)}>再看 {Math.min(6, wallQuestions.length - topicCards.length)} 个话题 <Icon name="down" size={15} /></button> : null}
    </section>

    {concernQuestions.length ? <section className="questions-concerns" aria-labelledby="questions-concerns-title">
      <div className="questions-concerns-head"><h2 id="questions-concerns-title">你之前有点在意的</h2><i aria-hidden="true" /></div>
      <div>{concernQuestions.map((question) => <button key={question.id} type="button" onClick={() => openLifeConversation(question)}>{question.title}</button>)}</div>
    </section> : null}

    <section className="questions-import" aria-labelledby="questions-import-title">
      <div className="questions-import-copy">
        <div className="questions-import-types"><span><Icon name="journal" size={14} />日记</span><span><Icon name="message" size={14} />对话</span><span><Icon name="receipt" size={14} />账单</span></div>
        <div><h2 id="questions-import-title">日记、对话和账单，都可以带进来</h2><p>留下原话，让之后的问题更具体——不用替我总结，原样丢给我就好。</p></div>
      </div>
      <RecordImportTrigger onClick={() => setImportOpen(true)} />
    </section>
    <PageAgentContext context={{ scope: "值得聊聊", title: topicCards[0]?.question || "最近值得聊的话题", summary: "从具体线索里挑一个想说的，我会沿着它继续问。", defaultMode: "read", suggestions: [topicCards[0]?.agentPrompt || "我想从最近一件还没有说清楚的事开始。", "我觉得这里有一条理解不符合我。请先让我说明哪里不准确，再帮我找可能的反例。"] }} />
  </div>;
}
