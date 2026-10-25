import { tr, useDemoLabels } from "./i18n";
import { useDismissLayer } from "./use-dismiss-layer";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { api } from "../api";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { Icon } from "./ui";
import "./file-menu.css";

type FileEntry = Pick<WikiPageSummary, "id" | "title"> & Partial<WikiPageSummary>;
export type FileAction = { label: string; onSelect: () => void; danger?: boolean };
export function FileMenu({ page: entry, extraActions = [], onRename, onDelete, onRenamed, onDeleted }: {
  page: FileEntry; extraActions?: FileAction[]; onRename?: () => void; onDelete?: () => void;
  onRenamed?: (page: WikiPage) => void; onDeleted?: () => void;
}) {
  const [resolved, setResolved] = useState<WikiPage>();
  const page = resolved?.id === entry.id ? resolved : entry;
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "delete">();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const renameDialog = useRef<HTMLDialogElement>(null);
  useDismissLayer(open, () => { setOpen(false); trigger.current?.focus(); });
  const demo = useDemoLabels();
  const fileName = (page.externalSource?.originalPath || page.relativePath)?.split("/").at(-1)?.replace(/\.(md|txt)$/i, "") || page.title;
  const shownName = demo.heading(page.relativePath || page.id || "", page.excerpt) || demo.title(fileName);
  useEffect(() => {
    if (!open) return;
    const rect = trigger.current!.getBoundingClientRect();
    const height = menu.current?.offsetHeight || 180;
    setPosition({ left: Math.max(8, Math.min(rect.right - 200, window.innerWidth - 208)), top: rect.bottom + height + 8 < window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4) });
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", dismiss);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => { window.removeEventListener("pointerdown", dismiss); document.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", scroll); };
  }, [open]);
  useEffect(() => { if (dialog === "rename") renameDialog.current?.showModal(); }, [dialog]);
  const closeDialog = () => { setDialog(undefined); setError(""); trigger.current?.focus(); };
  async function toggleMenu() {
    setError("");
    if (open) { setOpen(false); return; }
    if (!page.relativePath || !page.modifiedAt) {
      setBusy(true);
      try { setResolved(await api<WikiPage>(`/api/pages/${page.id.split("/").map(encodeURIComponent).join("/")}`)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : tr("暂时无法读取文件")); return; }
      finally { setBusy(false); }
    }
    setOpen(true);
  }
  async function reveal() {
    setBusy(true); setError("");
    try { await api("/api/files/reveal", { method: "POST", body: JSON.stringify({ pageId: page.id }) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : tr("暂时无法打开原始目录")); }
    finally { setBusy(false); }
  }
  async function rename() {
    if (busy || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const renamed = await api<WikiPage>("/api/pages/rename", { method: "POST", body: JSON.stringify({ pageId: page.id, fileName: name.trim(), expectedModifiedAt: page.modifiedAt }) });
      onRenamed?.(renamed); closeDialog();
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("重命名失败")); }
    finally { setBusy(false); }
  }
  const actions: FileAction[] = [
    ...extraActions,
    { label: tr("重命名"), onSelect: () => { if (onRename) onRename(); else { setName(fileName); setDialog("rename"); } } },
    { label: tr("打开原始目录"), onSelect: () => void reveal() },
    { label: tr("删除"), danger: true, onSelect: () => onDelete ? onDelete() : setDialog("delete") },
  ];
  return <>
    <button ref={trigger} type="button" className="file-menu-trigger" aria-label={tr("更多文件操作：${fileName}", { "fileName": shownName })} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={(event) => { event.stopPropagation(); void toggleMenu(); }}><Icon name="more" size={16} /></button>
    {open && createPortal(<div ref={menu} className="file-menu-popover" role="menu" aria-label={tr("${fileName}的文件操作", { "fileName": shownName })} style={position} onKeyDown={event => {
      if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>("button")]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    }}>{actions.map(action => <button role="menuitem" type="button" className={action.danger ? "danger" : ""} key={action.label} onClick={() => { setOpen(false); trigger.current?.focus(); action.onSelect(); }}>{action.label}</button>)}</div>, document.body)}
    {dialog === "rename" && createPortal(<dialog ref={renameDialog} className="file-rename-dialog" onCancel={event => { event.preventDefault(); if (!busy) closeDialog(); }}><form onSubmit={event => { event.preventDefault(); void rename(); }}><h2>{tr("重命名文件")}</h2><label>{tr("文件名")}<input autoFocus value={name} disabled={busy} onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)} /></label>{error && <p role="alert">{tr(error)}</p>}<footer><button type="button" disabled={busy} onClick={closeDialog}>{tr("取消")}</button><button type="submit" disabled={busy || !name.trim()}>{busy ? tr("正在保存…") : tr("保存")}</button></footer></form></dialog>, document.body)}
    {dialog === "delete" && createPortal(<ConfirmDeleteDialog title={tr("删除这个文件？")} description={tr("文件会从当前知识库中永久移除。")} itemName={shownName} impact={tr("引用此文件的页面不会一并删除；此操作不能撤销。")} confirmLabel={tr("删除文件")} onClose={closeDialog} onConfirm={async () => { await api(page.isSource ? "/api/sources/file" : "/api/pages/file", { method: "DELETE", body: JSON.stringify({ pageId: page.id, expectedModifiedAt: page.modifiedAt }) }); onDeleted?.(); }} />, document.body)}
    {error && !dialog && createPortal(<div className="file-menu-error" role="alert">{tr(error)}<button type="button" onClick={() => setError("")}>{tr("关闭")}</button></div>, document.body)}
  </>;
}
export function FileListRow({ page, children, onRenamed, onDeleted }: { page: FileEntry; children: ReactNode; onRenamed?: (page: WikiPage) => void; onDeleted?: () => void }) {
  return <div className="file-list-row">{children}<FileMenu page={page} onRenamed={onRenamed} onDeleted={onDeleted} /></div>;
}
