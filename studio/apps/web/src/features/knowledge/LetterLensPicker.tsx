import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReasoningLens } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";

function LensChoice({ lens, onSelect, selected = false }: { lens: ReasoningLens; onSelect: () => void; selected?: boolean }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const hide = () => { clearTimeout(timer.current); setVisible(false); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setVisible(false), 120); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!visible || !trigger.current || !tooltip.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const box = tooltip.current.getBoundingClientRect();
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - box.width - 12)), top: rect.top - box.height - 8 >= 12 ? rect.top - box.height - 8 : Math.min(rect.bottom + 8, window.innerHeight - box.height - 12) });
    const scroll = () => hide();
    window.addEventListener("resize", scroll);
    document.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", scroll); document.removeEventListener("scroll", scroll, true); };
  }, [visible]);
  const summary = lens.attention.split(/[。；;]/)[0];
  return <>
    <button ref={trigger} className="letter-lens-choice" type="button" aria-pressed={selected} aria-describedby={visible ? id : undefined} data-overflow-tooltip="off" onPointerEnter={() => { clearTimeout(timer.current); timer.current = setTimeout(() => setVisible(true), 180); }} onPointerLeave={leave} onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setVisible(true); }} onBlur={hide} onClick={() => { hide(); onSelect(); }}>
      <span className="letter-lens-avatar" aria-hidden="true">{lens.displayName.split(/[·・]/).at(-1)?.slice(0, 1)}</span>
      <span className="letter-lens-copy"><b>{lens.displayName}</b><small>{summary}</small></span>
    </button>
    {visible && createPortal(<div id={id} ref={tooltip} role="tooltip" className="letter-lens-tooltip" style={position} onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={leave}><b>{lens.displayName}</b><p>{lens.attention}</p>{lens.helperUse && <p>{lens.helperUse}</p>}{Boolean(lens.signals?.length) && <p>关注：{lens.signals.join("、")}</p>}</div>, document.body)}
  </>;
}

export function LetterLensChoices({ lenses, onSelect, selectedId, onAutoSelect, autoSelected = false }: { lenses: ReasoningLens[]; onSelect: (lens: ReasoningLens) => void; selectedId?: string; onAutoSelect?: () => void; autoSelected?: boolean }) {
  return <div className="letter-lens-grid">
    {onAutoSelect && <button className="letter-lens-choice" type="button" aria-pressed={autoSelected} onClick={onAutoSelect}><span className="letter-lens-avatar" aria-hidden="true"><Icon name="spark" size={16} /></span><span className="letter-lens-copy"><b>自动选择</b><small>根据这段经历，选择合适的视角</small></span></button>}
    {lenses.map(lens => <LensChoice key={lens.id} lens={lens} selected={selectedId === lens.id} onSelect={() => onSelect(lens)} />)}
  </div>;
}

export function LetterLensPicker({ lenses, onSelect }: { lenses: ReasoningLens[]; onSelect: (lens: ReasoningLens) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useDismissLayer(open, () => { setOpen(false); triggerRef.current?.focus(); });
  const [placement, setPlacement] = useState({ above: false, maxHeight: 520, left: 0, edge: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 24;
      const above = below < 240 && rect.top > below;
      const maxHeight = Math.max(100, Math.min(520, above ? rect.top - 24 : below));
      const width = Math.min(460, window.innerWidth - 48);
      const left = Math.max(24, Math.min(rect.left, window.innerWidth - width - 24));
      const edge = above ? window.innerHeight - rect.top + 6 : rect.bottom + 6;
      setPlacement((current) => current.above === above && current.maxHeight === maxHeight && current.left === left && current.edge === edge ? current : { above, maxHeight, left, edge });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);
  if (!lenses.length) return null;
  return <div ref={rootRef} className="letter-lens-picker" onBlur={(event) => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null) && !popoverRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={triggerRef} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>用新视角重读 <Icon name="down" size={14} /></button>
    {open && createPortal(<section ref={popoverRef} id={id} className="letter-lens-popover" data-placement={placement.above ? "above" : "below"} style={{ maxHeight: placement.maxHeight, left: placement.left, top: placement.above ? "auto" : placement.edge, bottom: placement.above ? placement.edge : "auto" }} aria-label="选择重读视角">
      <p>用 {lenses.length} 种从公开原则提炼的视角重新写这封信。</p>
      <LetterLensChoices lenses={lenses} onSelect={lens => { setOpen(false); onSelect(lens); }} />
    </section>, document.body)}
  </div>;
}
