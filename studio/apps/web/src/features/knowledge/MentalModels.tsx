import { NavLink } from "react-router-dom";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SectionedPageView } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { growthTabs } from "../../features/knowledge/navigation";
import { PageAgentContext } from "../desktop/InspectorContext";
import { MarkdownBody } from "../../shared/markdown";
import { PageLink } from "../../shared/routing";
import { CollapsibleIndexPane, Empty, Icon, Loading, PageHeader, SectionHeading, SectionTabs } from "../../shared/ui";

export function MentalModels({ revision }: { revision: number }) {
  const { data: view, loading, error } = useApi<SectionedPageView>("/api/views/mental-models", revision);
  const [selectedHeading, setSelectedHeading] = useState("");
  const [indexOpen, setIndexOpen] = useState(true);
  if (loading) return <Loading label="正在展开判断工具箱" />;
  if (error || !view) return <div><SectionTabs items={growthTabs} /><PageHeader title="思维模型" description="从真实经历中形成可以反复检验的判断工具。" /><Empty>{error || "还没有形成思维模型。先连接资料或记录一段经历，再与 AI 一起整理。"}</Empty><NavLink to="/sources">查看生活记录</NavLink></div>;
  const { page, sections } = view;
  const definition = sections.find((section) => section.heading === "什么才算一个思维模型");
  const modelSections = sections.filter((section) => /^[一二三四五六七]、/.test(section.heading));
  const calibrations = sections.find((section) => section.heading.includes("近期四次模型校准"));
  const priorities = sections.find((section) => section.heading === "当前优先观察");
  const selected = modelSections.find((section) => section.heading === selectedHeading) || modelSections[0];
  return (
    <div>
      <SectionTabs items={growthTabs} />
      <PageHeader title="思维模型" description="不是名人观点和概念收藏，而是一组能说明证据、竞争解释、适用边界与误用风险的个人判断工具。" />
      {definition && <section className="model-definition"><ReactMarkdown remarkPlugins={[remarkGfm]}>{definition.body}</ReactMarkdown></section>}
      <div className={`model-explorer${indexOpen ? "" : " index-collapsed"}`}>
        <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label="模型列表">
          <aside className="model-index" role="listbox" aria-label="模型领域">
            {modelSections.map((section) => <button role="option" aria-selected={selected?.heading === section.heading} className={selected?.heading === section.heading ? "active" : ""} key={section.heading} onClick={() => setSelectedHeading(section.heading)}>{section.heading.replace(/^[一二三四五六七]、/, "")}<Icon name="arrow" size={15} /></button>)}
          </aside>
        </CollapsibleIndexPane>
        <article className="model-detail" aria-live="polite">{selected ? <><h2>{selected.heading.replace(/^[一二三四五六七]、/, "")}</h2><MarkdownBody>{selected.body}</MarkdownBody></> : <Empty>暂无模型内容</Empty>}</article>
      </div>
      <div className="model-lower">
        {calibrations && <section><SectionHeading title="近期校准" /><ReactMarkdown remarkPlugins={[remarkGfm]}>{calibrations.body}</ReactMarkdown></section>}
        {priorities && <section><SectionHeading title="当前优先观察" /><ReactMarkdown remarkPlugins={[remarkGfm]}>{priorities.body}</ReactMarkdown></section>}
      </div>
      <PageLink page={page} className="source-page-link">阅读完整模型总览 <Icon name="arrow" size={15} /></PageLink>
      <PageAgentContext context={{ scope: "理解自己 · 思维模型", title: selected?.heading.replace(/^[一二三四五六七]、/, "") || "思维模型", pageId: page.id, summary: selected?.body.slice(0, 260), defaultMode: "write", suggestions: ["结合最近的经历，为当前模型补充一个真实反例或适用边界。", "请用当前模型解释最近的一次选择，并明确证据、推断和竞争解释。"] }} />
    </div>
  );
}
