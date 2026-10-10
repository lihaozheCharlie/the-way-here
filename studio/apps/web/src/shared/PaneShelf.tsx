import type { ReactNode } from "react";
import { Icon } from "./ui";
import "./pane-shelf.css";

export function PaneShelf({ label, count, open, onToggle, toggleLabel = label, action, onCreate, createLabel = "新建文件" }: { label: string; count?: string | number; open: boolean; onToggle: () => void; toggleLabel?: string; action?: ReactNode; onCreate?: () => void; createLabel?: string }) {
  const toggle = <button type="button" className="pane-shelf-toggle" aria-expanded={open} aria-label={`${open ? "收起" : "展开"}${toggleLabel}`} title={`${open ? "收起" : "展开"}${toggleLabel}`} onClick={onToggle}><Icon name={open ? "back" : "arrow"} size={14} /></button>;
  const create = onCreate && <button type="button" className="pane-shelf-create" aria-label={createLabel} title={createLabel} onClick={onCreate}><Icon name="plus" size={16} /></button>;
  return <header className={`pane-shelf${open ? "" : " pane-shelf--collapsed"}`}>
    {open ? <><div className="pane-shelf-label"><b title={label}>{label}</b></div><div className="pane-shelf-actions">{create}{action}{toggle}</div></> : <>{toggle}{create}<button type="button" className="pane-shelf-rail-label" aria-label={`展开${toggleLabel}`} title={label} onClick={onToggle}><span>{label}</span>{count !== undefined && <small>{count}</small>}</button></>}
  </header>;
}
