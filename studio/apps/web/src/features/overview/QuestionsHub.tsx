import { tr, uiDateLocale, useActiveLibraryId, useDemoLabels } from "../../shared/i18n";
import { useRef, useState } from "react";
import { useRememberedPreview } from "../../shared/use-remembered-preview";
import { NavLink } from "react-router-dom";
import type { SourceImportBatch, TodayView, WikiRun } from "@the-way-here/shared";
import { readPreference, writePreference } from "../../shared/preference-storage";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { openContextAgent } from "../collaboration/model";
import { ReadOnlyPageDialog } from "../knowledge/ReadOnlyPageDialog";
import { Empty, Icon, Loading } from "../../shared/ui";
import { topicBatch } from "./conversation-prompts";
import { type ConversationTopicKind, conversationTopicKinds, talkingQuestions, openLifeConversation } from "./talking-questions";

const directionQuestions = [
  (topic: string) => tr("如果要跟一个完全不了解「${topic}」的人讲清楚，你会先说哪一件具体的事？", { "topic": topic }),
  (topic: string) => tr("关于「${topic}」，有没有一个细节，你一直没有和身边人说过？", { "topic": topic }),
  (topic: string) => tr("现在回头看「${topic}」，你会想对当时的自己说什么？", { "topic": topic }),
  (topic: string) => tr("「${topic}」里有没有一个人，你至今还想再联系一次？", { "topic": topic }),
  (topic: string) => tr("如果只能留下一段和「${topic}」有关的记忆，你会选哪一段？", { "topic": topic }),
];

type GeneratedQuestion = { id: number; templateIndex: number; question: string };

