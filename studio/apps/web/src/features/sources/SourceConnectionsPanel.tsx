import { useEffect, useState } from "react";
import type { SourceConnection, VaultInfo } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { TextInput } from "../../shared/form-controls";
import "./source-connections.css";

type ConnectionInfo = SourceConnection & { fileCount: number; pendingCount: number; runId?: string; error?: string; scannedAt?: string };
export function SourceConnectionsPanel({ compact = false }: { compact?: boolean }) {
  const [revision, setRevision] = useState(0);
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  const { data: connections, error: loadError } = useApi<ConnectionInfo[]>("/api/source-connections", revision);
  const [directory, setDirectory] = useState("");
  const [autoBuild, setAutoBuild] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disconnecting, setDisconnecting] = useState<string>();
  useEffect(() => { const timer = window.setInterval(() => setRevision((value) => value + 1), 5000); return () => window.clearInterval(timer); }, []);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); setRevision((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function connect() {
    let selected = directory.trim();
    if (window.desktop) selected = await window.desktop.chooseSourceDirectory() || "";
    if (!selected) return;
    await perform(() => api("/api/source-connections", { method: "POST", body: JSON.stringify({ knowledgeBaseId: vault?.knowledgeBaseId, path: selected, autoBuild }) }));
  }
  const content = <div className="source-connections">
    <p>原文件留在原目录，改动后自动同步。Wiki 保存在应用管理目录；这里只保存来源引用，不复制正文。</p>
    {!window.desktop ? <label>本机原目录<TextInput value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder="输入本地服务所在电脑的目录绝对路径" /></label> : null}
    <div className="source-connection-add"><button type="button" disabled={busy || !vault || (!window.desktop && !directory.trim())} onClick={() => void connect()}>连接原始目录</button><label><input type="checkbox" checked={autoBuild} onChange={(event) => setAutoBuild(event.target.checked)} />变化后自动更新 Wiki</label></div>
    <small>支持 Markdown、TXT，保留子目录。自动更新使用已配置的 AI；可随时关闭。照片、账单和聊天导出包仍可单独导入。</small>
    {error || loadError ? <p role="alert">{error || loadError}</p> : null}
    {connections?.map((connection) => <article key={connection.id}>
      <strong>{connection.name}</strong><p className="source-connection-path">{connection.path}</p>
      <span role="status">{connection.fileCount} 份记录 · {connection.runId ? "正在更新 Wiki" : connection.pendingCount ? `${connection.pendingCount} 份待更新` : "已同步"}</span>
      {connection.error ? <p role="alert">{connection.error}</p> : null}
      <div className="source-connection-actions">
        <label><input type="checkbox" checked={connection.autoBuild} disabled={busy} onChange={(event) => void perform(() => api(`/api/source-connections/${connection.id}`, { method: "PATCH", body: JSON.stringify({ knowledgeBaseId: vault?.knowledgeBaseId, autoBuild: event.target.checked }) }))} />自动更新 Wiki</label>
        <button type="button" disabled={busy || Boolean(connection.runId)} onClick={() => void perform(() => api(`/api/source-connections/${connection.id}/sync`, { method: "POST", body: JSON.stringify({ knowledgeBaseId: vault?.knowledgeBaseId }) }))}>更新 Wiki</button>
        <button type="button" disabled={busy || Boolean(connection.runId)} onClick={() => setDisconnecting(connection.id)}>断开连接</button>
      </div>
      {disconnecting === connection.id ? <div className="source-connection-confirm"><p>断开后停止同步，原文件和已生成的 Wiki 都会保留。</p><button type="button" disabled={busy} onClick={() => void perform(async () => { await api(`/api/source-connections/${connection.id}`, { method: "DELETE", body: JSON.stringify({ knowledgeBaseId: vault?.knowledgeBaseId }) }); setDisconnecting(undefined); })}>确认断开</button><button type="button" onClick={() => setDisconnecting(undefined)}>取消</button></div> : null}
    </article>)}
  </div>;
  return compact ? <details className="source-connections-disclosure"><summary>原目录连接{connections?.length ? ` · ${connections.length}` : ""}</summary>{content}</details> : content;
}
