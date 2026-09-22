import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../shared/ui";

type Version = { id: string; label: string; createdAt: string };
export function LetterHistory({ versions, activeId, onSelect }: { versions: Version[]; activeId?: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 480 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 20;
      const above = below < 220 && rect.top > below;
      const maxHeight = Math.max(100, Math.min(480, above ? rect.top - 20 : below));
      const height = Math.min(menu.current?.scrollHeight || 300, maxHeight);
      setPosition({ left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), top: above ? rect.top - height - 8 : rect.bottom + 8, maxHeight });
    };
    measure();
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); document.removeEventListener("scroll", measure, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <>
    <button ref={trigger} type="button" className="letter-history-trigger" aria-label="历史版本" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>历史版本 · {versions.length - 1}<Icon name="down" size={14} /></button>
    {open && createPortal(<div ref={menu} id={id} className="letter-history-popover" style={position} role="menu" aria-label="这封信的历史版本" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close(); }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      <p>这封信的历史版本</p>
      {[...versions].reverse().map(version => { const active = version.id === activeId; const original = version.id === "original"; const date = new Date(version.createdAt); const dateText = Number.isNaN(date.getTime()) ? version.createdAt : date.toLocaleString("zh-CN", original ? { year: "numeric", month: "long", day: "numeric" } : { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); return <button type="button" key={version.id} role="menuitemradio" aria-checked={active} onClick={() => { onSelect(version.id); close(true); }}><i aria-hidden="true" /><span><b>{version.label}</b><small>{active && "当前查看 · "}{original ? "最初写于 " : "生成于 "}{dateText}</small></span></button>; })}
    </div>, document.body)}
  </>;
}
