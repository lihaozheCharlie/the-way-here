import { useEffect } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import type { SourceImportBatch, WikiPage } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { graphCategoryNames } from "../../shared/categories";
import { type ReturnContext, apiPageHref } from "../../shared/routing";
import { PageAgentContext } from "../desktop/InspectorContext";
import { openContextAgent } from "../collaboration/model";
import { EditableDocument, ReadOnlyDocument } from "../../shared/markdown";
import { PageLink, pageHref } from "../../shared/routing";
import { Empty, Icon, Loading } from "../../shared/ui";
import { usePublishReaderLocation } from "./reader-location";
import { useDemoLabels, useI18n, tr } from "../../shared/i18n";

export function Reader({ revision }: { revision: number }) {
  const params = useParams();
  const pageId = params["*"] || "";
  const { data: page, loading, error } = useApi<WikiPage>(pageId ? apiPageHref(pageId) : "", revision);
  usePublishReaderLocation(page && pageId ? { pageId, isSource: page.isSource, category: page.category } : undefined);
  const { data: importBatches } = useApi<SourceImportBatch[]>(pageId ? "/api/imports" : "", revision);
  const location = useLocation();
  const navigate = useNavigate();
  const returnContext = location.state as ReturnContext | null;
  const { t } = useI18n();
  const demo = useDemoLabels();
  useEffect(() => {
    if (!page?.isSource) return;
    const params = new URLSearchParams(location.search);
    if (params.get("from") === "source") return;
    params.set("from", "source");
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true, state: location.state });
  }, [location.pathname, location.search, location.state, navigate, page?.id, page?.isSource]);
  if (loading) return <Loading />;
  if (error || !page) return <Empty>{error ? t(error) : t("页面不存在")}</Empty>;
  const buildProvenance = (importBatches || []).flatMap((batch) => batch.files.map((file) => ({ batch, file }))).filter(({ file }) => file.builtRefs?.some((ref) => ref.pageId === page.id));

  const relations = (buildProvenance.length > 0 || page.sources.length > 0 || page.incomingLinks.length > 0) ? <div className="evidence-panel">
        <h3>{t("证据与关联")}</h3>
        {buildProvenance.length > 0 && <div className="knowledge-build-provenance"><b>{t("这条理解怎样形成")}</b>{buildProvenance.map(({ batch, file }) => {
          const sourceId = file.storedPath.replace(/\.md$/i, "");
          return <div key={`${batch.id}-${file.storedPath}`}><span>{t("来自：${name}", { name: file.originalName })}</span>{file.buildKind !== "direct" && <span>{t("经由：一次对话沉淀")}</span>}<NavLink to={`/sources?${new URLSearchParams({ file: sourceId })}`}>{t("查看原始记录")}</NavLink>{file.buildRunId ? <button type="button" onClick={() => openContextAgent({ runId: file.buildRunId })}>{t("查看对话全文")}</button> : null}</div>;
        })}</div>}
        {page.sources.length > 0 && <><b>{t("来源")}</b><ul>{page.sources.map((source) => <li key={source}>{source}</li>)}</ul></>}
        {page.incomingLinks.length > 0 && <><b>{t("被这些页面引用")}</b><ul>{page.incomingLinks.map((source) => <li key={source.id}><PageLink page={source} /></li>)}</ul></>}
  </div> : undefined;

  function goBack() {
    if (returnContext?.returnTo) navigate(returnContext.returnTo);
    else navigate(page?.isSource ? "/sources" : "/knowledge", { replace: true });
  }

  return (
    <div className="reader-layout">
      <article className="reader">
        <button className="context-back" onClick={goBack}><Icon name="back" size={16} />{t(returnContext?.returnLabel || (page.isSource ? "返回生活记录" : "返回已有理解"))}</button>
        <div className="reader-meta"><span>{t(graphCategoryNames[page.category] || (page.isSource ? "生活记录" : page.category))}</span><time>{page.end || page.start || ""}</time></div>
        {new URLSearchParams(location.search).has("detached") ? <ReadOnlyDocument readOnlyReason={tr("此页面已与原文件断开")} relations={relations} page={page} id={page.id} markdown={page.renderedMarkdown} /> : <EditableDocument relations={relations} page={page} onRenamed={(renamed) => navigate(`${pageHref(renamed.id)}${page.isSource ? "?from=source" : ""}`, { replace: true, state: returnContext })} />}
      </article>
      <PageAgentContext context={{ scope: `${t(page.isSource ? "原始材料" : "知识页面")} · ${t(graphCategoryNames[page.category] || page.category)}`, title: demo.title(page.title), pageId: page.id, summary: page.excerpt, defaultMode: page.isSource ? "read" : "write", suggestions: page.isSource ? [tr("这份原始记录可以支持哪些已有判断？请区分直接证据和推断。"), tr("这份记录与哪些人生阶段、人物或反复循环有关？")] : [tr("我想补充一段与当前页面有关的新经历，请按现有规则更新。"), tr("请检查当前页面是否缺少来源、反例、关联或状态追踪。")] }} />
    </div>
  );
}
