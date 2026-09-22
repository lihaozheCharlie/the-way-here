import { useId, type ReactNode } from "react";
import { Icon } from "./ui";

/** Keep the panel mounted so folding never discards a draft or a running task. */
export function AuxPanel({ open, onToggle, label, children, width = 240, railWidth = 48, showToggle = true, className = "", icon = "library" }: {
  open: boolean; onToggle: () => void; label: string; children: ReactNode;
  width?: number; railWidth?: number; showToggle?: boolean; className?: string; icon?: Parameters<typeof Icon>[0]["name"];
}) {
  const id = useId();
  return <aside className={`aux-panel ${className}${open ? " is-open" : " is-collapsed"}`} style={{ width: open ? width : railWidth }} aria-label={label}>
    {showToggle && <button type="button" className="aux-panel-toggle desktop-icon" aria-label={`${open ? "收起" : "展开"}${label}`} aria-expanded={open} aria-controls={id} onClick={onToggle}><Icon name={open ? "back" : icon} size={17} /></button>}
    <div id={id} className="aux-panel-content" inert={!open} aria-hidden={!open}>{children}</div>
  </aside>;
}
