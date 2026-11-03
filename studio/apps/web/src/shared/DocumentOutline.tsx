import { OutlineGlyph } from "./OutlineGlyph";
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { documentScrollContainer } from "./document-position";
import { markdownOutline, type MarkdownOutlineItem } from "./document-model";
import { useI18n } from "./i18n";

export function DocumentOutline({ markdown, headingPrefix, showHeadings, onNavigate, activeLine, pinned, onPin, relations, peek, canDock, onDismissPeek }: {
  markdown: string; headingPrefix: string; showHeadings: boolean; onNavigate?: (line: number) => void; activeLine?: number;
  pinned: boolean; onPin: () => void; relations?: ReactNode; peek: boolean; canDock: boolean; onDismissPeek: () => void;
}) {
  const { t } = useI18n();
  const items = useMemo(() => showHeadings ? markdownOutline(markdown, headingPrefix).filter(item => item.level >= 2) : [], [markdown, headingPrefix, showHeadings]);
  const [activeId, setActiveId] = useState(items[0]?.id || "");
  const [tab, setTab] = useState<"outline" | "relations">("outline");
  const outlineRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  function renderedHeading(id: string) {
    return outlineRef.current?.closest(".document-surface")?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  }
  useEffect(() => {
    if (activeLine !== undefined) {
      setActiveId(items.filter(item => item.line <= activeLine).at(-1)?.id || items[0]?.id || "");
      return;
    }
    const headings = items.map((item) => renderedHeading(item.id)).filter((heading): heading is HTMLElement => Boolean(heading));
    const scrollContainer = (headings[0] ? documentScrollContainer(headings[0]) : null);
    if (!headings.length) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const threshold = scrollContainer
          ? scrollContainer.getBoundingClientRect().top + 90
          : Math.min(160, window.innerHeight * .24);
        let current = headings[0]!;
        for (const heading of headings) {
          if (heading.getBoundingClientRect().top > threshold) break;
          current = heading;
        }
        const reachedEnd = scrollContainer
          ? scrollContainer.scrollHeight > scrollContainer.clientHeight + 2 && scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2
          : document.documentElement.scrollHeight > window.innerHeight + 2 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        setActiveId((reachedEnd ? headings.at(-1) : current)?.id || items[0]!.id);
      });
    };
    update();
    const eventTarget: HTMLElement | Window = scrollContainer || window;
    eventTarget.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (scrollContainer) resizeObserver?.observe(scrollContainer);
    return () => {
      eventTarget.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items, activeLine]);


  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !item) return;
    const a = list.getBoundingClientRect(), b = item.getBoundingClientRect();
    if (b.top < a.top) list.scrollTop -= a.top - b.top + 6;
    else if (b.bottom > a.bottom) list.scrollTop += b.bottom - a.bottom + 6;
  }, [activeId, peek, tab, pinned]);
  function go(item: MarkdownOutlineItem) {
    setActiveId(item.id);
    if (onNavigate) onNavigate(item.line);
    else {
      const heading = renderedHeading(item.id);
      const container = (heading ? documentScrollContainer(heading) : null);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      if (heading && container) container.scrollTo({ top: container.scrollTop + heading.getBoundingClientRect().top - container.getBoundingClientRect().top - 24, behavior });
      else if (heading) window.scrollTo({ top: window.scrollY + heading.getBoundingClientRect().top - 24, behavior });
    }
    onDismissPeek();
  }
  useEffect(() => {
    if (!onNavigate) return;
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.metaKey || !["ArrowUp", "ArrowDown"].includes(event.key) || !outlineRef.current?.closest(".document-surface")?.contains(document.activeElement)) return;
      event.preventDefault(); const index = items.findIndex(item => item.id === activeId); const next = items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]; if (next) go(next);
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [onNavigate, items, activeId, onDismissPeek]);
  const showRelations = Boolean(relations) && (tab === "relations" || items.length === 0);
  const title = t(items.length ? "目录" : "关联");
  const toggleLabel = t(pinned ? "收起目录" : "展开目录");
  return <nav ref={outlineRef} className={`document-outline document-outline-panel${pinned ? " pinned" : ""}${peek ? " expanded" : ""}`} aria-label={title} onKeyDown={event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onDismissPeek();
      (document.activeElement as HTMLElement)?.blur();
    }
  }}>
    {!pinned && <div className="document-tick-rail">
      <button type="button" className="record-outline-control" aria-label={toggleLabel} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={onPin}><OutlineGlyph /></button>
      {items.map(item => <button type="button" key={item.id} className={`document-tick${item.level === 2 ? " major" : ""}${activeId === item.id ? " active" : ""}`} aria-label={t("跳到「${label}」", { label: item.label })} aria-current={activeId === item.id ? "location" : undefined} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={() => go(item)}><i /></button>)}
    </div>}
    <div className="document-outline-card">
      <header><b>{title}</b><button type="button" disabled={!canDock} aria-label={toggleLabel} title={toggleLabel} aria-pressed={pinned} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={onPin}><OutlineGlyph panel="right" /></button></header>
      {relations && items.length > 0 && <div className="document-navigation-tabs" role="group" aria-label={t("文档导航内容")}><button type="button" aria-pressed={!showRelations} onClick={() => setTab("outline")}>{t("目录")}</button><button type="button" aria-pressed={showRelations} onClick={() => setTab("relations")}>{t("关联")}</button></div>}
      {showRelations ? <div className="document-relations">{relations}</div> : <ol ref={listRef}>{items.map(item => <li key={item.id} style={{ "--outline-depth": Math.min(item.level - 2, 3) } as React.CSSProperties}>
        <button type="button" className={`outline-item${item.level === 2 ? " major" : ""}${activeId === item.id ? " active" : ""}`} aria-current={activeId === item.id ? "location" : undefined} title={item.label} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={() => go(item)}><span>{item.label}</span></button>
      </li>)}</ol>}
    </div>
  </nav>;
}
