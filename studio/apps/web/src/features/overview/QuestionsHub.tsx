import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { SourceImportBatch, TodayView } from "@the-way-here/shared";
import { TextArea } from "../../shared/form-controls";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { openContextAgent } from "../collaboration/model";
import { ReadOnlyPageDialog } from "../knowledge/ReadOnlyPageDialog";
import { Empty, Icon, Loading } from "../../shared/ui";
import { topicBatch } from "./conversation-prompts";
import { type ConversationTopicKind, conversationTopicKinds, talkingQuestions, openLifeConversation } from "./talking-questions";

export function QuestionsHub({ revision }: { revision: number }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [topicKind, setTopicKind] = useState<ConversationTopicKind | "all">("all");
  const [topicBatchIndex, setTopicBatchIndex] = useState(0);
  const [evidencePageId, setEvidencePageId] = useState<string>();
  const [chatDraft, setChatDraft] = useState("");
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找出还想听你说的地方" />;
  if (error || !data) return <Empty>{error || "暂时没有可以继续聊的内容"}</Empty>;
  const recentJourney = importBatches?.find((batch) => batch.journey)?.journey;
  const questions = talkingQuestions(data, recentJourney);
  const availableKinds = (Object.keys(conversationTopicKinds) as ConversationTopicKind[]).filter((kind) => questions.some((question) => question.kind === kind));
  const filteredQuestions = topicKind === "all" ? questions : questions.filter((question) => question.kind === topicKind);
  const topicCards = topicBatch(filteredQuestions, topicBatchIndex);

  return <div className="questions-hub">
    {evidencePageId ? <ReadOnlyPageDialog key={evidencePageId} pageId={evidencePageId} revision={revision} onClose={() => setEvidencePageId(undefined)} /> : null}
    <header className="questions-intro">
      <h1>这段时间你说的话，我都还记得。</h1>
    </header>

    <section className="questions-wall" aria-labelledby="questions-wall-title">
      <div className="questions-wall-head">
        <div><h2 id="questions-wall-title">挑一个话题</h2><p>从你现在想说的开始，或者看看我留意到的几条还没有说完的线索。</p></div>
        <div className="questions-filters" aria-label="筛选话题">
          <button type="button" className={topicKind === "all" ? "active" : ""} aria-pressed={topicKind === "all"} onClick={() => { setTopicKind("all"); setTopicBatchIndex(0); }}>全部</button>
          {availableKinds.map((kind) => <button type="button" key={kind} className={topicKind === kind ? "active" : ""} aria-pressed={topicKind === kind} title={conversationTopicKinds[kind].description} onClick={() => { setTopicKind(kind); setTopicBatchIndex(0); }}>{conversationTopicKinds[kind].label}</button>)}
        </div>
        <button type="button" className="questions-shuffle-button" disabled={filteredQuestions.length <= 4} onClick={() => setTopicBatchIndex((current) => (current + 1) % Math.ceil(filteredQuestions.length / 4))}><Icon name="refresh" size={16} />换一批</button>
      </div>
      {topicCards.length ? <div className="questions-topic-grid">
        {topicCards.map((question, index) => {
          const kind = conversationTopicKinds[question.kind];
          const evidenceStrength = Math.min(question.evidenceCount, 3);
          const headingId = `question-topic-${index}`;
          return <article className={`questions-topic-card is-${question.kind}${selectedQuestionId === question.id ? " active" : ""}`} key={question.id} aria-labelledby={headingId}>
            <span className="questions-topic-kind">{kind.label}</span>
            <h3 id={headingId}>{question.question}</h3>
            <p>{question.reason}</p>
            <div className="questions-topic-evidence">
              <span aria-hidden="true">{[0, 1, 2].map((index) => <i className={index < evidenceStrength ? "on" : ""} key={index} />)}</span>
              <small>{question.evidenceCount ? `${question.evidenceCount} 条相关记录` : "等你补充第一条记录"}</small>
            </div>
            <footer>
              <button type="button" onClick={() => { setSelectedQuestionId(question.id); openLifeConversation(question); }}>聊聊这个 <Icon name="arrow" size={15} /></button>
              {question.kind === "understanding" && question.pageId
                ? <button type="button" className="questions-evidence-button" onClick={() => setEvidencePageId(question.pageId)}>{question.sourceLabel || "查看依据"}</button>
                : question.sourceHref ? <NavLink to={question.sourceHref} state={{ returnTo: "/questions", returnLabel: "返回值得聊聊" }}>{question.sourceLabel || "查看依据"}</NavLink> : null}
            </footer>
          </article>;
        })}
      </div> : <div className="questions-wall-empty"><b>这一类还没有话题</b><p>换个分类看看，或者带进一份新的生活记录。</p></div>}
    </section>

    <section className="questions-open-chat" aria-labelledby="questions-open-chat-title">
      <h2 id="questions-open-chat-title">或者有其他想聊的吗？可以对我说</h2>
      <form onSubmit={(event) => {
        event.preventDefault();
        const prompt = chatDraft.trim();
        if (!prompt) return;
        openContextAgent({ prompt, mode: "read", lockMode: true, autoSubmit: true });
        setChatDraft("");
      }}>
        <TextArea voice={false} rows={2} aria-label="想聊的话" placeholder="在这里说说…" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} />
        <button type="submit" disabled={!chatDraft.trim()}>发送 <Icon name="arrow" size={15} /></button>
      </form>
    </section>
    <PageAgentContext context={{ scope: "值得聊聊", title: "最近值得聊的话题", summary: "从具体线索里挑一个想说的，我会沿着它继续问。", defaultMode: "read", suggestions: [questions[0]?.agentPrompt || "我想从最近一件还没有说清楚的事开始。", "我觉得这里有一条理解不符合我。请先让我说明哪里不准确，再帮我找可能的反例。"] }} />
  </div>;
}
