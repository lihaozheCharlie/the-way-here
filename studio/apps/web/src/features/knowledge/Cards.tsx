import { SearchField } from "../../shared/form-controls";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { StructuredCard } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { categoryMeta, growthTabs } from "../../features/knowledge/navigation";
import { PageAgentContext } from "../desktop/InspectorContext";
import { CollapsibleIndexPane, Empty, Icon, Loading, PageHeader, SectionTabs } from "../../shared/ui";
import { EditablePageContent } from "./PagePreview";

export function StructuredExplorer({ cards, revision, contextScope, emptyLabel = "暂无内容", suggestions = [] }: { cards: StructuredCard[]; revision: number; contextScope: string; emptyLabel?: string; suggestions?: string[] }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [indexOpen, setIndexOpen] = useState(true);
  const filtered = useMemo(() => cards.filter((card) => `${card.title} ${card.excerpt} ${card.sections.map((section) => `${section.heading} ${section.body}`).join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [cards, query]);
  const selected = filtered.find((card) => card.id === params.get("item")) || filtered[0];
  const selectedIndex = selected ? filtered.findIndex((card) => card.id === selected.id) : -1;
  if (!cards.length) return <Empty>{emptyLabel}</Empty>;
  function selectItem(id: string) { setParams((current) => { const next = new URLSearchParams(current); next.set("item", id); return next; }); }
  function moveSelection(delta: number) {
    const next = filtered[selectedIndex + delta];
    if (next) selectItem(next.id);
  }
  return <>
    <div className={`collection-explorer${indexOpen ? "" : " index-collapsed"}`}>
    <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label="内容列表">
      <aside className="collection-list">
        <SearchField name="collection-search" autoComplete="off" aria-label="在当前分类中查找" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在当前分类中查找…" />
        <small>{filtered.length} / {cards.length}</small>
        <div role="listbox" aria-label="内容列表">{filtered.map((card) => <button role="option" aria-label={card.title} aria-selected={selected?.id === card.id} key={card.id} className={selected?.id === card.id ? "active" : ""} onClick={() => selectItem(card.id)}><b>{card.title}</b><span>{card.excerpt}</span></button>)}</div>
      </aside>
    </CollapsibleIndexPane>
    <article className="collection-detail" aria-live="polite">
      {selected ? <>
        <EditablePageContent pageId={selected.id} revision={revision} onRenamed={(renamed) => selectItem(renamed.id)} />
        <div className="collection-pager"><button disabled={selectedIndex <= 0} onClick={() => moveSelection(-1)}><Icon name="back" size={15} />上一条</button><span>{selectedIndex + 1} / {filtered.length}</span><button disabled={selectedIndex >= filtered.length - 1} onClick={() => moveSelection(1)}>下一条<Icon name="arrow" size={15} /></button></div>
      </> : <Empty>没有匹配内容</Empty>}
    </article>
    </div>
    {selected && <PageAgentContext context={{ scope: contextScope, title: selected.title, pageId: selected.id, summary: selected.excerpt, defaultMode: "write", suggestions: suggestions.length ? suggestions : ["我想补充一段新经历，请帮我放到当前内容的合适位置。", "请沿着当前页面的证据，告诉我还有什么值得继续追问。"] }} />}
  </>;
}

export function Cards({ revision, category }: { revision: number; category: "personal-lines" | "cycles" | "systems" }) {
  const meta = categoryMeta[category] || { title: category, intro: "" };
  const { data, loading, error } = useApi<StructuredCard[]>(`/api/views/cards/${category}`, revision);
  if (loading) return <Loading />;
  if (error || !data) return <Empty>{error || "暂时无法读取这些内容，请刷新重试。"}</Empty>;
  return (
    <div>
      <SectionTabs items={growthTabs} />
      <PageHeader title={meta.title} description={meta.intro} />
      <StructuredExplorer cards={data} revision={revision} contextScope={`理解自己 · ${meta.title}`} suggestions={[`我想补充一段与“${meta.title}”有关的新经历，请更新当前页面及受影响的关联页。`, "请结合当前内容和原始证据，指出一个可能遗漏的反例或竞争解释。"]} />
    </div>
  );
}
