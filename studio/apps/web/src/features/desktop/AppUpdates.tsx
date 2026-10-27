import { useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n';
import type { DesktopUpdateState } from './bridge';
import './app-updates.css';

function useUpdates() {
  const [state, setState] = useState<DesktopUpdateState>();
  const [actionError, setActionError] = useState(false);
  useEffect(() => {
    let active = true;
    const receive = (value: DesktopUpdateState) => { if (active) setState(value); };
    const unsubscribe = window.desktop?.onUpdateState?.(receive);
    void window.desktop?.getUpdateState?.().then(receive).catch(() => { if (active) setState({version:'?', status:'error'}); });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  async function check() {
    setActionError(false);
    setState(previous => previous ? { ...previous, status:'checking' } : previous);
    try { const value = await window.desktop?.checkForUpdates?.(); if (value) setState(value); }
    catch { setActionError(true); setState(previous => previous ? { ...previous, status:'error' } : previous); }
  }
  async function download() {
    setActionError(false);
    try { await window.desktop?.downloadUpdate?.(); } catch { setActionError(true); }
  }
  return { state, actionError, check, download };
}
export function AppUpdatePreferences() {
  const { t, locale } = useI18n();
  const { state, actionError, check, download } = useUpdates();
  if (!window.desktop?.getUpdateState || window.desktop.isMacAppStore || state?.status === 'disabled') return null;
  return <section className="preferences-group app-update-preferences" aria-labelledby="app-update-heading">
    <h2 id="app-update-heading">{t('应用更新')}</h2>
    <p>{t('启动时自动检查新版，由你决定何时下载。')}</p>
    <p>{t('当前版本 ${version}', { version:state?.version || '…' })}</p>
    <div role="status" aria-live="polite">
      {state?.status === 'checking' ? <p>{t('正在检查更新…')}</p> : null}
      {state?.status === 'current' ? <p>{t('当前已是最新版本')}</p> : null}
      {state?.status === 'available' ? <><p><strong>{t('发现新版本 ${version}', { version:state.latestVersion })}</strong>{state.size ? ` · ${Math.ceil(state.size / 1_000_000)} MB` : ''}</p><p className="app-update-notes">{state.notes?.[locale] || state.notes?.zh}</p></> : null}
      {state?.status === 'incompatible' ? <p>{t('新版需要 macOS ${version} 或更新版本', { version:state.minimumSystemVersion })}</p> : null}
      {state?.status === 'unsupported' ? <p>{t('暂时没有适合这台 Mac 的更新安装包。')}</p> : null}
      {state?.status === 'error' ? <p>{t('暂时无法检查更新，请稍后重试。')}</p> : null}
    </div>
    <div className="app-update-actions">
      {state?.status === 'available' ? <button className="primary-action" type="button" onClick={() => void download()}>{t('下载更新')}</button> : null}
      <button type="button" disabled={!state || state.status === 'checking'} onClick={() => void check()}>{t('检查更新')}</button>
    </div>
    {actionError ? <p role="alert">{t('未能完成操作，请检查网络后重试。')}</p> : null}
    <p className="app-update-hint">{t('点击后将在浏览器下载安装包。退出应用后替换安装，已有资料保留。')}</p>
  </section>;
}
export function AppUpdateBanner() {
  const { t, locale } = useI18n();
  const { state, actionError, download } = useUpdates();
  const [dismissed, setDismissed] = useState('');
  if (state?.status !== 'available' || dismissed === state.latestVersion) return null;
  return <aside className="app-update-banner" aria-label={t('应用更新')}>
    <div><p role="status"><strong>{t('发现新版本 ${version}', { version:state.latestVersion })}</strong></p>
      <details><summary>{t('更新说明')}</summary><p className="app-update-notes">{state.notes?.[locale] || state.notes?.zh || t('可以下载新版本了。')}</p><p>{t('点击后将在浏览器下载安装包。退出应用后替换安装，已有资料保留。')}</p></details>
      {actionError ? <p role="alert">{t('未能完成操作，请检查网络后重试。')}</p> : null}
    </div>
    <div className="app-update-actions"><button className="primary-action" type="button" onClick={() => void download()}>{t('下载更新')}</button><button type="button" onClick={() => setDismissed(state.latestVersion || '')}>{t('稍后')}</button></div>
  </aside>;
}
