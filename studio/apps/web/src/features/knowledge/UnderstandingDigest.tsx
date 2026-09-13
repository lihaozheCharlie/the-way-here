import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { PageCategory, StructuredCard, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { SegmentedTabs } from "../../shared/SegmentedTabs";
import { useApi } from "../../shared/use-api";
import { PageLink, apiPageHref } from "../../shared/routing";
import { insightSectionText, mentalModelPanels } from "../overview/insights-model";

const groups: { category: PageCategory; title: string; to: string }[] = [
  { category: "personal-lines", title: "个人主线", to: "/cards/personal-lines" },
  { category: "cycles", title: "反复循环", to: "/cards/cycles" },
  { category: "systems", title: "现实系统", to: "/cards/systems" },
  { category: "mental-models", title: "思维模型", to: "/mental-models" },
];
const cycleStages = [
  { label: "触发", key: "触发" },
  { label: "惯性反应", key: "反应" },
  { label: "代价", key: "代价" },
  { label: "有效中断", key: "中断" },
];

export function TagSummary({ tags }: { tags: string[] }) {
  const uniqueTags = [...new Set(tags)];
  return <div className="digest-tags">
    {uniqueTags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}
    {uniqueTags.length > 3 && <details>
      <summary>+{uniqueTags.length - 3}</summary>
      <div>{uniqueTags.slice(3).map(tag => <span key={tag}>{tag}</span>)}</div>
    </details>}
  </div>;
}

function ModelDigest({ page, revision }: { page: WikiPageSummary; revision: number }) {
  const [view, setView] = useState("summary");
  // Read exactly the page named by this card, never another model's overview.
  const model = useApi<WikiPage>(apiPageHref(page.id), revision);
  const body = model.data?.sections.map(section => section.body).join("\n") || page.excerpt;
  const panels = mentalModelPanels(body);
  return <>
    <SegmentedTabs label="思维模型查看方式" value={view}
      options={[{ value: "summary", label: "摘要" }, { value: "calibration", label: "校准" }]}
      onChange={setView} />
    {model.error ? <p role="alert">{model.error}</p> : model.loading ? <p role="status">正在读取模型…</p>
      : <p role="tabpanel" aria-label={view === "summary" ? "摘要" : "校准"}>{panels[view as keyof typeof panels]}</p>}
  </>;
}

export function UnderstandingDigest({ revision }: { revision: number }) {
  const pages = useApi<WikiPageSummary[]>("/api/pages?sources=false", revision);
  const cycles = useApi<StructuredCard[]>("/api/views/cards/cycles", revision);
  const [cycleOpen, setCycleOpen] = useState(false);
  return <section className="understanding-digest" aria-label="理解摘要">
    {groups.map(group => {
      const candidates = pages.data?.filter(page => page.category === group.category) || [];
      const details = candidates.filter(page => !page.title.includes("总览"));
      const page = [...(details.length ? details : candidates)].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))[0];
      const cycle = cycles.data?.find(card => card.id === page?.id);
      return <article className="understanding-digest-card" key={group.category}>
        <header><h2>{group.title}</h2><NavLink to={group.to}>查看全部</NavLink></header>
        {page ? <>
          <PageLink page={page} className="digest-title">{page.title}</PageLink>
          <p>{page.excerpt}</p><TagSummary tags={page.tags} />
        </> : <p>{pages.loading ? "正在读取…" : pages.error || "还没有形成这类理解。"}</p>}
        {group.category === "cycles" && cycle && <>
          <button type="button" className="digest-disclosure" aria-expanded={cycleOpen}
            onClick={() => setCycleOpen(value => !value)}>{cycleOpen ? "收起循环" : "展开循环"}</button>
          {cycleOpen && <div className="cycle-stages">{cycleStages.map(stage => <section key={stage.label}>
            <b>{stage.label}</b><p>{insightSectionText(cycle, stage.key) || "还需要补充证据"}</p>
          </section>)}</div>}
        </>}
        {group.category === "cycles" && cycles.error && <p role="alert">{cycles.error}</p>}
        {group.category === "mental-models" && page && <ModelDigest key={page.id} page={page} revision={revision} />}
      </article>;
    })}
  </section>;
}
