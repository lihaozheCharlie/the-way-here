import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n';
type Status = { available: boolean; reason?: string; source: 'local'|'shared'; localConfigured: boolean; sharedConfigured: boolean; suffix?: string };
/** This component never receives, renders or transmits an API key. */
export function MobileKeySharingPreferences({ providerId }: {providerId: string}) {
  const {t,locale}=useI18n();
  const [status,setStatus]=useState<Status>();const [busy,setBusy]=useState(false);const [error,setError]=useState(false);
  const currentProvider=useRef(providerId);currentProvider.current=providerId;
  const endpoint='/api/mobile-keys/'+encodeURIComponent(providerId);
  useEffect(()=>{let current=true;setStatus(undefined);setError(false);void fetch(endpoint).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(value=>{if(current)setStatus(value);}).catch(()=>{if(current)setError(true);});return()=>{current=false;};},[endpoint]);
  async function act(action:'publish'|'pull'|'remove'|'local') {
    const descriptions={publish:t("将现有本机密钥发布到 iCloud 钥匙串，并让这台 Mac 使用共享密钥？手机将能读取；原加密备份保留。"),pull:t("改用 iCloud 钥匙串？手机删除它后 Mac 将停止调用，不自动退回本机备份。"),remove:t("移除共享密钥？使用共享来源的设备将停止调用。原本机加密备份保留。"),local:t("明确停止使用共享来源，恢复这台 Mac 的原本机密钥？不删除共享钥匙串。")};
    if(!window.confirm(descriptions[action]))return;const selected=providerId;setBusy(true);setError(false);
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});if(!response.ok)throw new Error();const value=await response.json();if(currentProvider.current===selected)setStatus(value);}catch{if(currentProvider.current===selected)setError(true);}finally{setBusy(false);}
  }
  return <section aria-label={t("iPhone 与 iCloud 共享密钥")}><h3>{t("iPhone 与 iCloud 钥匙串")}</h3><p>{t("仅在你点击下方操作后共享。密钥不会进入空间或页面，本机旧加密备份保留。")}</p>{!status?<p role="status">{t("正在检查签名能力…")}</p>:<><p>{t("当前来源：")}{status.source==='shared'?t("iCloud 共享钥匙串"):t("本机加密设置")}{status.suffix?t(" · 共享尾号 ")+status.suffix:''}</p>{!status.available&&<p role="status">{locale==='en'?t('此安装包没有共享钥匙串能力，需匹配的签名与描述文件，本机密钥保留。'):status.reason||t('此安装包没有共享钥匙串能力，需匹配的签名与描述文件，本机密钥保留。')}</p>}<div><button disabled={busy||!status.available||!status.localConfigured} onClick={()=>void act('publish')}>{t("发布本机密钥")}</button><button disabled={busy||!status.available||!status.sharedConfigured} onClick={()=>void act('pull')}>{t("使用共享密钥")}</button><button disabled={busy||!status.available||!status.sharedConfigured} onClick={()=>void act('remove')}>{t("移除共享密钥")}</button><button disabled={busy||status.source!=='shared'} onClick={()=>void act('local')}>{t("明确改回本机密钥")}</button></div>{status.source==='shared'&&!status.sharedConfigured&&<p>{t("共享密钥已移除或不可用。Mac 不会自动使用旧备份，需你明确改回本机。")}</p>}</>}{error&&<p role="alert">{t("共享操作未完成。请检查安装包签名能力、系统钥匙串与连接；本机加密备份保留。")}</p>}</section>;
}
