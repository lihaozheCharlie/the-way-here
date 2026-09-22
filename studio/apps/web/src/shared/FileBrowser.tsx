import type { ReactNode } from "react";
import { PaneShelf } from "./PaneShelf";
import { QuietScroll } from "./QuietScroll";

/** Both records and letters use the same collapsible file column and row markup. */
export function FileBrowserPane({ label, count, open, onToggle, order, toolbar, children, toggleLabel = "文件列表" }: {
  label: string; count: string; open: boolean; onToggle: () => void; order: string;
  toolbar?: ReactNode; children: ReactNode; toggleLabel?: string;
}) {
  return <div className={`source-pane-shell source-file-shell${open ? "" : " collapsed"}`}>
    <section className="source-file-pane" aria-label={label}>
      <PaneShelf label={label} count={count} open={open} onToggle={onToggle} toggleLabel={toggleLabel} />
      <div className="source-file-contents" inert={!open} aria-hidden={!open}>
        <p className="source-file-order">{order}</p>{toolbar}
        <QuietScroll className="source-file-list" data-overflow-tooltip="off">{children}</QuietScroll>
      </div>
    </section>
  </div>;
}

export function FileBrowserItem({ title, label = title, date, dateLabel, excerpt, active, onSelect, icon, selection, actions, children }: {
  title: string; label?: string; date: string; dateLabel: string; excerpt: string; active: boolean; onSelect: () => void;
  icon?: ReactNode; selection?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  return <article className={`source-file-row${active ? " active" : ""}${selection ? " is-selectable" : ""}`}>
    {selection}
    <button type="button" className="source-file-select" aria-label={label} aria-current={active ? "true" : undefined} onClick={onSelect}>
      {icon}<span className="source-record-copy"><time dateTime={date}>{dateLabel}</time><b>{title}</b><small data-overflow-tooltip="off">{excerpt}</small></span>
    </button>
    {actions}{children}
  </article>;
}
