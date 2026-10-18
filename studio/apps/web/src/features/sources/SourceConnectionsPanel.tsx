import { useEffect, useRef, useState } from "react";
import type { SourceConnection, VaultInfo } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import "./source-connections.css";

export function SourceConnectionsPanel({ onOpened }: { onOpened?: (folder?: string) => void }) {
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open(droppedPath?: string) {
    if (!vault || busy) return;
    setBusy(true); setError("");
    try {
      const selected = droppedPath || (window.desktop ? await window.desktop.chooseSourceDirectory() : window.prompt("输入文件夹完整路径")?.trim());
      if (!selected) return;
      if ((!window.desktop || droppedPath) && !window.confirm(`允许 AI 修改此文件夹及子文件夹中的内容？\n${selected}`)) return;
      const connected = await api<SourceConnection[]>("/api/source-connections", { method: "POST", body: JSON.stringify({ knowledgeBaseId: vault.knowledgeBaseId, path: selected, autoBuild: true, aiWritable: true }) });
      const added = connected.find(item => item.path === selected) || connected.at(-1); onOpened?.(added ? `外部来源/${added.id}` : undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  const openRef = useRef(open); openRef.current = open;
  const [dragName, setDragName] = useState("");
  useEffect(() => {
    const launch = () => void openRef.current();
    const isDirectory = (transfer: DataTransfer | null) => [...(transfer?.items || [])].some(item => item.webkitGetAsEntry()?.isDirectory);
    const over = (event: DragEvent) => { if (!isDirectory(event.dataTransfer) || document.querySelector('[role="dialog"]')) return; event.preventDefault(); setDragName([...(event.dataTransfer?.items || [])].map(item => item.webkitGetAsEntry()).find(entry => entry?.isDirectory)?.name || "文件夹"); };
    const leave = (event: DragEvent) => { if (!event.relatedTarget) setDragName(""); };
    const drop = (event: DragEvent) => { if (!isDirectory(event.dataTransfer) || document.querySelector('[role="dialog"]')) return; event.preventDefault(); setDragName(""); const file = event.dataTransfer?.files[0]; const path = file && window.desktop?.pathForDroppedFile?.(file); if (path) void openRef.current(path); else { setError("请点击“打开文件夹”选择这个目录。"); launch(); } };
    window.addEventListener("open-source-folder", launch); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("open-source-folder", launch); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, []);
  return <div className="source-connections">{dragName && <div className="source-directory-drop" role="status"><Icon name="folder" size={30} /><b>松开以打开「{dragName}」</b><span>将作为新的根文件夹加入列表</span></div>}
    <button type="button" disabled={busy || !vault} onClick={() => void open()}><Icon name="folder" size={16} />打开文件夹…</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
