import { Icon } from "../../shared/ui";
import { useState } from "react";
import { SegmentedTabs } from "../../shared/SegmentedTabs";
import { useDesktopPreference } from "./preferences-store";
import { AiConfiguration, useAgentSelection } from "../collaboration/AgentSettings";
import "./preferences.css";

const tabs = [{ value: "general", label: "通用" }, { value: "ai", label: "AI 助手" }] as const;
const shortcuts = [
  ["搜索与命令", "⌘ K"], ["随手记", "⌘ N"],
  ["打开或收起 AI 对话", "⌘ ⌥ I"], ["独立窗口", "⌘ ↩"],
];

export function Preferences({ revision }: { revision: number }) {
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") === "ai" ? "ai" : "general");
  const [notifications, setNotifications] = useDesktopPreference("desktop.notifications", false);
  const agent = useAgentSelection(revision);
  return <section className="desktop-preferences">
    <header className="preferences-heading"><h1>偏好设置</h1><p>调整提醒方式和 AI 助手，让这里更合你的习惯。</p></header>
    <SegmentedTabs className="preferences-tabs" label="偏好设置分类" value={tab} options={tabs} onChange={setTab} />
    <div className="preferences-body" role="tabpanel" aria-label={tab === "ai" ? "AI 助手" : "通用"}>
      {tab === "general" ? <>
        <section className="preferences-group" aria-labelledby="notification-heading">
          <PreferenceHeading kind="notification" id="notification-heading" title="通知" description="选择什么时候收到提醒。" />
          <label className="preference-row"><span><b>新的理解与回信</b><small>有新话题或回信时提醒，首次打开不会推送历史通知。</small></span><input type="checkbox" role="switch" checked={notifications} onChange={event => setNotifications(event.target.checked)} /></label>
        </section>
        <section className="preferences-group" aria-labelledby="shortcuts-heading">
          <PreferenceHeading kind="keyboard" id="shortcuts-heading" title="键盘快捷键" description="常用操作，随时触达。" />
          <dl className="preferences-shortcuts">{shortcuts.map(([label, keys]) => <div key={label}><dt>{label}</dt><dd><kbd>{keys}</kbd></dd></div>)}</dl>
        </section>
        <p className="preferences-footnote"><Icon name="info" size={15} /><span>{window.desktop ? "生活记录保留在本机。关闭主窗口后，仍可通过菜单栏随手记。" : "生活记录保存在本地服务所在的电脑上。"}</span></p>
      </> : <section className="preferences-ai" aria-labelledby="ai-heading">
        <AiConfiguration id="desktop-agent" agent={agent} heading={<PreferenceHeading kind="ai" id="ai-heading" title="模型与连接" description="选择 AI 服务与思考深度，应用后对所有 AI 对话生效。" />} />
      </section>}
    </div>
  </section>;
}

function PreferenceHeading({ kind, id, title, description }: { kind: "notification" | "keyboard" | "ai"; id: string; title: string; description: string }) {
  return <header className="preferences-group-heading"><span className="preferences-group-icon" aria-hidden="true">
    {kind === "ai" ? <Icon name="spark" size={15} /> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === "notification" ? <><path d="M18 8a6 6 0 0 0-12 0c0 3-1 5-2 6h16c-1-1-2-3-2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></> : <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M7 15h4" /></>}
    </svg>}
  </span><div><h2 id={id}>{title}</h2><p>{description}</p></div></header>;
}
