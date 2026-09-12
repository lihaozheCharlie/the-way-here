import { useState } from "react";
import { AiConfiguration, useAgentSelection } from "../collaboration/AgentSettings";
import { api } from "../../api";
import type { VaultInfo } from "@the-way-here/shared";
export function Preferences({ revision, vault, onCreate, onDelete, onSwitch }: { revision: number; vault?: VaultInfo; onCreate: () => void; onDelete: (value: VaultInfo["knowledgeBases"][number]) => void; onSwitch: (id: string) => void }) {
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") === "ai" ? "AI 助手" : "通用");
  const [notifications, setNotifications] = useState(localStorage.getItem("desktop.notifications") === "true");
  const [status, setStatus] = useState("");
  const agent = useAgentSelection(revision);
  return <section className="desktop-preferences"><h1>偏好设置</h1><div className="preferences-tabs" role="tablist" aria-label="偏好设置分类">{["通用", "AI 助手", "知识库", "高级"].map((name) => <button role="tab" aria-selected={name === tab} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="preferences-body" role="tabpanel" aria-label={tab}>
    {tab === "通用" ? <><h2>让这里成为你的日常</h2><p>{window.desktop ? "生活记录保留在本机。关闭主窗口后，仍可通过菜单栏随手记。" : "生活记录保存在本地服务所在的电脑上。"}</p><label className="preference-row"><span><b>新的理解与回信通知</b><small>有新话题或回信时提醒；首次打开不发送历史通知。</small></span><input type="checkbox" checked={notifications} onChange={(e) => { setNotifications(e.target.checked); localStorage.setItem("desktop.notifications", String(e.target.checked)); }} /></label><div className="preference-row"><span><b>常用快捷键</b><small>搜索 ⌘K · 随手记 ⌘N · 协作面板 ⌘⌥I · 独立窗口 ⌘↩</small></span></div></> : null}
    {tab === "AI 助手" ? <AiConfiguration id="desktop-agent" agent={agent} /> : null}
    {tab === "知识库" ? <><h2>每一段来路，各有自己的空间</h2><p>记录、理解和任务按知识库隔离。</p>{vault?.knowledgeBases.map((item) => <div className="preference-row" key={item.id}><span><b>{item.name}</b><small>{item.id === vault.knowledgeBaseId ? "当前知识库" : item.id === "demo" ? "匿名演示" : "本机知识库"}</small></span><div><button disabled={item.id === vault.knowledgeBaseId} onClick={() => onSwitch(item.id)}>打开</button>{item.id !== "demo" && (vault?.knowledgeBases.length || 0) > 1 ? <button className="danger-text" onClick={() => onDelete(item)}>删除</button> : null}</div></div>)}<button className="desktop-primary" onClick={onCreate}>新建知识库</button></> : null}
    {tab === "高级" ? <><h2>本机工作区</h2><p>记录和生成的 Wiki 保存在知识空间中，连接的原始资料仍在原来的位置。更新应用会保留这些数据。AI 的改动可在任务详情中查看。</p>{window.desktop ? <button onClick={() => void window.desktop?.revealWorkspace().catch((error) => setStatus(error.message))}>在访达中打开知识空间</button> : null}<button onClick={() => { setStatus("正在检查连接…"); api("/api/vault").then(() => setStatus("本地服务连接正常")).catch((e) => setStatus(e.message)); }}>检查服务连接</button><p role="status">{status}</p></> : null}
    </div></section>;
}
