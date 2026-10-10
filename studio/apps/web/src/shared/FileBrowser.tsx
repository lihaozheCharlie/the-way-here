import type { ReactNode } from "react";
import type { WikiPageSummary } from "@the-way-here/shared";
import { PaneShelf } from "./PaneShelf";
import { QuietScroll } from "./QuietScroll";
import "./file-browser.css";

/** Both records and letters use the same collapsible file column and row markup. */
export function FileBrowserPane({ label, count, open, onToggle, toolbar, headerAction, onCreate, createLabel, inlineCreate, children, toggleLabel = "文件列表" }: {
  label: string; count: string; open: boolean; onToggle: () => void;
  toolbar?: ReactNode; headerAction?: ReactNode; onCreate?: () => void; createLabel?: string; inlineCreate?: ReactNode; children: ReactNode; toggleLabel?: string;
}) {
  return <div className={`source-pane-shell source-file-shell${open ? "" : " collapsed"}`}>
    <section className="source-file-pane" aria-label={label}>
      <PaneShelf label={label} count={count} open={open} onToggle={onToggle} toggleLabel={toggleLabel} action={headerAction} onCreate={onCreate} createLabel={createLabel} />
      <div className="source-file-contents" inert={!open} aria-hidden={!open}>
        {inlineCreate}{toolbar}
        <QuietScroll className="source-file-list" data-overflow-tooltip="off">{children}</QuietScroll>
      </div>
    </section>
  </div>;
}

export function FileBrowserItem({ page, active, onSelect, selection, actions, children }: {
  page: Pick<WikiPageSummary, "relativePath" | "title" | "excerpt">; active: boolean; onSelect: () => void;
  selection?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const fileName = page.relativePath.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) || page.title;
  return <article className={`source-file-row${active ? " active" : ""}${selection ? " is-selectable" : ""} file-browser-item`}>
    {selection}
    <button type="button" className="source-file-select" aria-label={fileName} aria-current={active ? "true" : undefined} onClick={onSelect}>
      <span className="source-record-copy"><b className="file-browser-name">{fileName}</b>{page.excerpt && <small className="file-browser-excerpt" data-overflow-tooltip="off">{page.excerpt}</small>}</span>
    </button>
    {actions}{children}
  </article>;
}
