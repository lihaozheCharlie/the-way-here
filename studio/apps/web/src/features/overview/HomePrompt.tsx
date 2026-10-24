import { NavLink } from "react-router-dom";
import type { SourceImportBatch, TodayView } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { openLifeConversation, selectHomeQuestion } from "./talking-questions";

function openPreferences() {
  window.dispatchEvent(new Event("open-preferences"));
}

export function HomePrompt({ revision }: { revision: number }) {
  const today = useApi<TodayView>("/api/views/today", revision);
  const imports = useApi<SourceImportBatch[]>("/api/imports", revision);
  if (today.loading) return <p className="today-prompt-status" role="status">正在找一个可以接着说的问题…</p>;
  if (today.error || !today.data) return <p className="today-prompt-fallback">暂时读不到最近的记录。<NavLink to="/questions">去值得聊聊</NavLink></p>;
  const question = selectHomeQuestion(today.data, imports.data?.find((batch) => batch.journey)?.journey);
  return <section className="today-prompt" aria-labelledby="today-prompt-title">
    <p className="today-prompt-kicker">先问一句</p>
    <h2 id="today-prompt-title">{question.question}</h2>
    <p>{question.evidenceCount ? question.reason : "还没有足够的记录时，就从一件具体的小事说起。"}</p>
    <div className="today-prompt-actions">
      <button type="button" className="desktop-primary" onClick={() => openLifeConversation(question)}>接着聊</button>
      <NavLink to="/questions">更多值得聊聊</NavLink>
    </div>
    <p className="today-prompt-trust">接着聊会把你之后发出的话交给当前模型。已经写下的记录留在本机。模型可以在<button type="button" onClick={openPreferences}>偏好设置</button>里更换或停用。</p>
  </section>;
}
