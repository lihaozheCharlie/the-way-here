import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { LetterLens, ReasoningLens } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { currentLocale, translate } from "../../shared/i18n";

function tr(message: string, params?: Record<string, string | number | null | undefined>): string {
  return translate(currentLocale(), message, params);
}

/** Chinese names are written “given name · surname” (理查德·费曼); the surname is how readers refer to the person. */
function lensSurname(displayName: string): string {
  const segments = displayName.split("·");
  return segments.length > 1 ? segments.at(-1)!.trim() : displayName;
}

function lensInitial(displayName: string): string {
  const surname = lensSurname(displayName);
  return surname.split(/\s+/).at(-1)?.slice(0, 1) || surname.slice(0, 1);
}

function LensChoice({ lens, onSelect, selected = false, current = false }: { lens: ReasoningLens; onSelect: () => void; selected?: boolean; current?: boolean }) {
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
  const displayName = tr(lens.displayName);
  const attention = tr(lens.attention);
  const summary = attention.split(/[。；;.]/)[0];
  const initial = lensInitial(displayName);
  return <>
    <button ref={trigger} className="letter-lens-choice" type="button" aria-pressed={selected} aria-current={current ? "true" : undefined} disabled={current} aria-describedby={visible ? id : undefined} data-overflow-tooltip="off" onPointerEnter={() => { if (current) return; clearTimeout(timer.current); timer.current = setTimeout(() => setVisible(true), 180); }} onPointerLeave={leave} onFocus={event => { if (!current && event.currentTarget.matches(":focus-visible")) setVisible(true); }} onBlur={hide} onClick={() => { hide(); if (!current) onSelect(); }}>
      <span className="letter-lens-avatar" aria-hidden="true">{initial}</span>
      <span className="letter-lens-copy"><b>{displayName}</b><small>{summary}</small></span>
      {current && <span className="letter-lens-current">{tr("当前")}</span>}
    </button>
    {visible && createPortal(<div id={id} ref={tooltip} role="tooltip" className="letter-lens-tooltip" style={position} onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={leave}><b>{displayName}</b><p>{attention}</p>{lens.helperUse && <p>{tr(lens.helperUse)}</p>}{Boolean(lens.signals?.length) && <p>{tr("关注：")}{lens.signals.map((signal) => tr(signal)).join(tr("、"))}</p>}</div>, document.body)}
  </>;
}

export function LetterLensChoices({ lenses, onSelect, selectedId, currentId, onAutoSelect, autoSelected = false }: { lenses: ReasoningLens[]; onSelect: (lens: ReasoningLens) => void; selectedId?: string; currentId?: string; onAutoSelect?: () => void; autoSelected?: boolean }) {
  return <div className="letter-lens-grid">
    {onAutoSelect && <button className="letter-lens-choice" type="button" aria-pressed={autoSelected} onClick={onAutoSelect}><span className="letter-lens-avatar" aria-hidden="true"><Icon name="spark" size={16} /></span><span className="letter-lens-copy"><b>{tr("自动选择")}</b><small>{tr("根据这段经历，选择合适的视角")}</small></span></button>}
    {lenses.map(lens => <LensChoice key={lens.id} lens={lens} selected={selectedId === lens.id} current={currentId === lens.id} onSelect={() => onSelect(lens)} />)}
  </div>;
}

/** The trigger doubles as the “written by” label: it names the lens of the letter or version being read. */
export function LetterLensPicker({ lenses, current, onSelect }: { lenses: ReasoningLens[]; current?: LetterLens; onSelect: (lens: ReasoningLens) => void }) {
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
      setPlacement((previous) => previous.above === above && previous.maxHeight === maxHeight && previous.left === left && previous.edge === edge ? previous : { above, maxHeight, left, edge });
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
  const known = Boolean(current?.id || current?.name);
  const currentLens = current?.id ? lenses.find((lens) => lens.id === current.id) : undefined;
  const currentName = currentLens ? tr(currentLens.displayName) : current?.name ? tr(current.name) : "";
  // The closed control is narrow, so it uses the short form; the popover spells the lens out in full.
  const shortName = currentLens ? lensSurname(currentName) : currentName;
  const canReread = lenses.length > 0;
  // Letters written before lenses were recorded still say so; only hide the control when there is nothing to show or do.
  if (!known && !canReread) return null;
  const visibleLabel = known ? tr("${name}视角", { name: shortName }) : tr("默认视角");
  const label = canReread ? (known ? tr("${name}视角。点击换一个视角重读", { name: shortName }) : tr("默认视角。点击选择一个视角重读")) : visibleLabel;
  return <div ref={rootRef} className="letter-lens-picker" onBlur={(event) => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null) && !popoverRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={triggerRef} type="button" className={known ? "letter-lens-trigger" : "letter-lens-trigger letter-lens-trigger-default"} aria-expanded={canReread ? open : undefined} aria-controls={open ? id : undefined} aria-haspopup={canReread ? "dialog" : undefined} aria-disabled={canReread ? undefined : "true"} aria-label={label} data-overflow-tooltip="off" onClick={() => { if (canReread) setOpen((value) => !value); }}>
      <span className="letter-lens-avatar" aria-hidden="true">{known ? lensInitial(shortName) : <Icon name="spark" size={13} />}</span>
      <span className="letter-lens-trigger-name">{visibleLabel}</span>
      {canReread && <Icon name="down" size={14} />}
    </button>
    {open && createPortal(<section ref={popoverRef} id={id} className="letter-lens-popover" data-placement={placement.above ? "above" : "below"} style={{ maxHeight: placement.maxHeight, left: placement.left, top: placement.above ? "auto" : placement.edge, bottom: placement.above ? placement.edge : "auto" }} aria-label={tr("选择重读视角")}>
      {known && <b className="letter-lens-popover-title">{tr("当前视角：${name}", { name: currentName })}</b>}
      <p>{known ? tr("换一个视角，会从原始材料重新写一封，原信保留。") : tr("这封信没有记录视角。选一个视角，会从原始材料重新写一封，原信保留。")}</p>
      <LetterLensChoices lenses={lenses} currentId={currentLens?.id} onSelect={lens => { setOpen(false); onSelect(lens); }} />
    </section>, document.body)}
  </div>;
}
