import { readPreference, writePreference } from "./preference-storage";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SourceFolderSummary, VaultInfo } from "@the-way-here/shared";
import { api } from "../api";
import { useApi } from "./use-api";
import { Icon } from "./ui";
import { useDismissLayer } from "./use-dismiss-layer";
import "./folder-tree.css";
import { tr, useDemoLabels, useI18n } from "./i18n";

const folderLabel = (node: SourceFolderSummary) => { const text = node.label || node.path.split("/").at(-1)!; return text.length > 32 ? `${text.slice(0, 17)}…${text.slice(-12)}` : text; };
export const folderParent = (path: string) => path.startsWith("外部来源/") && path.split("/").length === 2 ? "" : path.split("/").slice(0, -1).join("/");
export function folderAncestors(path: string): string[] { const result: string[] = []; for (let p = folderParent(path); p; p = folderParent(p)) result.unshift(p); return result; }
export function FolderTree({ selected, onSelect, revision = 0, counts, total = 0, internalOnly = false, createToken = 0, onChanged, fileDrop }: {
  selected: string; onSelect: (path: string) => void; revision?: number; counts?: Map<string, number>; total?: number;
  fileDrop?: { accepts: (data: DataTransfer, folder: string) => boolean; drop: (data: DataTransfer, folder: string) => void };
  internalOnly?: boolean; createToken?: number; onChanged?: () => void;
}) {
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  const demo = useDemoLabels();
  const { t } = useI18n();
  const tree = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<SourceFolderSummary[]>([]);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const loadedRef = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const generation = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const scopeKey = useRef<string | undefined>(undefined);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const openRef = useRef(open);
  openRef.current = open;
  const [focused, setFocused] = useState(selected);
  const [dropTarget, setDropTarget] = useState("");
  useEffect(() => { const clear = () => setDropTarget(""); window.addEventListener("dragend", clear); return () => window.removeEventListener("dragend", clear); }, []);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ parent: string; node?: SourceFolderSummary }>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ node: SourceFolderSummary; x: number; y: number }>();
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissLayer(Boolean(menu), () => { setMenu(undefined); focus(menu?.node.path || selected); }, { element: menuRef });
  const storageKey = `the-way-here.folder-tree.${vault?.knowledgeBaseId || ""}`;
  async function load(parent: string, force = false) {
    if (pending.current.has(parent) || !force && loadedRef.current.has(parent)) return;
    pending.current.add(parent); const version = generation.current;
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const children = await api<SourceFolderSummary[]>(`/api/sources/folders?parent=${encodeURIComponent(parent)}`, { signal: controller.signal });
      if (version !== generation.current) return;
      setNodes(current => {
        const childPaths = new Set(children.map(node => node.path));
        const removed = current.filter(node => folderParent(node.path) === parent && !childPaths.has(node.path));
        // Remove deleted branches, while retaining the DOM identities of surviving rows.
        return [...current.filter(node => folderParent(node.path) !== parent && !removed.some(root => node.path.startsWith(`${root.path}/`))), ...children];
      });
      loadedRef.current.add(parent); setLoaded(new Set(loadedRef.current));
      return children;
    } catch (reason) { if (!controller.signal.aborted && version === generation.current) { setError(reason instanceof Error ? reason.message : tr("无法读取文件夹，请重新连接")); const root = parent.startsWith("外部来源/") ? parent.split("/").slice(0, 2).join("/") : undefined; if (root) setNodes(current => current.map(node => node.path === root ? { ...node, unavailable: true } : node)); } }
    finally { requests.current.delete(controller); if (version === generation.current) pending.current.delete(parent); }
  }
  useEffect(() => {
    if (!vault) return;
    generation.current++; pending.current.clear();
    const scopeChanged = scopeKey.current !== storageKey;
    scopeKey.current = storageKey;
    let expanded = new Set([...openRef.current, ...folderAncestors(selected)]);
    if (scopeChanged) {
      // Clear data only when changing knowledge bases, never for a live refresh.
      loadedRef.current = new Set(); setLoaded(new Set()); setNodes([]); setError("");
      setEditing(undefined); setMenu(undefined);
      let saved: string[] = [];
      try { const value = JSON.parse(readPreference(storageKey) || "[]"); if (Array.isArray(value)) saved = value.filter(p => typeof p === "string"); } catch { /* Optional preference. */ }
      expanded = new Set([...saved, ...folderAncestors(selected)]); setOpen(expanded);
    }
    const restoreGeneration = generation.current;
    void (async () => {
      const roots = await load("", true);
      if (!roots || restoreGeneration !== generation.current) return;
      const known = new Set(roots.map(node => node.path));
      for (const path of [...expanded].sort((a, b) => folderAncestors(a).length - folderAncestors(b).length)) {
        if (restoreGeneration !== generation.current) return;
        if (!known.has(path)) continue;
        const children = await load(path, true);
        for (const child of children || []) known.add(child.path);
      }
    })();
    return () => {
      generation.current++;
      for (const controller of requests.current) controller.abort();
      requests.current.clear();
    };
  }, [revision, storageKey]);
  useEffect(() => { const ancestors = folderAncestors(selected); setOpen(current => new Set([...current, ...ancestors])); if (loadedRef.current.has("")) ancestors.forEach(path => void load(path)); setFocused(selected); }, [selected]);
  function toggle(path: string) {
    const next = new Set(open); if (next.has(path)) next.delete(path); else { next.add(path); void load(path, true); } setOpen(next);
    try { writePreference(storageKey, JSON.stringify([...next])); } catch { /* Optional preference. */ }
  }
  function create(parent: string) { if (!parent && !internalOnly) return; setEditing({ parent }); setName(""); setError(""); if (parent) { setOpen(current => new Set([...current, parent])); void load(parent); } }
  const previousToken = useRef(createToken);
  useEffect(() => { if (createToken !== previousToken.current) { previousToken.current = createToken; create(selected); } }, [createToken]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(undefined); };
    const scroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(undefined); };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("scroll", scroll, true); };
  }, [menu]);
  async function save() {
    if (busy || !name.trim() || !editing) return;
    setBusy(true); setError("");
    try {
      const result = editing.node ? await api<{ path: string }>("/api/sources/folder-action", { method: "POST", body: JSON.stringify({ folder: editing.node.path, action: "rename", name: name.trim(), modifiedAt: editing.node.modifiedAt, knowledgeBaseId: vault?.knowledgeBaseId }) })
        : await api<{ path: string }>("/api/sources/folders", { method: "POST", body: JSON.stringify({ folder: [editing.parent, name.trim()].filter(Boolean).join("/"), knowledgeBaseId: vault?.knowledgeBaseId }) });
      setEditing(undefined); await load(editing.parent, true); onSelect(result.path); onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("保存失败")); } finally { setBusy(false); }
  }
  async function action(node: SourceFolderSummary, action: "reveal" | "trash" | "remove" | "reload" | "reconnect") {
    setMenu(undefined); focus(node.path); setError(""); setBusy(true);
    try {
      const connectionId = node.path.split("/")[1];
      if (action === "remove") await api(`/api/source-connections/${connectionId}`, { method: "DELETE", body: JSON.stringify({ knowledgeBaseId: vault?.knowledgeBaseId }) });
      else if (action === "reconnect") {
        const path = window.desktop ? await window.desktop.chooseSourceDirectory() : window.prompt(tr("重新连接文件夹：输入完整路径"), node.absolutePath);
        if (!path) return;
        await api(`/api/source-connections/${connectionId}/reconnect`, { method: "POST", body: JSON.stringify({ knowledgeBaseId: vault?.knowledgeBaseId, path }) });
      } else if (action !== "reload") {
        if (action === "trash" && !window.confirm(tr("将「${p0}」及其中的所有文件移到废纸篓？", { "p0": node.label || node.path }))) return;
        await api("/api/sources/folder-action", { method: "POST", body: JSON.stringify({ folder: node.path, action, modifiedAt: node.modifiedAt, knowledgeBaseId: vault?.knowledgeBaseId }) });
      }
      if (action === "trash" || action === "remove") onSelect(folderParent(node.path));
      await load(folderParent(node.path), true); if (open.has(node.path) && action !== "trash" && action !== "remove") await load(node.path, true); onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("操作失败，请重试")); } finally { setBusy(false); }
  }
  const visible: SourceFolderSummary[] = [];
  function visit(parent: string) { nodes.filter(n => folderParent(n.path) === parent && (!internalOnly || !n.external)).sort((a, b) => (Number(Boolean(b.external)) - Number(Boolean(a.external))) || (a.label || a.path).localeCompare(b.label || b.path, "zh-CN", { numeric: true })).forEach(n => { visible.push(n); if (open.has(n.path)) visit(n.path); }); }
  visit("");
  function focus(path: string) { setFocused(path); tree.current?.querySelector<HTMLElement>(`[data-folder="${CSS.escape(path)}"]`)?.focus(); }
  function key(event: React.KeyboardEvent, node?: SourceFolderSummary) {
    if ((event.target as Element).closest("input, [role=menu]")) return;
    const path = node?.path || "", list = ["", ...visible.map(n => n.path)], index = list.indexOf(path);
    if (event.key === "ArrowDown") focus(list[Math.min(index + 1, list.length - 1)]!);
    else if (event.key === "ArrowUp") focus(list[Math.max(0, index - 1)]!);
    else if (event.key === "Home") focus("");
    else if (event.key === "End") focus(list.at(-1)!);
    else if (event.key === "ArrowRight" && node && !node.unavailable) { if (!open.has(path)) toggle(path); else focus(visible.find(n => folderParent(n.path) === path)?.path || path); }
    else if (event.key === "ArrowLeft" && node) { if (open.has(path)) toggle(path); else focus(folderParent(path)); }
    else if (event.key === "Enter" || event.key === " ") { if (!node?.unavailable) onSelect(path); }
    else if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "n") create(path);
    else if ((event.key === "F10" && event.shiftKey || event.key === "ContextMenu") && node && !internalOnly) showMenu(node, event.currentTarget.getBoundingClientRect());
    else return;
    event.preventDefault(); event.stopPropagation();
  }
  function showMenu(node: SourceFolderSummary, rect: { right: number; bottom: number }) { setMenu({ node, x: Math.max(8, Math.min(rect.right - 12, innerWidth - 232)), y: Math.max(8, Math.min(rect.bottom + 4, innerHeight - 256)) }); }
  function input(parent: string, node?: SourceFolderSummary) {
    return editing?.parent === parent && editing.node?.path === node?.path ? <div className="folder-tree-input" key={`input-${node?.path || parent}`} style={{ paddingLeft: 24 + folderAncestors(node?.path || `${parent}/new`).length * 16 }}><Icon name="folder" size={16} /><input autoFocus aria-label={node ? tr("重命名文件夹") : tr("新文件夹名称")} value={name} placeholder={tr("新建文件夹")} disabled={busy} onChange={event => setName(event.target.value)} onBlur={event => { if (!busy && !(event.relatedTarget instanceof Element && event.relatedTarget.closest(".folder-tree-input"))) setEditing(undefined); }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void save(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(undefined); focus(node?.path || parent); } }} /><button type="button" aria-label={tr("保存文件夹")} disabled={busy || !name.trim()} onClick={() => void save()}><Icon name="check" size={14} /></button><button type="button" aria-label={tr("取消")} onClick={() => setEditing(undefined)}><Icon name="close" size={14} /></button></div> : null;
  }
  let lastGroup = "";
  return <>    <div ref={tree} className="folder-tree" role="tree" aria-label={t(internalOnly ? "保存位置" : "文件夹树")} aria-busy={!loaded.has("")}>
    <div role="treeitem" aria-level={1} aria-selected={!selected} tabIndex={focused === "" || !visible.some(n => n.path === focused) ? 0 : -1} data-folder="" className={`folder-tree-row${!selected ? " selected" : ""}`} onFocus={() => setFocused("")} onClick={() => onSelect("")} onKeyDown={event => key(event)}><span className="folder-tree-chevron" /><Icon name="source" size={16} /><span className="folder-tree-name">{t(internalOnly ? "应用资料根目录" : "全部材料")}</span>{!internalOnly && <small>{total}</small>}</div>
    {input("")}
    {visible.map(node => {
      const depth = folderAncestors(node.path).length, root = Boolean(node.external && depth === 0), expanded = open.has(node.path), childrenLoaded = loaded.has(node.path);
      const hasChildren = !node.unavailable && (!childrenLoaded || nodes.some(n => folderParent(n.path) === node.path));
      const group = node.external ? t("已打开的文件夹") : t("知识库内"), label = !internalOnly && group !== lastGroup ? group : ""; lastGroup = group;
      const shownFolder = demo.folder(folderLabel(node));
      return <React.Fragment key={node.path}>{label && <div className="folder-tree-group" role="presentation">{label}</div>}{editing?.node?.path === node.path ? input(folderParent(node.path), node) : <div role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? expanded : undefined} aria-selected={selected === node.path} tabIndex={focused === node.path ? 0 : -1} data-folder={node.path} title={demo.path(node.absolutePath || node.path)} style={{ "--tree-indent": `${Math.min(depth, 6) * 16 + Math.max(0, depth - 6) * 12}px` } as React.CSSProperties} className={`folder-tree-row${dropTarget === node.path ? " is-drop-target" : ""}${root ? " root" : ""}${selected === node.path ? " selected" : ""}${selected.startsWith(node.path + "/") ? " ancestor" : ""}${expanded ? " expanded" : ""}${node.unavailable ? " unavailable" : ""}${menu?.node.path === node.path ? " menu-open" : ""}`} onDragOver={event => {
        if (!node.unavailable && fileDrop?.accepts(event.dataTransfer, node.path)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setDropTarget(node.path); }
      }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(""); }} onDrop={event => {
        setDropTarget(""); if (!node.unavailable && fileDrop?.accepts(event.dataTransfer, node.path)) { event.preventDefault(); event.stopPropagation(); fileDrop.drop(event.dataTransfer, node.path); }
      }} onFocus={() => setFocused(node.path)} onClick={() => { if (!node.unavailable) { onSelect(node.path); if (hasChildren && !expanded) toggle(node.path); } }} onKeyDown={event => key(event, node)} onContextMenu={event => { if (internalOnly) return; event.preventDefault(); showMenu(node, { right: event.clientX, bottom: event.clientY }); }}>
        <button type="button" className="folder-tree-chevron" aria-label={tr(expanded ? "收起${name}" : "展开${name}", { name: shownFolder })} tabIndex={-1} style={{ visibility: hasChildren ? "visible" : "hidden" }} onClick={event => { event.stopPropagation(); toggle(node.path); }}><Icon name="down" size={12} /></button>
        <Icon name={node.unavailable ? "info" : "folder"} size={16} /><span className="folder-tree-name"><b>{shownFolder}</b>{root && <small>{node.unavailable ? tr("原文件夹不可用") : demo.path(node.absolutePath?.replace(/^\/Users\/[^/]+/, "~") || "")}</small>}</span>
        {node.unavailable ? <button className="folder-reconnect" type="button" disabled={busy} onClick={event => { event.stopPropagation(); void action(node, "reconnect"); }}>{tr("重新连接")}</button> : <>{counts && <small className={`folder-tree-count${counts.get(node.path) ? "" : " is-empty"}`}>{counts.get(node.path) || 0}</small>}{!internalOnly && <button type="button" className="folder-tree-more" aria-label={tr("更多文件夹操作：${p0}", { "p0": shownFolder })} aria-haspopup="menu" tabIndex={-1} onClick={event => { event.stopPropagation(); showMenu(node, event.currentTarget.getBoundingClientRect()); }}><Icon name="more" size={15} /></button>}</>}
      </div>}{expanded && input(node.path)}{expanded && !childrenLoaded && <div className="folder-tree-loading" role="status">{tr("正在读取…")}</div>}</React.Fragment>;
    })}
    {loaded.has("") && !internalOnly && nodes.length === 0 && <div className="folder-tree-empty"><Icon name="folder" size={25} /><b>{t("还没有打开文件夹")}</b><p>{t("打开磁盘上的一个文件夹，")}<br />{t("里面的多级目录会原样显示")}</p><button type="button" onClick={() => window.dispatchEvent(new Event("open-source-folder"))}>{t("打开文件夹…")}</button></div>}
  </div>{internalOnly && <button type="button" className="folder-picker-create" onClick={() => create(selected)}><Icon name="plus" size={14} />{t("新建文件夹")}</button>}
  {error && <p className="folder-tree-error" role="alert">{tr(error)}<button type="button" onClick={() => { setError(""); void load("", true); }}>{tr("重试")}</button></p>}
  {menu && createPortal(<div ref={menuRef} className="folder-tree-menu" role="menu" style={{ left: menu.x, top: menu.y }} onKeyDown={event => { const buttons = [...menuRef.current!.querySelectorAll<HTMLButtonElement>("button")]; const i = buttons.indexOf(document.activeElement as HTMLButtonElement); if (event.key === "Tab") { setMenu(undefined); return; } if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(i + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); } }}>
    <button type="button" role="menuitem" onClick={() => { create(menu.node.path); setMenu(undefined); }}>{tr("新建子文件夹")}</button>
    {!(menu.node.external && !folderParent(menu.node.path)) && <button type="button" role="menuitem" onClick={() => { setEditing({ parent: folderParent(menu.node.path), node: menu.node }); setName(menu.node.label || menu.node.path.split("/").at(-1)!); setMenu(undefined); }}>{tr("重命名")}</button>}
    <button type="button" role="menuitem" onClick={() => void action(menu.node, "reveal")}>{tr("在 Finder 中显示")}</button>
    {menu.node.external && !folderParent(menu.node.path) && <button type="button" role="menuitem" onClick={() => void action(menu.node, "reload")}>{tr("重新读取")}</button>}
    <hr />{menu.node.external && !folderParent(menu.node.path) ? <><button type="button" role="menuitem" className="danger" onClick={() => void action(menu.node, "remove")}>{tr("从列表移除")}</button><small>{tr("只移除入口，不会删除磁盘上的文件")}</small></> : <button type="button" role="menuitem" className="danger" onClick={() => void action(menu.node, "trash")}>{tr("移到废纸篓")}</button>}
  </div>, document.body)}</>;
}
