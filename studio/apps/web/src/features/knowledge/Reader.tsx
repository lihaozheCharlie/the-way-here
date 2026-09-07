import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import type { SourceImportBatch, WikiPage } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { graphCategoryNames } from "../../shared/categories";
import { type ReturnContext } from "../../shared/routing";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent } from "../collaboration/model";
import { DocumentOutline, EditableDocument, documentHeadingPrefix } from "../../shared/markdown";
import { PageLink, pageHref } from "../../shared/routing";
import { Empty, Icon, Loading } from "../../shared/ui";

export function Reader({ revision }: { revision: number }) {
  const params = useParams();
  const pageId = params["*"] || "";
  const { data: page, loading, error } = useApi<WikiPage>(`/api/pages/${pageId}`, revision);
  const { data: importBatches } = useApi<SourceImportBatch[]>(pageId ? "/api/imports" : "", revision);
  const location = useLocation();
  const navigate = useNavigate();
  const returnContext = location.state as ReturnContext | null;
  if (loading) return <Loading />;
  if (error || !page) return <Empty>{error || "页面不存在"}</Empty>;
  const buildProvenance = (importBatches || []).flatMap((batch) => batch.files.map((file) => ({ batch, file }))).filter(({ file }) => file.builtRefs?.some((ref) => ref.pageId === page.id));

  function goBack() {
    if (returnContext?.returnTo) navigate(returnContext.returnTo);
    else navigate(page?.isSource ? "/sources/materials" : "/knowledge", { replace: true });
  }

  return (
    <div className="reader-layout">
      <article className="reader">
        <button className="context-back" onClick={goBack}><Icon name="back" size={16} />{returnContext?.returnLabel || (page.isSource ? "返回生活记录" : "返回已有理解")}</button>
        <div className="reader-meta"><span>{page.category}</span><time>{page.end || page.start || ""}</time></div>
        <EditableDocument page={page} onRenamed={(renamed) => navigate(pageHref(renamed.id), { replace: true, state: returnContext })} />
      </article>
      <aside className="evidence-panel">
        {!page.isSource && <DocumentOutline markdown={page.markdown} headingPrefix={documentHeadingPrefix(page.id)} />}
        <h3>证据与关联</h3>
        {buildProvenance.length > 0 && <div className="knowledge-build-provenance"><b>这条理解怎样形成</b>{buildProvenance.map(({ batch, file }) => {
          const sourceId = file.storedPath.replace(/\.md$/i, "");
          return <div key={`${batch.id}-${file.storedPath}`}><span>来自：{file.originalName}</span>{file.buildKind !== "direct" && <span>经由：一次对话沉淀</span>}<NavLink to={`/sources?${new URLSearchParams({ file: sourceId })}`}>查看原始记录</NavLink>{file.buildRunId ? <button type="button" onClick={() => openContextAgent({ runId: file.buildRunId })}>查看对话全文</button> : null}</div>;
        })}</div>}
        {page.sources.length > 0 && <><b>来源</b><ul>{page.sources.slice(0, 12).map((source) => <li key={source}>{source}</li>)}</ul></>}
        {page.incomingLinks.length > 0 && <><b>被这些页面引用</b><ul>{page.incomingLinks.slice(0, 15).map((source) => <li key={source.id}><PageLink page={source} /></li>)}</ul></>}
      </aside>
      <ContextualAgentDock revision={revision} context={{ scope: `${page.isSource ? "原始材料" : "知识页面"} · ${graphCategoryNames[page.category] || page.category}`, title: page.title, pageId: page.id, summary: page.excerpt, defaultMode: page.isSource ? "read" : "write", launcherLabel: page.isSource ? "询问这份证据" : "补充当前页面", suggestions: page.isSource ? ["这份原始记录可以支持哪些已有判断？请区分直接证据和推断。", "这份记录与哪些人生阶段、人物或反复循环有关？"] : ["我想补充一段与当前页面有关的新经历，请按现有规则更新。", "请检查当前页面是否缺少来源、反例、关联或状态追踪。"] }} />
    </div>
  );
}
