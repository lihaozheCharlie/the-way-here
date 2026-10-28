import { useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n';
import { Icon } from '../../shared/ui';
import type { DesktopUpdateState } from './bridge';
import './app-updates.css';

function useUpdates() {
  const [state, setState] = useState<DesktopUpdateState>();
  const [actionError, setActionError] = useState(false);
  useEffect(() => {
    let active = true;
    let received = false;
    const receive = (value: DesktopUpdateState) => { received = true; if (active) { setState(value); setActionError(false); } };
    const unsubscribe = window.desktop?.onUpdateState?.(receive);
    void window.desktop?.getUpdateState?.().then(value => { if (!received) receive(value); }).catch(() => { if (active && !received) setState({version:'?', status:'error'}); });
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
    try { if (state && ['ready','installing','install-error'].includes(state.status)) await window.desktop?.installUpdate?.(); else await window.desktop?.downloadUpdate?.(); } catch { setActionError(true); }
  }
  return { state, actionError, check, download };
}
export function AppUpdatePreferences() {
  const { t, locale } = useI18n();
  const { state, actionError, check, download } = useUpdates();
  if (!window.desktop?.getUpdateState || window.desktop.isMacAppStore || state?.status === 'disabled') return null;
  return <section className="preferences-group app-update-preferences" aria-labelledby="app-update-heading">
    <h2 id="app-update-heading">{t('应用更新')}</h2>
    <p>{t('自动检查新版，下载完成后自动重启安装。')}</p>
    <p>{t('当前版本 ${version}', { version:state?.version || '…' })}</p>
    <div role="status" aria-live="polite">
      {state?.status === 'checking' ? <p>{t('正在检查更新…')}</p> : null}
      {state?.status === 'current' ? <p>{t('当前已是最新版本')}</p> : null}
      {state && ['available','downloading','ready','installing','download-error','install-error'].includes(state.status) ? <><p><strong>{t('发现新版本 ${version}', { version:state.latestVersion })}</strong>{state.size ? ` · ${Math.ceil(state.size / 1_000_000)} MB` : ''}</p><p className="app-update-notes">{state.notes?.[locale] || state.notes?.zh}</p></> : null}
      {state?.status === 'incompatible' ? <p>{t('新版需要 macOS ${version} 或更新版本', { version:state.minimumSystemVersion })}</p> : null}
      {state?.status === 'unsupported' ? <p>{t('暂时没有适合这台 Mac 的更新安装包。')}</p> : null}
      {state && ['downloading','ready','installing','download-error','install-error'].includes(state.status) ? <p>{updateLabel(state, t)}</p> : null}
      {state?.status === 'error' ? <p>{t('暂时无法检查更新，请稍后重试。')}</p> : null}
    </div>
    <div className="app-update-actions">
      {state && ['available','download-error','install-error'].includes(state.status) ? <button className="primary-action" type="button" onClick={() => void download()}>{updateLabel(state, t)}</button> : null}
      <button type="button" disabled={!state || ['checking','downloading','ready','installing'].includes(state.status)} onClick={() => void check()}>{t('检查更新')}</button>
    </div>
    {actionError ? <p role="alert">{t('未能完成操作，请检查网络后重试。')}</p> : null}
    <p className="app-update-hint">{t('下载后自动重启安装；录音、保存或任务进行中时，会等待完成。')}</p>
  </section>;
}
function updateLabel(state: DesktopUpdateState, t: ReturnType<typeof useI18n>['t']) {
  if (state.status === 'downloading') return t('下载中 ${percent}%', {percent:Math.floor(state.progress || 0)});
  if (state.status === 'ready') return t('已下载，等待空闲安装');
  if (state.status === 'installing') return t('正在安装…');
  if (state.status === 'download-error') return t('重试下载');
  if (state.status === 'install-error') return t('重试安装');
  return t('下载更新');
}
export function AppUpdateSidebar() {
  const { t } = useI18n();
  const { state, actionError, download } = useUpdates();
  if (!state || window.desktop?.isMacAppStore || !['available','downloading','ready','installing','download-error','install-error'].includes(state.status)) return null;
  const busy = !actionError && ['downloading','ready','installing'].includes(state.status);
  const label = actionError ? t(['ready','installing','install-error'].includes(state.status) ? '重试安装' : '重试下载') : updateLabel(state,t);
  const retry = actionError || ['download-error','install-error'].includes(state.status);
  const icon = retry || state.status === 'installing' ? 'refresh' : state.status === 'ready' ? 'check' : 'cloud-download';
  const hint = state.status === 'available' ? t('下载完成后将自动重启并安装更新。') : state.status === 'ready' ? t('下载后自动重启安装；录音、保存或任务进行中时，会等待完成。') : updateLabel(state,t);
  return <span className="sidebar-update">
    <button className="sidebar-update-button" type="button" disabled={busy} onClick={() => void download()} title={actionError ? t('更新失败，请点击重试。') : state.status === 'available' ? `${label}\n${hint}` : hint} aria-label={label} aria-busy={busy}>
      {state.status === 'downloading' && !actionError
        ? <span className="sidebar-update-progress" aria-hidden="true">{Math.floor(state.progress || 0)}%</span>
        : <Icon name={icon} size={22} />}
    </button>
    <span className="sr-only" role={actionError ? 'alert' : 'status'}>{actionError ? t('更新失败，请点击重试。') : hint}</span>
  </span>;
}
