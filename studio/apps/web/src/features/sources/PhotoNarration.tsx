import { useEffect, useRef } from "react";
import { photoAssetUrl, type PhotoMemory } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { photoQuestions, type PhotoAnswer } from "./photo-flow";

export function PhotoNarration({ memory, answers, skipped, answer, direct, story, locked, choiceMade, onChoice, onAnswer, onSend, onSkip, onDirect, onStory, onReview, onAnalyze, onDialogue, hasDialogue }: {
  memory: PhotoMemory; answers: PhotoAnswer[]; skipped: string[]; answer: string; direct: boolean; story: string; locked: boolean; choiceMade: boolean;
  onChoice: () => void; onAnswer: (value: string) => void; onSend: (entry: PhotoAnswer) => void; onSkip: (photoId: string) => void;
  onDirect: (value: boolean) => void; onStory: (value: string) => void; onReview: () => void; onAnalyze: () => void; onDialogue: () => void; hasDialogue: boolean;
}) {
  const questions = photoQuestions(memory).filter((question) => !answers.some((entry) => entry.photoId === question.photoId) && !skipped.includes(question.photoId));
  const question = questions[0];
  const questionRef = useRef<HTMLFormElement>(null);
  const previousQuestion = useRef(question?.photoId);
  useEffect(() => {
    if (previousQuestion.current && previousQuestion.current !== question?.photoId) {
      questionRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
      questionRef.current?.scrollIntoView({ block: "nearest" });
    }
    previousQuestion.current = question?.photoId;
  }, [question?.photoId]);
  const source = (id: string) => photoAssetUrl(memory.knowledgeBaseId, memory.id, id);
  const currentPhoto = memory.photos.find((photo) => photo.id === question?.photoId);
  const analyzed = memory.photos.some((photo) => photo.observation || photo.question);
  const showChoice = !choiceMade && !analyzed;
  return <section>
    <header className="photo-stage-heading"><h3>把画面之外的故事讲出来</h3><p>一次只讲一件事。不想讲的部分可以跳过，也可以直接写下整段故事。</p></header>
    <div className="photo-narration">
      {showChoice ? <div className="photo-narration-intro"><h4>要不要先让 AI 看看照片，整理一下画面信息？</h4><p>点击后，分析副本会发送给当前模型；原图不作为附件。</p><div className="photo-stage-actions"><button className="secondary-action" type="button" disabled={locked} onClick={onAnalyze}><Icon name="spark" size={14} />让 AI 看看照片</button><button className="photo-text-action" type="button" disabled={locked} onClick={onChoice}>不用了，我直接讲</button></div></div> : null}
      {!showChoice ? <>
        <p className="photo-help">已经讲了 {answers.length} 张照片 · 还有 {questions.length} 张{skipped.length ? ` · 已跳过 ${skipped.length} 张` : ""}</p>
        {answers.length ? <><p className="photo-ledger-note">原始逐条回答 · 这里保留当时的原话，修改后的讲述以核对页为准。</p><ol className="photo-answer-ledger" aria-label="原始逐条回答">{answers.map((entry) => <li key={entry.photoId}><img src={source(entry.photoId)} alt={`对应照片：${memory.photos.find((photo) => photo.id === entry.photoId)?.name || ""}`} /><div><p>{entry.question}</p><p>{entry.answer}</p></div></li>)}</ol></> : null}
        {!direct && question ? <form ref={questionRef} className="photo-question-card" onSubmit={(event) => { event.preventDefault(); if (!locked && answer.trim()) onSend({ ...question, answer }); }}>
          <img className="photo-question-image" src={source(question.photoId)} alt={memory.photos.find((photo) => photo.id === question.photoId)?.name || "当前照片"} />
          {currentPhoto?.observation ? <details className="photo-observation"><summary>查看 AI 候选线索（不是人生事实）</summary><p>{currentPhoto.observation}</p></details> : null}
          <label htmlFor={`photo-answer-${memory.id}`}>{question.question}</label><textarea id={`photo-answer-${memory.id}`} value={answer} maxLength={10000} disabled={locked} onChange={(event) => onAnswer(event.target.value)} placeholder="说说看，不想讲的部分可以留白…" rows={3} /><div className="photo-stage-actions"><button type="button" className="photo-text-action" disabled={locked} onClick={() => onSkip(question.photoId)}>跳过这条</button><button type="submit" className="primary-action" disabled={locked || !answer.trim()}>留下这段讲述<Icon name="arrow" size={14} /></button></div>
        </form> : <div className="photo-story-editor"><label htmlFor={`photo-story-${memory.id}`}>{direct ? "整段故事 · 可以自由补充和修改" : "这些照片已经讲完了，看看还有什么想补充"}</label><textarea id={`photo-story-${memory.id}`} value={story} maxLength={60000} disabled={locked} onChange={(event) => onStory(event.target.value)} placeholder="时间、地点、发生的事，以及只有你知道的感受…" rows={7} /></div>}
        <div className="photo-narration-options"><button type="button" className="photo-text-action" disabled={locked} onClick={() => onDirect(!direct)}>{direct ? "回到逐条讲述" : "直接写整段故事"}</button><button type="button" className="photo-text-action" disabled={locked} onClick={onDialogue}>{hasDialogue ? "继续 AI 对话" : "和 AI 继续聊聊"}</button></div>
        <footer className="photo-stage-footer"><p>讲述先保留为草稿，核对确认后才用于构建。</p><button type="button" className={!direct && question ? "secondary-action" : "primary-action"} disabled={locked} onClick={onReview}>下一步：核对讲述<Icon name="arrow" size={14} /></button></footer>
      </> : null}
    </div>
  </section>;
}
