import { MobileKeySharingPreferences } from "./MobileKeySharingPreferences";
import { useState } from "react";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { useI18n } from "../../shared/i18n";
import type { MobileManifest, AgentGlobalSettings, AgentProviderPreset } from "@the-way-here/shared";

export function IndependentMobileCopyAction({ busy, onPrepare }: { busy: boolean; onPrepare: () => void }) {
  const { t } = useI18n();
  return <div>
    <p>{t("新副本使用新的空间标识。旧空间及原待处理任务保留；旧任务不会复制或自动重放。")}</p>
    <button disabled={busy} onClick={onPrepare}>{t("创建独立的 iCloud 副本…")}</button>
  </div>;
}

export function MobileSyncPreferences() {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const { data, error } = useApi<{ manifest?: MobileManifest; lifecycle?:{status:string;requestId?:string;expiresAt?:string}; protocolVersion: number }>("/api/mobile-sync", revision);
  const {data: agentSettings} = useApi<AgentGlobalSettings>("/api/agent-settings",revision);
  const {data: allPresets} = useApi<AgentProviderPreset[]>("/api/agent-provider-presets");
  const [sharingProvider,setSharingProvider] = useState("");
  const mobilePresets = (allPresets || []).filter(provider=>["deepseek","zhipu","qwen","kimi","openai"].includes(provider.id));
  const selectedProvider = sharingProvider || (mobilePresets.some(p=>p.id===agentSettings?.thirdParty.providerId) ? agentSettings?.thirdParty.providerId : mobilePresets[0]?.id);
  const [confirmationName,setConfirmationName] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await action(); setRevision(value => value + 1); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("操作未完成，请重试。")); }
    finally { setBusy(false); }
  }
  return <section className="preferences-group" aria-labelledby="mobile-sync-heading">
    <header className="preferences-group-heading"><div><h2 id="mobile-sync-heading">{t("iPhone 与 iCloud")}</h2><p>{t("手机采集与回看，Mac 继续负责构建、回信和预测。")}</p></div></header>
    {data?.manifest ? <>
      <p>{t("此空间已使用手机文件协议。请确认两台设备打开的是同一份 iCloud 空间。")}</p>
      {data.lifecycle?.status === "requested" && <div role="status"><p>{t("手机申请删除这个空间。确认后会在两端隐藏，30 天内可恢复。")}</p><label>{t("输入空间名称确认")}<input value={confirmationName} onChange={event=>setConfirmationName(event.target.value)} /></label><button disabled={busy || confirmationName !== data.manifest.name} onClick={()=>void perform(async()=>{await api("/api/mobile-sync/space",{method:"POST",body:JSON.stringify({action:"delete",requestId:data.lifecycle!.requestId,confirmationName,knowledgeBaseId:data.manifest!.knowledgeBaseId,confirmed:true})});setConfirmationName("");})}>{t("确认移到最近删除")}</button><button disabled={busy} onClick={()=>void perform(()=>api("/api/mobile-sync/space",{method:"POST",body:JSON.stringify({action:"cancel",requestId:data.lifecycle!.requestId,confirmationName:data.manifest!.name,knowledgeBaseId:data.manifest!.knowledgeBaseId,confirmed:true})}))}>{t("撤销删除申请")}</button></div>}
      {data.lifecycle?.status === "deleted" && <div role="status"><p>{t("此空间已在两端移到最近删除，期限内可恢复。")}</p><time>{data.lifecycle.expiresAt}</time><button disabled={busy} onClick={()=>void perform(()=>api("/api/mobile-sync/space",{method:"POST",body:JSON.stringify({action:"restore",requestId:data.lifecycle!.requestId,confirmationName:data.manifest!.name,knowledgeBaseId:data.manifest!.knowledgeBaseId,confirmed:true})}))}>{t("恢复共享空间")}</button></div>}
      {data.lifecycle?.status === "purged" && <p role="status">{t("此空间已超过恢复期限，内容已清理。")}</p>}

      <button disabled={busy || data.manifest.readOnly || ["deleted","purged"].includes(data.lifecycle?.status || "")} onClick={() => void perform(async () => { await api("/api/mobile-sync/enable", { method: "POST", body: JSON.stringify({ knowledgeBaseId: data.manifest!.knowledgeBaseId, confirmed: true }) }); setMessage(t("已启用手机任务处理；任务会保留提交时的知识库。")); })}>{t("让这台 Mac 处理手机任务")}</button>
      {window.desktop?.prepareMobileWorkspace && !data.manifest.readOnly && !["deleted", "purged"].includes(data.lifecycle?.status || "") && <IndependentMobileCopyAction busy={busy} onPrepare={() => void perform(() => window.desktop!.prepareMobileWorkspace!())} />}
    </> : <>
      <p>{t("现有空间不会自动上传。确认后只复制当前知识库与共享引擎；其他知识库、外部文件夹、密钥、缓存和历史草稿不复制，原空间保留。")}</p>
      {window.desktop?.prepareMobileWorkspace ? <button disabled={busy} onClick={() => void perform(() => window.desktop!.prepareMobileWorkspace!())}>{t("为 iPhone 准备 iCloud 空间…")}</button> : <p>{t("请在 Mac 客户端选择 iCloud 位置。浏览器不会替你迁移文件。")}</p>}
    </>}
    {window.desktop && selectedProvider && <div><label>{t("共享密钥厂商")}<select value={selectedProvider} onChange={event=>setSharingProvider(event.target.value)}>{mobilePresets.map(provider=><option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label><MobileKeySharingPreferences providerId={selectedProvider} /></div>}
    {(message || error) && <p role="status">{message || error}</p>}
    {window.desktop?.openMobileWorkspace && <button disabled={busy} onClick={() => void perform(() => window.desktop!.openMobileWorkspace!())}>{t("打开 iPhone 已创建的共享空间…")}</button>}
  </section>;
}