export function QuestionsHub({ revision }: { revision: number }) {
  const demo = useDemoLabels();
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [topicKind, setTopicKind] = useState<ConversationTopicKind | "all" | "generated">("all");
  const [topicBatchIndex, setTopicBatchIndex] = useState(0);
  const [shuffleStreak, setShuffleStreak] = useState(0);
  const [showDirectionCard, setShowDirectionCard] = useState(false);
  const [directionDraft, setDirectionDraft] = useState("");
  const [generatedDirection, setGeneratedDirection] = useState("");
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const evidencePreview = useRememberedPreview("questions-evidence");
  const libraryId = useActiveLibraryId();
  const storageKey = `the-way-here.closed-topics.${libraryId ?? "default"}`;
  const [closedTopics, setClosedTopics] = useState<Record<string, string[]>>({});
  const [undoTopic, setUndoTopic] = useState<{ id: string; storageKey: string }>();
  const [historyFilter, setHistoryFilter] = useState("all");
  const historyDialog = useRef<HTMLDialogElement>(null);
  const { data: runs } = useApi<WikiRun[]>("/api/runs", revision);
  let closed = closedTopics[storageKey];
  if (!closed) {
    try { closed = JSON.parse(readPreference(storageKey) || "[]"); } catch { closed = []; }
  }
  const closedIds = Array.isArray(closed) ? closed : [];
  const saveClosed = (ids: string[]) => {
    setClosedTopics(current => ({ ...current, [storageKey]: ids }));
    writePreference(storageKey, JSON.stringify(ids));
  };
  const { data, loading, error } = useApi<TodayView>("/api/views/today", revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (loading) return <Loading label={tr("正在找出还想听你说的地方")} />;
  if (error || !data) return <Empty>{error ? tr(error) : tr("暂时没有可以继续聊的内容")}</Empty>;
  const recentJourney = importBatches?.find((batch) => batch.journey)?.journey;
  const questions = talkingQuestions(data, recentJourney);
  const topicRuns = new Map<string, WikiRun[]>();
  const libraryRuns = (runs ?? []).filter(run => !libraryId || run.knowledgeBaseId === libraryId);
  const builtRuns = new Set(libraryRuns.filter(run => run.status === "completed").flatMap(run => run.conversationBuildRunIds ?? []));
  for (const run of libraryRuns) {
    if (!run.contextTopicId || run.suggestionForRunId || run.conversationBuildRunIds) continue;
    const turns = topicRuns.get(run.contextTopicId) ?? [];
    turns.push(run);
    topicRuns.set(run.contextTopicId, turns);
  }
  const topicStatus = (id: string) => {
    const turns = topicRuns.get(id);
    return turns?.length ? turns.every(turn => builtRuns.has(turn.id)) ? "built" : "paused" : closedIds.includes(id) ? "closed" : undefined;
  };
  const knownTopics = new Map(questions.map(question => [question.id, question]));
  const historyIds = new Set([...topicRuns.keys(), ...closedIds]);
  const history = [...historyIds].map(id => {
    const turns = topicRuns.get(id);
    const latest = turns?.[0];
    const original = turns?.at(-1);
    const question = knownTopics.get(id);
    return { id, question, latest, title: question?.question ?? original?.title.replace(/^处理：/, "") ?? id };
  }).filter(item => item.question || item.latest);
  const historyTabs = [["all", "全部"], ["built", "已构建 Wiki"], ["paused", "聊到一半"], ["closed", "已关闭"]];
  const availableKinds = (Object.keys(conversationTopicKinds) as ConversationTopicKind[]).filter((kind) => questions.some((question) => question.kind === kind));
  const filteredQuestions = (topicKind === "all" || topicKind === "generated" ? questions : questions.filter((question) => question.kind === topicKind)).filter(question => !closedIds.includes(question.id));
  const topicCards = topicKind === "generated" ? [] : topicBatch(filteredQuestions, topicBatchIndex % Math.max(1, Math.ceil(filteredQuestions.length / 4)));
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
      <h1>{tr("这段时间你说的话，我都还记得。")}</h1>
      <p>{tr("从你现在想说的开始，或者看看我留意到的几条还没说完的线索。")}</p>
    </header>

    <section className="questions-wall" aria-labelledby="questions-wall-title">
      <div className="questions-wall-head">
        <h2 id="questions-wall-title" className="sr-only">{tr("值得聊聊的话题")}</h2>
        <div className="questions-filters" aria-label={tr("筛选话题")}>
          <button type="button" className={topicKind === "all" ? "active" : ""} aria-pressed={topicKind === "all"} onClick={() => changeKind("all")}>{tr("全部")}</button>
          {availableKinds.map((kind) => <button type="button" key={kind} className={topicKind === kind ? "active" : ""} aria-pressed={topicKind === kind} title={tr(conversationTopicKinds[kind].description)} onClick={() => changeKind(kind)}>{tr(conversationTopicKinds[kind].label)}</button>)}
          {generatedQuestions.length > 0 && <button type="button" className={topicKind === "generated" ? "active generated" : "generated"} aria-pressed={topicKind === "generated"} onClick={() => changeKind("generated")}>{tr("新生成")}</button>}
        </div>
        <div className="questions-wall-actions">
        <button type="button" className="questions-shuffle-button" onClick={() => { setHistoryFilter("all"); historyDialog.current?.showModal(); }}><Icon name="history" size={16} />{tr("往期话题")}<span>{history.length}</span></button>
        <button type="button" className="questions-shuffle-button" disabled={topicKind === "generated" || filteredQuestions.length === 0} onClick={() => {
          setTopicBatchIndex((current) => (current + 1) % Math.max(1, Math.ceil(filteredQuestions.length / 4)));
          setShuffleStreak(shuffleStreak + 1);
          if (shuffleStreak + 1 >= 3) setShowDirectionCard(true);
        }}><Icon name="refresh" size={16} />{tr("换一批")}</button></div>
      </div>
      {showDirectionCard && <aside className="questions-direction-card" aria-label={tr("按你的方向找话题")}>
        <div className="questions-direction-icon" aria-hidden="true"><Icon name="spark" size={18} /></div>
        <div className="questions-direction-body">
          <h3>{tr("已经换了好几批，都不是想聊的？")}</h3>
          <p>{tr("告诉我大概想聊的方向，我按你说的给出几个新问题。")}</p>
          <form onSubmit={(event) => { event.preventDefault(); generateForDirection(); }}>
            <input aria-label={tr("想聊的方向")} placeholder={tr("写下你想聊的方向…")} value={directionDraft} onChange={(event) => setDirectionDraft(event.target.value)} />
            <button type="submit" disabled={!directionDraft.trim()}>{tr("生成新话题")}</button>
          </form>
        </div>
        <button type="button" className="questions-direction-dismiss" aria-label={tr("关闭提问引导")} onClick={() => { setShowDirectionCard(false); setShuffleStreak(0); }}>×</button>
      </aside>}
      {visibleGenerated.length > 0 && <p className="questions-generated-banner">{tr("这些问题是根据你输入的「${direction}」拟出的开放问题，不代表已有的记忆线索。", { direction: generatedDirection })}</p>}
      {topicCards.length || visibleGenerated.length ? <div className="questions-topic-grid">
        {topicCards.map((question, index) => {
          const kind = conversationTopicKinds[question.kind];
          const evidenceStrength = Math.min(question.evidenceCount, 3);
          const headingId = `question-topic-${index}`;
          return <article className={`questions-topic-card is-${question.kind}${selectedQuestionId === question.id ? " active" : ""}`} key={question.id} aria-labelledby={headingId}>
            {!topicStatus(question.id) && <button type="button" className="questions-topic-dismiss" title={tr("不感兴趣，关闭这个话题")} aria-label={tr("关闭这个话题")} onClick={() => { saveClosed([...closedIds, question.id]); setUndoTopic({ id: question.id, storageKey }); }}><Icon name="close" size={14} /></button>}
            <span className={`questions-topic-kind ${topicStatus(question.id) ?? ""}`}>{tr(topicStatus(question.id) === "built" ? "已整理" : topicStatus(question.id) === "paused" ? "聊到一半" : kind.label)}</span>
            <h3 id={headingId}>{demo.title(question.question)}</h3>
            <p>{question.reason}</p>
            <div className="questions-topic-evidence">
              <span aria-hidden="true">{[0, 1, 2].map((index) => <i className={index < evidenceStrength ? "on" : ""} key={index} />)}</span>
              <small>{question.evidenceCount ? tr("${question.evidenceCount} 条相关记录", { "question.evidenceCount": question.evidenceCount }) : tr("等你补充第一条记录")}</small>
            </div>
            <footer>
              <button type="button" onClick={() => { setSelectedQuestionId(question.id); openLifeConversation(question); }}>{tr(topicStatus(question.id) === "built" ? "回看对话" : topicStatus(question.id) === "paused" ? "继续聊" : "聊聊这个") + " "}<Icon name="arrow" size={15} /></button>
              {question.kind === "understanding" && question.pageId
                ? <button type="button" className="questions-evidence-button" onClick={() => { if (question.pageId) evidencePreview.open(question.pageId); }}>{question.sourceLabel || tr("查看依据")}</button>
                : question.sourceHref ? <NavLink to={question.sourceHref} state={{ returnTo: "/questions", returnLabel: tr("返回值得聊聊") }}>{question.sourceLabel || tr("查看依据")}</NavLink> : null}
            </footer>
          </article>;
        })}
        {visibleGenerated.map(({ id, question }) => <article className="questions-topic-card is-generated" key={`generated-${id}`}>
          <span className="questions-topic-kind">{tr("新生成")}</span>
          <h3>{question}</h3>
          <p>{tr("从你想聊的方向开始，具体经历由你来说。")}</p>
          <div className="questions-topic-evidence"><small>{tr("开放式问题，暂无相关记录")}</small></div>
          <footer>
            <button type="button" onClick={() => openContextAgent({ prompt: `我想聊聊「${generatedDirection}」。请先从这个问题开始问我：${question}。不要预设我有过什么经历。`, displayPrompt: `从「${generatedDirection}」开始聊`, mode: "read", lockMode: true, autoSubmit: true })}>{tr("开始聊") + " "}<Icon name="arrow" size={15} /></button>
            <button type="button" className="questions-evidence-button" onClick={() => setGeneratedQuestions((current) => current.map((item) => {
              if (item.id !== id) return item;
              const used = new Set(current.filter((other) => other.id !== id).map((other) => other.templateIndex));
              const next = directionQuestions.findIndex((_, index) => !used.has(index) && index !== item.templateIndex);
              return next < 0 ? item : { ...item, templateIndex: next, question: directionQuestions[next]!(generatedDirection) };
            }))}>{tr("换个角度问")}</button>
          </footer>
        </article>)}
      </div> : <div className="questions-wall-empty"><b>{tr("这一类还没有话题")}</b><p>{tr("换个分类看看，或者带进一份新的生活记录。")}</p></div>}
    </section>

    <button type="button" className="questions-open-chat" onClick={() => openContextAgent({ mode: "auto", view: "compose" })}>
      <b>{tr("还有别的想聊的？直接跟我说")}</b><span>{tr("不用挑话题，写下来我们就直接开始聊…")}</span>
    </button>
    {undoTopic?.storageKey === storageKey && closedIds.includes(undoTopic.id) && <div className="questions-close-toast" role="status">{tr("已关闭话题")} <span>{tr("可以在往期话题里找回")}</span><button type="button" onClick={() => { saveClosed(closedIds.filter(id => id !== undoTopic.id)); setUndoTopic(undefined); }}>{tr("撤销")}</button></div>}
    <dialog ref={historyDialog} className="questions-history-dialog" aria-labelledby="questions-history-title" onClick={event => { if (event.target === event.currentTarget) historyDialog.current?.close(); }}>
      <header><div><h2 id="questions-history-title">{tr("往期话题")}</h2><p>{tr("聊完的、聊到一半的、被你关闭的，都在这里")}</p></div><button type="button" aria-label={tr("关闭弹窗")} onClick={() => historyDialog.current?.close()}><Icon name="close" size={17} /></button></header>
      <nav aria-label={tr("筛选话题")}>{historyTabs.map(([key, label]) => <button type="button" key={key} aria-pressed={historyFilter === key} onClick={() => setHistoryFilter(key!)}>{tr(label!)} <small>{history.filter(question => key === "all" || topicStatus(question.id) === key).length}</small></button>)}</nav>
      <div className="questions-history-list">{history.filter(question => historyFilter === "all" || topicStatus(question.id) === historyFilter).map(question => {
        const status = topicStatus(question.id);
        return <article key={question.id} className={status}><div><b>{demo.title(question.title)}</b><p>{tr(status === "closed" ? "已关闭" : status === "built" ? "已构建 Wiki" : "聊到一半")}{question.latest && <> · <time dateTime={question.latest.createdAt}>{new Date(question.latest.createdAt).toLocaleDateString(uiDateLocale())}</time></>}</p></div><button type="button" onClick={() => {
          if (status === "closed") saveClosed(closedIds.filter(id => id !== question.id));
          else {
            historyDialog.current?.close();
            setSelectedQuestionId(question.id);
            if (question.question) openLifeConversation(question.question);
            else if (question.latest) openContextAgent({ runId: question.latest.id });
          }
        }}>{tr(status === "closed" ? "恢复话题" : status === "built" ? "回看对话" : "继续聊")}</button></article>;
      })}{!history.some(question => historyFilter === "all" || topicStatus(question.id) === historyFilter) && <p>{tr("这里暂时没有话题")}</p>}</div>
      <footer>{tr("这里只显示当前个人空间里的话题。")}</footer>
    </dialog>
    <PageAgentContext context={{ scope: tr("值得聊聊"), title: tr("最近值得聊的话题"), summary: tr("从具体线索里挑一个想说的，我会沿着它继续问。"), defaultMode: "read", suggestions: [questions[0]?.agentPrompt || tr("我想从最近一件还没有说清楚的事开始。"), tr("我觉得这里有一条理解不符合我。请先让我说明哪里不准确，再帮我找可能的反例。")] }} />
  </div>;
}
