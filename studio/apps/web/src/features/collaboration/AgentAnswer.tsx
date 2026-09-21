import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NavLink } from "react-router-dom";
import type { WikiRun } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { useReturnContext } from "../../shared/routing";
import { localWikiHref } from "./local-page-link";
import { splitWikiUpdate, wikiUpdateFields } from "./answer-model";

export function AgentMarkdown({ text }: { text: string }) {
  const returnContext = useReturnContext();
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => {
    const local = localWikiHref(href);
    return local ? <NavLink to={local} state={returnContext}>{children}</NavLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>;
  } }}>{text}</ReactMarkdown>;
}

export function AgentAnswer({ answer, run }: { answer: string; run: WikiRun }) {
  const { prose, wiki } = splitWikiUpdate(answer);
  const wikiRoot = run.configSnapshot?.paths.wiki.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  const changes = (run.changes || []).filter((change) => {
    const changedPath = change.path.replace(/\\/g, "/").replace(/^\.\//, "");
    return wikiRoot && changedPath.startsWith(`${wikiRoot}/`);
  });
  const failed = run.validation?.some((check) => check.exitCode !== 0);
  const pending = ["preparing", "running", "waiting-approval", "validating"].includes(run.status);
  const status = changes.length ? failed ? "检查未通过" : pending ? "待检查" : "已写入" : pending ? "处理中" : "未写入";
  return <>
    {prose && <article className="context-run-answer"><AgentMarkdown text={prose} /></article>}
    {(wiki || changes.length > 0) && <details className="agent-wiki-update">
      <summary><span className="agent-artifact-icon"><Icon name="library" size={17} /></span><span className="agent-artifact-heading"><b>Wiki 更新</b><small>{changes.length ? `${changes.length} 个文件变化` : "本轮提出的更新内容"}</small></span><span className={`agent-artifact-badge ${!changes.length || failed ? "warning" : ""}`}>{status}</span><Icon name="down" size={16} /></summary>
      <div className="agent-artifact-fields">
        {wiki && wikiUpdateFields(wiki).map((field, index) => <div className="agent-artifact-field" key={index}><AgentMarkdown text={field} /></div>)}
        {changes.map((change) => <details className="agent-artifact-field" key={change.path}><summary>{change.kind === "added" ? "新增" : change.kind === "deleted" ? "删除" : "修改"} · {change.path}</summary><pre>{change.diff || "无文本差异"}</pre></details>)}
      </div>
      {(!changes.length && !pending || failed || run.error) && <p className="agent-artifact-note"><Icon name="info" size={14} /><span>{run.error || (failed ? "内容已写入，但质量检查未通过。请在任务详情中查看检查结果。" : "本轮没有检测到 Wiki 文件变化，以上内容尚未写入。")}</span></p>}
    </details>}
  </>;
}
