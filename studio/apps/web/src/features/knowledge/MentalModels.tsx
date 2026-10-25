import { tr } from "../../shared/i18n";
import { FileMenu } from "../../shared/FileMenu";
import { NavLink, useSearchParams } from "react-router-dom";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SectionedPageView, StructuredCard } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { growthTabs } from "../../features/knowledge/navigation";
import { PageAgentContext } from "../desktop/InspectorContext";
import { MarkdownBody } from "../../shared/markdown";
import { pageHref } from "../../shared/routing";
import { CollapsibleIndexPane, Empty, Icon, Loading, PageHeader, SectionHeading, SectionTabs } from "../../shared/ui";
import { resolveThinkingModels } from "./thinking-models";

export function MentalModels({ revision }: { revision: number }) {
  const legacy = useApi<SectionedPageView>("/api/views/mental-models", revision);
  const cards = useApi<StructuredCard[]>("/api/views/cards/mental-models", revision);
  const [params, setParams] = useSearchParams();
  const [indexOpen, setIndexOpen] = useState(true);
  if ((legacy.loading && !legacy.data) || (cards.loading && !cards.data)) return <Loading label={tr("正在展开判断工具箱")} />;
  const models = resolveThinkingModels(cards.data, legacy.data);
  const loadError = legacy.error || cards.error;
  if ((legacy.error && cards.error) || !models.length) return <div><SectionTabs items={growthTabs} /><PageHeader title={tr("思维模型")} description={tr("从真实经历中形成可以反复检验的判断工具。")} /><Empty>{loadError ? tr(loadError) : tr("还没有形成思维模型。先连接资料或记录一段经历，再与 AI 一起整理。")}</Empty><NavLink to="/sources">{tr("查看生活记录")}</NavLink></div>;
  const sections = legacy.data?.sections || [];
  const definition = sections.find((section) => section.heading === "什么才算一个思维模型");
  const calibrations = sections.find((section) => section.heading.includes("近期四次模型校准"));
  const priorities = sections.find((section) => section.heading === "当前优先观察");
  const requestedModel = params.get("model") || "";
  const selected = models.find((model) => model.key === requestedModel || model.title === requestedModel || model.pageId === requestedModel) || models[0]!;
  const selectModel = (key: string) => setParams((current) => { const next = new URLSearchParams(current); next.set("model", key); return next; }, { replace: true });
  return (
    <div>
      <SectionTabs items={growthTabs} />
      <PageHeader title={tr("思维模型")} description={tr("不是名人观点和概念收藏，而是一组能说明证据、竞争解释、适用边界与误用风险的个人判断工具。")} />
      {definition && <section className="model-definition"><ReactMarkdown remarkPlugins={[remarkGfm]}>{definition.body}</ReactMarkdown></section>}
      <div className={`model-explorer${indexOpen ? "" : " index-collapsed"}`}>
        <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label={tr("模型列表")}>
          <aside className="model-index" role="listbox" aria-label={tr("模型领域")}>
            {models.map((model) => <button role="option" aria-selected={selected.key === model.key} className={selected.key === model.key ? "active" : ""} key={model.key} onClick={() => selectModel(model.key)}>{model.title}<Icon name="arrow" size={15} /></button>)}
          </aside>
        </CollapsibleIndexPane>
        <article className="model-detail" aria-live="polite">
          <h2>{selected.title}</h2>
          {selected.sections.length === 1 && selected.sections[0]?.heading === "模型说明"
            ? <MarkdownBody>{selected.sections[0].body}</MarkdownBody>
            : selected.sections.map((section) => <section key={section.heading}><h3>{section.heading}</h3><MarkdownBody>{section.body}</MarkdownBody></section>)}
        </article>
      </div>
      <div className="model-lower">
        {calibrations && <section><SectionHeading title={tr("近期校准")} /><ReactMarkdown remarkPlugins={[remarkGfm]}>{calibrations.body}</ReactMarkdown></section>}
        {priorities && <section><SectionHeading title={tr("当前优先观察")} /><ReactMarkdown remarkPlugins={[remarkGfm]}>{priorities.body}</ReactMarkdown></section>}
      </div>
      <div className="model-file-actions"><FileMenu page={{ id: selected.pageId, title: selected.title }} /><NavLink to={pageHref(selected.pageId)} state={{ returnTo: "/mental-models", returnLabel: tr("返回思维模型") }} className="source-page-link">{tr("阅读完整模型") + " "}<Icon name="arrow" size={15} /></NavLink></div>
      <PageAgentContext context={{ scope: tr("理解自己 · 思维模型"), title: selected.title, pageId: selected.pageId, summary: selected.body.slice(0, 260), defaultMode: "write", suggestions: [tr("结合最近的经历，为当前模型补充一个真实反例或适用边界。"), tr("请用当前模型解释最近的一次选择，并明确证据、推断和竞争解释。")] }} />
    </div>
  );
}
