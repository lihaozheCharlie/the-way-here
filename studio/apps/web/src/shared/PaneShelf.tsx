import type { ReactNode } from "react";
import { Icon } from "./ui";
import "./pane-shelf.css";

export function PaneShelf({ label, count, open, onToggle, toggleLabel = label, action }: { label: string; count?: string | number; open: boolean; onToggle: () => void; toggleLabel?: string; action?: ReactNode }) {
  return <header className="pane-shelf"><div className="pane-shelf-label"><b title={label}>{label}</b></div><div className="pane-shelf-actions">{count !== undefined && <span className="pane-shelf-count">{count}</span>}{open && action}<button type="button" className="pane-shelf-toggle" aria-expanded={open} aria-label={`${open ? "收起" : "展开"}${toggleLabel}`} onClick={onToggle}><Icon name={open ? "back" : "arrow"} size={13} /></button></div></header>;
}
