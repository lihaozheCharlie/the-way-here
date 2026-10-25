import React, { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "./ui";
import { documentScrollContainer } from "./document-position";
import { markdownOutline, type MarkdownOutlineItem } from "./document-model";
import { useI18n } from "./i18n";

export function DocumentOutline({ markdown, headingPrefix, title = "目录", scrollContainerRef, onNavigate, activeLine, pinned = false, onPin, compact = false, relations, recordStyle = false }: { markdown: string; headingPrefix: string; title?: string; scrollContainerRef?: RefObject<HTMLElement | null>; onNavigate?: (line: number) => void; activeLine?: number; pinned?: boolean; onPin?: () => void; compact?: boolean; readOnly?: boolean; relations?: ReactNode; recordStyle?: boolean }) {
  const { t } = useI18n();
  const outlineTitle = t(title);
  const allItems = useMemo(() => markdownOutline(markdown, headingPrefix), [markdown, headingPrefix]);
  // Keep renderer IDs (including H1) while the navigation focuses on section headings.
  const items = useMemo(() => { const sections = allItems.filter(item => item.level >= 2); return recordStyle ? sections : sections.length > 1 ? sections : allItems; }, [allItems, recordStyle]);
  const [activeId, setActiveId] = useState(items[0]?.id || "");
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"outline" | "relations">("outline");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const outlineRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (activeLine !== undefined) {
      setActiveId(items.filter(item => item.line <= activeLine).at(-1)?.id || items[0]?.id || "");
      return;
    }
    const headings = items.map((item) => document.getElementById(item.id)).filter((heading): heading is HTMLElement => Boolean(heading));
    const scrollContainer = scrollContainerRef?.current || (headings[0] ? documentScrollContainer(headings[0]) : null);
    if (!headings.length) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const threshold = scrollContainer
          ? scrollContainer.getBoundingClientRect().top + (recordStyle ? 68 : Math.min(44, scrollContainer.clientHeight * .12))
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
  }, [items, scrollContainerRef, activeLine]);


  const baseLevel = Math.min(...items.map(item => item.level));
  const current = items.find(item => item.id === activeId);
  const currentParent = current && items.filter(item => item.line <= current.line && item.level === baseLevel).at(-1);
  useEffect(() => {
    if (currentParent) setCollapsed(values => { const next = new Set(values); next.delete(currentParent.id); return next; });
  }, [currentParent?.id]);
  useEffect(() => { if (items.length >= 30) setCollapsed(new Set(items.filter(item => item.level === baseLevel && item.id !== currentParent?.id).map(item => item.id))); }, [headingPrefix]);
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !item) return;
    const a = list.getBoundingClientRect(), b = item.getBoundingClientRect();
    if (b.top < a.top) list.scrollTop -= a.top - b.top + 6;
    else if (b.bottom > a.bottom) list.scrollTop += b.bottom - a.bottom + 6;
  }, [activeId, collapsed, expanded]);
  function go(item: MarkdownOutlineItem) {
    setActiveId(item.id);
    if (onNavigate) onNavigate(item.line);
    else {
      const heading = document.getElementById(item.id);
      const container = scrollContainerRef?.current || (heading ? documentScrollContainer(heading) : null);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      if (heading && container) container.scrollTo({ top: container.scrollTop + heading.getBoundingClientRect().top - container.getBoundingClientRect().top - (recordStyle ? 68 : 24), behavior });
      else if (heading) window.scrollTo({ top: window.scrollY + heading.getBoundingClientRect().top - 24, behavior });
    }
    if (compact && !recordStyle) { setExpanded(false); if (!onNavigate) (document.activeElement as HTMLElement)?.blur(); }
  }
  useEffect(() => {
    if (!onNavigate) return;
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.metaKey || !["ArrowUp", "ArrowDown"].includes(event.key) || !outlineRef.current?.closest(".document-surface")?.contains(document.activeElement)) return;
      event.preventDefault(); const index = items.findIndex(item => item.id === activeId); const next = items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]; if (next) go(next);
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [onNavigate, items, activeId, compact]);
  if (items.length < (recordStyle ? 1 : 2) && !relations) return null;
  const dense = items.length >= 30;
  const major = dense ? items.filter(item => item.level === baseLevel) : items;
  const ticks = dense && major.length > 14 ? Array.from({ length: 14 }, (_, index) => major[Math.round(index * (major.length - 1) / 13)]!) : major;
  const activeTick = dense && currentParent ? ticks.reduce((nearest, item) => Math.abs(item.line - currentParent.line) < Math.abs(nearest.line - currentParent.line) ? item : nearest, ticks[0]!)?.id : activeId;
  let parent = "";
  const displayed = items.filter(item => { if (item.level === baseLevel) parent = item.id; return item.level === baseLevel || !dense || !collapsed.has(parent); });
  return <nav ref={outlineRef} className={`document-outline document-outline-panel${pinned ? " pinned" : ""}${expanded ? " expanded" : ""}${compact ? " compact" : ""}`} aria-label={outlineTitle} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setExpanded(false); (document.activeElement as HTMLElement)?.blur(); } }}>
    {!pinned && <div className="document-tick-rail">{ticks.map(item => <button type="button" key={item.id} className={`document-tick${item.level === baseLevel ? " major" : ""}${activeTick === item.id ? " active" : ""}`} aria-label={t("跳到「${label}」", { label: item.label })} aria-current={activeId === item.id ? "location" : undefined} aria-expanded={compact ? expanded : undefined} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={() => compact && !recordStyle ? setExpanded(value => !value) : go(item)}><i /></button>)}{!ticks.length && <button type="button" aria-label={t("查看关联")} onClick={() => { setExpanded(true); setTab("relations"); }}><Icon name="link" size={16} /></button>}</div>}
    <div className="document-outline-card">
      <header><b>{outlineTitle}</b><small>{t("${count} 节", { count: items.length })}</small>{activeLine !== undefined ? <span className="outline-mode">{t("跟随光标")}</span> : null}<button type="button" disabled={compact && !recordStyle} aria-label={t(recordStyle ? pinned ? "收起目录" : "展开目录" : "固定目录")} title={t(recordStyle ? pinned ? "收起目录" : "展开目录" : compact ? "窗口宽度不足 980px，无法固定" : "固定为侧栏")} aria-pressed={pinned} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={onPin}><Icon name={recordStyle ? pinned ? "arrow" : "back" : "pin"} size={14} /></button></header>
      {relations && <div className="document-navigation-tabs" role="group" aria-label={t("文档导航内容")}><button type="button" aria-pressed={tab === "outline"} onClick={() => setTab("outline")}>{t("目录")}</button><button type="button" aria-pressed={tab === "relations"} onClick={() => setTab("relations")}>{t("关联")}</button></div>}
      {relations && tab === "relations" ? <div className="document-relations">{relations}</div> : <ol ref={listRef}>{displayed.map(item => {
        const index = items.indexOf(item), hasChildren = dense && item.level === baseLevel && (items[index + 1]?.level || 0) > baseLevel;
        return <li key={item.id} style={{ "--outline-depth": Math.min(item.level - baseLevel, 3) } as React.CSSProperties}>
          {hasChildren && <button type="button" className="outline-section-toggle" aria-label={t("${action}${label}的子章节", { action: collapsed.has(item.id) ? t("展开") : t("收起"), label: item.label })} aria-expanded={!collapsed.has(item.id)} onClick={() => setCollapsed(values => { const next = new Set(values); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}><Icon name={collapsed.has(item.id) ? "arrow" : "down"} size={12} /></button>}
          <button type="button" className={`outline-item${item.level === baseLevel ? " major" : ""}${activeId === item.id ? " active" : ""}`} aria-current={activeId === item.id ? "location" : undefined} title={item.label} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={() => go(item)}><span>{item.label}</span>{activeLine !== undefined && activeId === item.id && <Icon name="edit" size={12} />}</button>
        </li>;
      })}</ol>}
      {activeLine !== undefined && <footer><kbd>⌘</kbd><kbd>↑</kbd><kbd>↓</kbd> {t("跳到上 / 下一节")}</footer>}
    </div>
  </nav>;
}
