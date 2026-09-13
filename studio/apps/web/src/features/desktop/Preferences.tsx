import { SegmentedTabs } from "../../shared/SegmentedTabs";
import { useDesktopPreference } from "./preferences-store";
import { useState } from "react";
import { AiConfiguration, useAgentSelection } from "../collaboration/AgentSettings";
import { api } from "../../api";
import type { VaultInfo } from "@the-way-here/shared";
export function Preferences({ revision, vault, onCreate, onDelete, onSwitch }: { revision: number; vault?: VaultInfo; onCreate: () => void; onDelete: (value: VaultInfo["knowledgeBases"][number]) => void; onSwitch: (id: string) => void }) {
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") === "ai" ? "AI 助手" : "通用");
  const [notifications, setNotifications] = useState(localStorage.getItem("desktop.notifications") === "true");
  const [renaming, setRenaming] = useState("");
  const [newName, setNewName] = useState("");
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [hints, setHints] = useDesktopPreference("desktop.ai-hints");
  const [daily, setDaily] = useDesktopPreference("desktop.daily-opener");
  const agent = useAgentSelection(revision);
  async function renameSpace(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) { setStatus("请输入空间名称"); return; }
    setRenamingBusy(true); setStatus("");
    try { await api(`/api/vault/${encodeURIComponent(renaming)}`, {method:"PATCH", body:JSON.stringify({name:newName})}); setRenaming(""); setStatus("空间名称已保存"); }
    catch (error: any) { setStatus(error.message); } finally { setRenamingBusy(false); }
  }
  return <section className="desktop-preferences"><h1>偏好设置</h1><SegmentedTabs className="preferences-tabs" label="偏好设置分类" value={tab} options={["通用","AI 助手","知识库","高级"].map(value => ({value,label:value}))} onChange={setTab} />
    <div className="preferences-body" role="tabpanel" aria-label={tab}>
    {tab === "通用" ? <><h2>让这里成为你的日常</h2><p>{window.desktop ? "生活记录保留在本机。关闭主窗口后，仍可通过菜单栏随手记。" : "生活记录保存在本地服务所在的电脑上。"}</p><label className="preference-row"><span><b>新的理解与回信通知</b><small>有新话题或回信时提醒；首次打开不发送历史通知。</small></span><input type="checkbox" checked={notifications} onChange={(e) => { setNotifications(e.target.checked); localStorage.setItem("desktop.notifications", String(e.target.checked)); }} /></label><div className="preference-row"><span><b>常用快捷键</b><small>搜索 ⌘K · 随手记 ⌘N · 协作面板 ⌘⌥I · 独立窗口 ⌘↩</small></span></div></> : null}
    {tab === "AI 助手" ? <><label className="preference-row"><span><b>启用对话式整理提示</b><small>在 AI 协作中显示基于当前页面的建议问题。</small></span><input type="checkbox" checked={hints} onChange={event => setHints(event.target.checked)} /></label><label className="preference-row"><span><b>每日一条「此刻的话头」</b><small>每天在此刻页提供一个可以继续聊的问题。</small></span><input type="checkbox" checked={daily} onChange={event => setDaily(event.target.checked)} /></label><AiConfiguration id="desktop-agent" agent={agent} /></> : null}
    {tab === "知识库" ? <><h2>每一段来路，各有自己的空间</h2><p>记录、理解和任务按知识库隔离。</p>{vault?.knowledgeBases.map((item) => <div className="preference-row" key={item.id}><span><b>{item.name}</b><small>{item.id === vault.knowledgeBaseId ? "当前知识库" : item.id === "demo" ? "匿名演示" : "本机知识库"}</small></span><div><button onClick={() => { setRenaming(item.id); setNewName(item.name); setStatus(""); }}>重命名</button><button disabled={item.id === vault.knowledgeBaseId} onClick={() => onSwitch(item.id)}>打开</button>{item.id !== "demo" && (vault?.knowledgeBases.length || 0) > 1 ? <button className="danger-text" onClick={() => onDelete(item)}>删除</button> : null}</div></div>)}<button className="desktop-primary" onClick={onCreate}>新建知识库</button>{renaming ? <form className="rename-space-form" onSubmit={renameSpace}><label htmlFor="rename-space">空间名称</label><input id="rename-space" autoFocus value={newName} maxLength={40} disabled={renamingBusy} onFocus={event => event.currentTarget.select()} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if(event.key === "Escape" && !renamingBusy) setRenaming(""); }} /><button type="button" disabled={renamingBusy} onClick={() => setRenaming("")}>取消</button><button type="submit" disabled={renamingBusy}>{renamingBusy ? "正在保存…" : "保存名称"}</button></form> : null}<p role="status">{status}</p></> : null}
    {tab === "高级" ? <><h2>本机工作区</h2><p>记录和生成的 Wiki 保存在知识空间中，连接的原始资料仍在原来的位置。更新应用会保留这些数据。AI 的改动可在任务详情中查看。</p>{window.desktop ? <button onClick={() => void window.desktop?.revealWorkspace().catch((error) => setStatus(error.message))}>在访达中打开知识空间</button> : null}<button onClick={() => { setStatus("正在检查连接…"); api("/api/vault").then(() => setStatus("本地服务连接正常")).catch((e) => setStatus(e.message)); }}>检查服务连接</button><p role="status">{status}</p></> : null}
    </div></section>;
}
