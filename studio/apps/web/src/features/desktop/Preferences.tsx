import { Icon } from "../../shared/ui";
import { useState } from "react";
import { SegmentedTabs } from "../../shared/SegmentedTabs";
import { useI18n, type AppLocale } from "../../shared/i18n";
import { useDesktopPreference } from "./preferences-store";
import { AiConfiguration, useAgentSelection } from "../collaboration/AgentSettings";
import "./preferences.css";
import { AppUpdatePreferences } from "./AppUpdates";
import { StoragePreferences } from "./StoragePreferences";
import { PreferenceHeading } from "./PreferenceHeading";

const shortcutKeys = [
  ["搜索与命令", "⌘ K"], ["随手记", "⌘ N"],
  ["打开或收起 AI 对话", "⌘ ⌥ I"], ["独立窗口", "⌘ ↩"],
] as const;
const localeOptions = [{ value: "zh" as const, label: "中文" }, { value: "en" as const, label: "English" }];

export function Preferences({ revision }: { revision: number }) {
  const { t, locale, setLocale } = useI18n();
  const tabs = [{ value: "general" as const, label: t("通用") }, { value: "ai" as const, label: t("AI 助手") }];
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get("tab") === "ai" ? "ai" : "general");
  const [notifications, setNotifications] = useDesktopPreference("desktop.notifications", true);
  const agent = useAgentSelection(revision);
  return <section className="desktop-preferences">
    <header className="preferences-heading"><h1>{t("偏好设置")}</h1><p>{t("调整提醒方式和 AI 助手，让这里更合你的习惯。")}</p></header>
    <SegmentedTabs className="preferences-tabs" label={t("偏好设置分类")} value={tab} options={tabs} onChange={setTab} />
    <div className="preferences-body" role="tabpanel" aria-label={tab === "ai" ? t("AI 助手") : t("通用")}>
      {tab === "general" ? <>
        <section className="preferences-group" aria-labelledby="language-heading">
          <PreferenceHeading kind="language" id="language-heading" title={t("语言")} description={t("界面和演示库的显示语言。你自己的知识库内容不会被翻译。")} />
          <div className="preference-row preference-locale-row">
            <span><b>{t("语言")}</b></span>
            <SegmentedTabs label={t("语言")} value={locale} options={localeOptions.map((option) => ({ ...option, label: option.value === "zh" ? t("中文") : option.label }))} onChange={(next: AppLocale) => setLocale(next)} />
          </div>
        </section>
        <section className="preferences-group" aria-labelledby="notification-heading">
          <PreferenceHeading kind="notification" id="notification-heading" title={t("通知")} description={t("选择什么时候收到提醒。")} />
          <label className="preference-row"><span><b>{t("Agent 任务完成提醒")}</b><small>{t("任务完成或失败、且应用不在前台时提醒；通知会标明来源模块。")}</small></span><input type="checkbox" role="switch" checked={notifications} onChange={event => setNotifications(event.target.checked)} /></label>
        </section>
        <section className="preferences-group" aria-labelledby="shortcuts-heading">
          <PreferenceHeading kind="keyboard" id="shortcuts-heading" title={t("键盘快捷键")} description={t("常用操作，随时触达。")} />
          <dl className="preferences-shortcuts">{shortcutKeys.map(([label, keys]) => <div key={label}><dt>{t(label)}</dt><dd><kbd>{keys}</kbd></dd></div>)}</dl>
        </section>
        <AppUpdatePreferences />
        <StoragePreferences />
        <p className="preferences-footnote"><Icon name="info" size={15} /><span>{window.desktop ? t("生活记录保存在你自己的知识库里，存放位置由你决定。关闭主窗口后，仍可通过菜单栏随手记。") : t("生活记录保存在本地服务所在的电脑上。")} <a href="/privacy" target="_blank" rel="noreferrer">{t("隐私与数据使用")}</a></span></p>
      </> : <section className="preferences-ai" aria-labelledby="ai-heading">
        <AiConfiguration id="desktop-agent" agent={agent} heading={<PreferenceHeading kind="ai" id="ai-heading" title={t("模型与连接")} description={t("选择 AI 服务与思考深度，修改会自动保存并应用到所有 AI 对话。")} />} />
      </section>}
    </div>
  </section>;
}
