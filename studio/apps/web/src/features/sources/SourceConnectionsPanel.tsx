import { useState } from "react";
import type { SourceConnection, VaultInfo } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { TextInput } from "../../shared/form-controls";
import "./source-connections.css";

type Directory = SourceConnection & { error?: string };
export function SourceConnectionsPanel({ compact = false, onOpened }: { compact?: boolean; onOpened?: () => void }) {
  const [revision, setRevision] = useState(0);
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  const { data: directories } = useApi<Directory[]>("/api/source-connections", revision);
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    if (!vault || busy) return;
    setBusy(true); setError("");
    try {
      const selected = window.desktop ? await window.desktop.chooseSourceDirectory() : directory.trim();
      if (!selected) return;
      if (!window.desktop && !window.confirm(`允许 AI 修改此文件夹及子文件夹中的内容？\n${selected}`)) return;
      await api("/api/source-connections", { method: "POST", body: JSON.stringify({ knowledgeBaseId: vault.knowledgeBaseId, path: selected, autoBuild: true, aiWritable: true }) });
      setRevision(value => value + 1); onOpened?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError("");
    try {
      await api(`/api/source-connections/${id}`, { method: "DELETE", body: JSON.stringify({ knowledgeBaseId: vault?.knowledgeBaseId }) });
      setRevision(value => value + 1); onOpened?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <div className="source-connections">
    {!compact && <p>直接读取和修改原文件，支持多级文件夹。</p>}
    {!window.desktop && <label>文件夹路径<TextInput value={directory} onChange={event => setDirectory(event.target.value)} placeholder="本地服务所在电脑上的绝对路径" /></label>}
    <button type="button" disabled={busy || !vault || (!window.desktop && !directory.trim())} onClick={() => void open()}>打开文件夹</button>
    {error && <p role="alert">{error}</p>}
    {!compact && directories?.map(item => <article key={item.id}><strong>{item.name}</strong><p className="source-connection-path">{item.path}</p>{item.error && <p role="alert">{item.error}</p>}<button type="button" disabled={busy} onClick={() => void remove(item.id)}>从列表移除</button></article>)}
  </div>;
}
