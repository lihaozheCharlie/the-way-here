import { useState } from "react";
import { useRememberedPreview } from "../../shared/use-remembered-preview";
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

const directionQuestions = [
  (topic: string) => `如果要跟一个完全不了解「${topic}」的人讲清楚，你会先说哪一件具体的事？`,
  (topic: string) => `关于「${topic}」，有没有一个细节，你一直没有和身边人说过？`,
  (topic: string) => `现在回头看「${topic}」，你会想对当时的自己说什么？`,
  (topic: string) => `「${topic}」里有没有一个人，你至今还想再联系一次？`,
  (topic: string) => `如果只能留下一段和「${topic}」有关的记忆，你会选哪一段？`,
];

type GeneratedQuestion = { id: number; templateIndex: number; question: string };

export function QuestionsHub({ revision }: { revision: number }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [topicKind, setTopicKind] = useState<ConversationTopicKind | "all" | "generated">("all");
  const [topicBatchIndex, setTopicBatchIndex] = useState(0);
  const [shuffleStreak, setShuffleStreak] = useState(0);
  const [showDirectionCard, setShowDirectionCard] = useState(false);
  const [directionDraft, setDirectionDraft] = useState("");
  const [generatedDirection, setGeneratedDirection] = useState("");
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const evidencePreview = useRememberedPreview("questions-evidence");
  const [chatDraft, setChatDraft] = useState("");
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label="正在找出还想听你说的地方" />;
  if (error || !data) return <Empty>{error || "暂时没有可以继续聊的内容"}</Empty>;
  const recentJourney = importBatches?.find((batch) => batch.journey)?.journey;
  const questions = talkingQuestions(data, recentJourney);
  const availableKinds = (Object.keys(conversationTopicKinds) as ConversationTopicKind[]).filter((kind) => questions.some((question) => question.kind === kind));
  const filteredQuestions = topicKind === "all" || topicKind === "generated" ? questions : questions.filter((question) => question.kind === topicKind);
  const topicCards = topicKind === "generated" ? [] : topicBatch(filteredQuestions, topicBatchIndex);
  const visibleGenerated = topicKind === "generated" ? generatedQuestions : topicKind === "all" ? generatedQuestions : [];
  const changeKind = (kind: ConversationTopicKind | "all" | "generated") => {
    setTopicKind(kind);
    setTopicBatchIndex(0);
    setShuffleStreak(0);
    setShowDirectionCard(false);
  };
  const generateForDirection = () => {
    const direction = directionDraft.trim();
    if (!direction) return;
    setGeneratedDirection(direction);
    setGeneratedQuestions(directionQuestions.slice(0, 4).map((makeQuestion, id) => ({ id, templateIndex: id, question: makeQuestion(direction) })));
    setDirectionDraft("");
    setShowDirectionCard(false);
    setShuffleStreak(0);
    setTopicKind("generated");
  };

  return <div className="questions-hub">
    {evidencePreview.pageId ? <ReadOnlyPageDialog key={evidencePreview.pageId} pageId={evidencePreview.pageId} revision={revision} onClose={evidencePreview.close} /> : null}
    <header className="questions-intro">
      <h1>这段时间你说的话，我都还记得。</h1>
      <p>从你现在想说的开始，或者看看我留意到的几条还没说完的线索。</p>
    </header>

    <section className="questions-wall" aria-labelledby="questions-wall-title">
      <div className="questions-wall-head">
        <h2 id="questions-wall-title" className="sr-only">值得聊聊的话题</h2>
        <div className="questions-filters" aria-label="筛选话题">
          <button type="button" className={topicKind === "all" ? "active" : ""} aria-pressed={topicKind === "all"} onClick={() => changeKind("all")}>全部</button>
          {availableKinds.map((kind) => <button type="button" key={kind} className={topicKind === kind ? "active" : ""} aria-pressed={topicKind === kind} title={conversationTopicKinds[kind].description} onClick={() => changeKind(kind)}>{conversationTopicKinds[kind].label}</button>)}
          {generatedQuestions.length > 0 && <button type="button" className={topicKind === "generated" ? "active generated" : "generated"} aria-pressed={topicKind === "generated"} onClick={() => changeKind("generated")}>新生成</button>}
        </div>
        <button type="button" className="questions-shuffle-button" disabled={topicKind === "generated" || filteredQuestions.length === 0} onClick={() => {
          setTopicBatchIndex((current) => (current + 1) % Math.max(1, Math.ceil(filteredQuestions.length / 4)));
          setShuffleStreak(shuffleStreak + 1);
          if (shuffleStreak + 1 >= 3) setShowDirectionCard(true);
        }}><Icon name="refresh" size={16} />换一批</button>
      </div>
      {showDirectionCard && <aside className="questions-direction-card" aria-label="按你的方向找话题">
        <div className="questions-direction-icon" aria-hidden="true"><Icon name="spark" size={18} /></div>
        <div className="questions-direction-body">
          <h3>已经换了好几批，都不是想聊的？</h3>
          <p>告诉我大概想聊的方向，我按你说的给出几个新问题。</p>
          <form onSubmit={(event) => { event.preventDefault(); generateForDirection(); }}>
            <input aria-label="想聊的方向" placeholder="写下你想聊的方向…" value={directionDraft} onChange={(event) => setDirectionDraft(event.target.value)} />
            <button type="submit" disabled={!directionDraft.trim()}>生成新话题</button>
          </form>
        </div>
        <button type="button" className="questions-direction-dismiss" aria-label="关闭提问引导" onClick={() => { setShowDirectionCard(false); setShuffleStreak(0); }}>×</button>
      </aside>}
      {visibleGenerated.length > 0 && <p className="questions-generated-banner">这些问题是根据你输入的「{generatedDirection}」拟出的开放问题，不代表已有的记忆线索。</p>}
      {topicCards.length || visibleGenerated.length ? <div className="questions-topic-grid">
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
                ? <button type="button" className="questions-evidence-button" onClick={() => { if (question.pageId) evidencePreview.open(question.pageId); }}>{question.sourceLabel || "查看依据"}</button>
                : question.sourceHref ? <NavLink to={question.sourceHref} state={{ returnTo: "/questions", returnLabel: "返回值得聊聊" }}>{question.sourceLabel || "查看依据"}</NavLink> : null}
            </footer>
          </article>;
        })}
        {visibleGenerated.map(({ id, question }) => <article className="questions-topic-card is-generated" key={`generated-${id}`}>
          <span className="questions-topic-kind">新生成</span>
          <h3>{question}</h3>
          <p>从你想聊的方向开始，具体经历由你来说。</p>
          <div className="questions-topic-evidence"><small>开放式问题，暂无相关记录</small></div>
          <footer>
            <button type="button" onClick={() => openContextAgent({ prompt: `我想聊聊「${generatedDirection}」。请先从这个问题开始问我：${question}。不要预设我有过什么经历。`, displayPrompt: `从「${generatedDirection}」开始聊`, mode: "read", lockMode: true, autoSubmit: true })}>开始聊 <Icon name="arrow" size={15} /></button>
            <button type="button" className="questions-evidence-button" onClick={() => setGeneratedQuestions((current) => current.map((item) => {
              if (item.id !== id) return item;
              const used = new Set(current.filter((other) => other.id !== id).map((other) => other.templateIndex));
              const next = directionQuestions.findIndex((_, index) => !used.has(index) && index !== item.templateIndex);
              return next < 0 ? item : { ...item, templateIndex: next, question: directionQuestions[next]!(generatedDirection) };
            }))}>换个角度问</button>
          </footer>
        </article>)}
      </div> : <div className="questions-wall-empty"><b>这一类还没有话题</b><p>换个分类看看，或者带进一份新的生活记录。</p></div>}
    </section>

    <section className="questions-open-chat" aria-labelledby="questions-open-chat-title">
      <div><h2 id="questions-open-chat-title">还有别的想聊的？直接跟我说</h2><p>不用挑话题，写下来我们就直接开始聊。</p></div>
      <form onSubmit={(event) => {
        event.preventDefault();
        const prompt = chatDraft.trim();
        if (!prompt) return;
        openContextAgent({ prompt, mode: "read", lockMode: true, autoSubmit: true });
        setChatDraft("");
      }}>
        <TextArea voice={false} rows={2} aria-label="想聊的话" placeholder="在这里说说…" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} />
        <button type="submit" disabled={!chatDraft.trim()}>开始聊 <Icon name="arrow" size={15} /></button>
      </form>
    </section>
    <PageAgentContext context={{ scope: "值得聊聊", title: "最近值得聊的话题", summary: "从具体线索里挑一个想说的，我会沿着它继续问。", defaultMode: "read", suggestions: [questions[0]?.agentPrompt || "我想从最近一件还没有说清楚的事开始。", "我觉得这里有一条理解不符合我。请先让我说明哪里不准确，再帮我找可能的反例。"] }} />
  </div>;
}
