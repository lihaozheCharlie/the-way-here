import type { ReactNode, DragEventHandler } from "react";
import type { WikiPageSummary } from "@the-way-here/shared";
import { PaneShelf } from "./PaneShelf";
import { QuietScroll } from "./QuietScroll";
import "./file-browser.css";
import { useDemoLabels, tr } from "./i18n";

/** Both records and letters use the same collapsible file column and row markup. */
export function FileBrowserPane({ label, count, open, onToggle, toolbar, headerAction, onCreate, createLabel, createDisabled, inlineCreate, children, toggleLabel = tr("文件列表") }: {
  label: string; count: string; open: boolean; onToggle: () => void;
  toolbar?: ReactNode; headerAction?: ReactNode; onCreate?: () => void; createLabel?: string; createDisabled?: boolean; inlineCreate?: ReactNode; children: ReactNode; toggleLabel?: string;
}) {
  return <div className={`source-pane-shell source-file-shell${open ? "" : " collapsed"}`}>
    <section className="source-file-pane" aria-label={label}>
      <PaneShelf label={label} count={count} open={open} onToggle={onToggle} toggleLabel={toggleLabel} action={headerAction} onCreate={onCreate} createLabel={createLabel} createDisabled={createDisabled} />
      <div className="source-file-contents" inert={!open} aria-hidden={!open}>
        {inlineCreate}{toolbar}
        <QuietScroll className="source-file-list" data-overflow-tooltip="off">{children}</QuietScroll>
      </div>
    </section>
  </div>;
}

export function FileBrowserItem({ page, active, onSelect, selection, actions, children, onDragStart, onDragEnd }: {
  page: Pick<WikiPageSummary, "relativePath" | "title" | "excerpt" | "externalSource">; active: boolean; onSelect: () => void;
  selection?: ReactNode; actions?: ReactNode; children?: ReactNode; onDragStart?: DragEventHandler<HTMLElement>; onDragEnd?: DragEventHandler<HTMLElement>;
}) {
  const demo = useDemoLabels();
  const storedName = (page.externalSource?.originalPath || page.relativePath).replaceAll("\\", "/").split("/").filter(Boolean).at(-1) || page.title;
  const fileName = demo.file(storedName);
  return <article draggable={Boolean(onDragStart)} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`source-file-row${active ? " active" : ""}${selection ? " is-selectable" : ""} file-browser-item`}>
    {selection}
    <button type="button" className="source-file-select" aria-label={fileName} aria-current={active ? "true" : undefined} onClick={onSelect}>
      <span className="source-record-copy"><b className="file-browser-name">{fileName}</b>{page.excerpt && <small className="file-browser-excerpt" data-overflow-tooltip="off">{demo.excerpt(page.relativePath, page.excerpt)}</small>}</span>
    </button>
    {actions}{children}
  </article>;
}
