import { tr, uiDateLocale } from "../../shared/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CaptureEntry, SourceFolderSummary } from "@the-way-here/shared";
import { api } from "../../api";
import { MarkdownBody } from "../../shared/markdown";
import { Icon } from "../../shared/ui";
import { NavLink } from "react-router-dom";
import { pageHref } from "../../shared/routing";
import { createPortal } from "react-dom";

export function CaptureDialog({ title, className = "", close, children }: { title: string; className?: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return createPortal(<dialog ref={dialog} className={`capture-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}><header><h2>{title}</h2><button type="button" aria-label={tr("关闭")} onClick={close}><Icon name="close" /></button></header>{children}</dialog>, document.body);
}
export function CaptureHistoryDialog({ entries, restore, remove, close, photoHistory }: { photoHistory?: ReactNode; entries: CaptureEntry[]; restore: (entry: CaptureEntry) => Promise<void>; remove: (entry: CaptureEntry) => Promise<void>; close: () => void }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [selected, setSelected] = useState(entries[0]?.id || "");
  const [tab, setTab] = useState("content"), [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = (e: CaptureEntry) => e.status === "draft" || e.text !== (e.originalText ?? e.content);
  const list = entries.filter(e => (filter === "all" || (filter === "draft" ? pending(e) : e.status === "saved")) && `${e.text}\n${e.content || ""}`.toLowerCase().includes(query.toLowerCase()));
  const entry = list.find(e => e.id === selected) || list[0];
  async function act(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : tr("操作未完成，请重试")); } finally { setBusy(false); } }
  return <CaptureDialog title={tr("历史记录")} className="capture-history-dialog" close={() => { if (!busy) close(); }}>{photoHistory}<div className="capture-history-layout"><aside><label className="capture-history-search"><Icon name="search" size={16} /><input aria-label={tr("搜索历史记录")} placeholder={tr("搜索记录…")} value={query} onChange={e => setQuery(e.target.value)} /></label><div className="capture-filters" aria-label={tr("历史记录筛选")}>{[["all",tr("全部")],["draft",tr("待整理")],["saved",tr("已保存")]].map(([id,label]) => <button type="button" key={id} aria-pressed={filter===id} onClick={() => { setFilter(id!); setDeleting(false); }}>{label}</button>)}</div><div className="capture-history-list">{list.length ? list.map(e => <button type="button" key={e.id} aria-pressed={entry?.id===e.id} onClick={() => { setSelected(e.id); setTab("content"); setDeleting(false); setError(""); }}><span><time>{new Date(e.updatedAt).toLocaleString(uiDateLocale(), {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time><small>{e.status === "saved" ? pending(e) ? tr("有补充") : tr("已保存") : tr("待整理")}</small></span><strong>{(e.content?.split("\n")[0]?.replace(/^#+\s*/,"") || e.text.trim().split("\n")[0] || tr("空白草稿")).slice(0,45)}</strong><p>{e.text.slice(0,85)}</p></button>) : <p className="capture-empty">{query || filter !== "all" ? tr("没有找到记录") : tr("还没有历史记录")}</p>}</div></aside><section className="capture-history-detail">{entry ? <><div className="capture-history-meta"><span><Icon name="folder" size={15} />{tr("生活记录 /") + " "}{entry.folder}</span><button type="button" className="capture-delete" disabled={busy} onClick={() => setDeleting(true)}><Icon name="trash" size={15} />{tr("删除")}</button></div>{entry.status === "saved" && <div className="capture-tabs">{[["content",tr("整理后")],["original",tr("原话")],...(pending(entry)?[["pending",tr("待整理补充")]]:[])].map(([id,label]) => <button type="button" key={id} aria-pressed={tab===id} onClick={() => setTab(id!)}>{label}</button>)}</div>}<div className={`capture-history-text${entry.status === "saved" && tab === "content" ? " is-organized" : ""}`}>{entry.status === "saved" && tab === "content" ? <MarkdownBody>{(entry.content || "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => `[${label || target}](${pageHref(target)})`)}</MarkdownBody> : entry.status === "draft" || tab === "pending" ? entry.text : (entry.originalText ?? tr("原话缓存不可用，已保存的日记仍可查看。"))}</div>{error && <p className="capture-dialog-error" role="alert">{tr(error)}</p>}<footer>{deleting ? <div className="capture-delete-confirm"><p>{entry.status === "saved" ? tr("从历史记录中删除？已保存的日记文件会保留。") : tr("删除这条草稿？删除后无法恢复。")}</p><button type="button" disabled={busy} onClick={() => setDeleting(false)}>{tr("取消")}</button><button type="button" className="capture-danger" disabled={busy} onClick={() => void act(async () => { await remove(entry); setDeleting(false); })}>{busy ? tr("正在删除…") : tr("确认删除")}</button></div> : <>{entry.pageId && <NavLink to={pageHref(entry.pageId)} onClick={close}>{tr("查看文件") + " "}<Icon name="arrow" size={14} /></NavLink>}<button type="button" className="desktop-primary" disabled={busy} onClick={() => void act(async () => { await restore(entry); close(); })}>{busy ? tr("正在恢复…") : entry.status === "saved" ? tr("继续补充") : tr("恢复续写")}</button></>}</footer></> : <div className="capture-empty">{tr("写下或说一段，暂存的草稿和保存的日记会出现在这里。")}</div>}</section></div></CaptureDialog>;
}
export function CaptureFolderDialog({ knowledgeBaseId, folder, defaultFolder, choose, close }: {
  knowledgeBaseId: string;
  folder: string;
  defaultFolder: string;
  choose: (folder: string, makeDefault: boolean) => Promise<void>;
  close: () => void;
}) {
  const [folders, setFolders] = useState<SourceFolderSummary[]>([]);
  const [selected, setSelected] = useState(folder);
  const [makeDefault, setMakeDefault] = useState(true);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void api<SourceFolderSummary[]>("/api/sources/folders")
      .then(values => { if (live) setFolders(values.filter(f => !f.external)); })
      .catch(reason => { if (live) setError(reason instanceof Error ? reason.message : tr("无法读取文件夹，请重新打开重试")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [knowledgeBaseId]);
  const options = Array.from(new Set([folder, defaultFolder, ...folders.map(f => f.path)]));
  async function create() {
    const name = newName.trim();
    if (!name || busy) return;
    if (name.length > 40 || /[\\/<>:"|?*\u0000-\u001f]/.test(name) || name.startsWith(".")) {
      setError(tr("请填写有效的文件夹名称，不含路径符号，最多 40 个字。"));
      return;
    }
    if (options.includes(name)) { setSelected(name); setNewName(""); setError(""); return; }
    setBusy(true); setError("");
    try {
      await api("/api/sources/folders", { method: "POST", body: JSON.stringify({ knowledgeBaseId, folder: name }) });
      setFolders(values => [...values, { path: name }]);
      setSelected(name); setNewName("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("创建失败，请重试")); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (busy || loading) return;
    setBusy(true); setError("");
    try { await choose(selected, makeDefault); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : tr("保存失败，请重试")); }
    finally { setBusy(false); }
  }
  return <CaptureDialog title={tr("保存位置")} className="capture-folder-dialog" close={() => { if (!busy) close(); }}>
    <div className="capture-folder-content">
      <p className="capture-folder-caption"><Icon name="folder" size={17} />{tr("生活记录")}</p>
      <fieldset className="capture-folder-list" disabled={busy} aria-label={tr("保存文件夹")}>
        {options.map(value => <label className="capture-folder-option" key={value}>
          <input type="radio" name="capture-destination" value={value} checked={selected === value} onChange={() => setSelected(value)} />
          <Icon name="folder" size={20} />
          <span className="capture-folder-name">{value}</span>
          {value === defaultFolder && <span className="capture-folder-default">{tr("默认")}</span>}
        </label>)}
      </fieldset>
      {loading && <p className="capture-folder-loading" role="status">{tr("正在读取文件夹…")}</p>}
      <form className="capture-new-folder" onSubmit={event => { event.preventDefault(); void create(); }}>
        <input aria-label={tr("新文件夹名称")} placeholder={tr("新文件夹名称")} maxLength={40} value={newName} disabled={busy} onChange={event => setNewName(event.target.value)} />
        <button type="submit" aria-label={tr("创建文件夹")} disabled={busy || loading || !newName.trim()}><Icon name="plus" size={22} /></button>
      </form>
      <label className="capture-default-folder"><input type="checkbox" checked={makeDefault} disabled={busy} onChange={event => setMakeDefault(event.target.checked)} />{tr("之后的新记录也保存到这里")}</label>
      {error && <p className="capture-dialog-error" role="alert">{tr(error)}</p>}
    </div>
    <footer><button type="button" className="capture-folder-cancel" disabled={busy} onClick={close}>{tr("取消")}</button><button type="button" className="desktop-primary" disabled={busy || loading} onClick={() => void confirm()}>{busy ? tr("正在保存…") : tr("确定")}</button></footer>
  </CaptureDialog>;
}
