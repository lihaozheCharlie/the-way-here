import { ConversationWorkspace } from "../../shared/ConversationWorkspace";
import { useState } from "react";
import type { WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { AgentDock } from "../collaboration/Collaboration";
import { AuxPanel } from "../../shared/AuxPanel";
import { useApi } from "../../shared/use-api";
import { PageLink, apiPageHref } from "../../shared/routing";
import { talkingQuestions } from "./talking-questions";

type Question = ReturnType<typeof talkingQuestions>[number];
export function QuestionConversation({ question, revision }: { question: Question; revision: number }) {
  const [open, setOpen] = useState(true), [all, setAll] = useState(false);
  const page = useApi<WikiPage>(question.pageId ? apiPageHref(question.pageId) : "", revision);
  const evidence: WikiPageSummary[] = page.data ? [...new Map([page.data, ...(page.data.relatedPages || []), ...page.data.incomingLinks].map(item => [item.id,item])).values()] : [];
  return <ConversationWorkspace id="question-conversation">
    <div className="focus-conversation"><AgentDock embedded revision={revision} context={{scope:"值得聊聊", title:question.question, pageId:question.pageId, summary:`当前理解：${question.currentUnderstanding}\n为什么值得聊：${question.reason}\n仍然未知：${question.unknown}`, defaultMode:"read", suggestions:[question.agentPrompt]}} /></div>
    <AuxPanel className="focus-evidence-panel" label="相关证据" open={open} onToggle={() => setOpen(value => !value)} width={400}><header><h2>相关证据 · {evidence.length} 条</h2><button type="button" aria-expanded={all} onClick={() => setAll(value => !value)}>{all ? "收起" : "展开"}</button></header><p>{question.reason}</p>{evidence.slice(0,all ? undefined : 2).map(item => <article key={item.id}><PageLink page={item}>{item.title}</PageLink><time>{new Date(item.modifiedAt).toLocaleDateString("zh-CN")}</time><p>{item.excerpt}</p></article>)}{page.loading ? <p role="status">正在读取证据…</p> : page.error ? <p role="alert">{page.error}</p> : !evidence.length ? <p>还没有可追溯的直接记录，可以先从你记得的经历开始。</p> : null}</AuxPanel>
  </ConversationWorkspace>;
}
