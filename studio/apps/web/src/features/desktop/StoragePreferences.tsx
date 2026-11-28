import { useState } from 'react';
import { useApi } from '../../shared/use-api';
import { useI18n } from '../../shared/i18n';
import { PreferenceHeading } from './PreferenceHeading';
import './storage-preferences.css';

type Translate = ReturnType<typeof useI18n>['t'];

interface StorageSize { exists: boolean; sizeBytes: number; fileCount: number; approximate: boolean; }
interface StoragePlace { path: string; displayPath: string; size: StorageSize; }
interface ContentIssues { conflictFiles: number; iCloudPlaceholders: number; }
interface StorageOverview {
  version: number;
  knowledgeBaseId: string;
  knowledgeBase: StoragePlace & { id: string; name: string; issues: ContentIssues };
  state: StoragePlace;
  cache: StoragePlace;
}

/** Finder-like decimal units, so the numbers match what the user sees in Finder. */
function formatSize(size: StorageSize, t: Translate): string {
  if (!size.exists) return t('暂无内容');
  const bytes = size.sizeBytes;
  const readable = bytes < 1_000 ? `${bytes} B`
    : bytes < 1_000_000 ? `${Math.round(bytes / 1_000)} KB`
    : bytes < 1_000_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  return size.approximate ? `${t('约')} ${readable}` : readable;
}

function StorageRow({ title, description, place, issues, reveal, onReveal, t }: {
  title: string; description: string; place: StoragePlace; issues?: ContentIssues;
  reveal: boolean; onReveal: (place: StoragePlace) => Promise<void>; t: Translate;
}) {
  return <li className="storage-row">
    <div className="storage-text"><b>{title}</b><small>{description}</small></div>
    <div className="storage-side">
      <span className="storage-size">{formatSize(place.size, t)}</span>
      {reveal && <button type="button" className="storage-action" aria-label={`${t('在 Finder 中显示')}：${title}`} onClick={() => void onReveal(place)}>{t('在 Finder 中显示')}</button>}
    </div>
    <code className="storage-path" title={place.path}>{place.displayPath}</code>
    {issues && (issues.conflictFiles > 0 || issues.iCloudPlaceholders > 0) && <div className="storage-issues">
      {issues.conflictFiles > 0 && <p className="storage-issue storage-issue-conflict" role="status">{t('检测到 ${count} 个同步冲突副本文件，可在 Finder 中核对后保留其中一份。', { count: issues.conflictFiles })}</p>}
      {issues.iCloudPlaceholders > 0 && <p className="storage-issue" role="status">{t('有 ${count} 个文件尚未从 iCloud 下载，打开时会自动下载。', { count: issues.iCloudPlaceholders })}</p>}
    </div>}
  </li>;
}

export function StoragePreferences() {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const { data, error } = useApi<StorageOverview>('/api/storage/overview', revision);
  const [feedback, setFeedback] = useState('');
  const [moving, setMoving] = useState(false);
  const reveal = Boolean(window.desktop?.revealPath);

  async function showInFinder(place: StoragePlace) {
    setFeedback('');
    try { await window.desktop?.revealPath?.(place.path); }
    catch (failure) { setFeedback(failure instanceof Error ? failure.message : t('未能打开该目录。')); }
  }
  async function moveContent() {
    setFeedback('');
    setMoving(true);
    try { await window.desktop?.moveStorage?.(); }
    catch (failure) { setFeedback(failure instanceof Error ? failure.message : t('迁移未完成，原目录保持不变')); }
    finally { setMoving(false); }
  }

  return <section className="preferences-group storage-preferences" aria-labelledby="storage-heading">
    <PreferenceHeading kind="storage" id="storage-heading" title={t('存储位置')} description={t('这个知识库的内容、应用状态和缓存分别保存在什么位置。')} />
    {error ? <p className="storage-notice" role="alert">{t('暂时无法读取存储信息。')}<button type="button" className="storage-action" onClick={() => setRevision(value => value + 1)}>{t('重试')}</button></p>
      : !data ? <p className="storage-notice" role="status">{t('正在读取存储信息…')}</p>
      : <>
        <ul className="storage-list" aria-label={t('知识库内容')}>
          <StorageRow title={data.knowledgeBase.name} description={t('原始文件、生成的 Wiki、预测状态和语音原件')} place={data.knowledgeBase} issues={data.knowledgeBase.issues} reveal={reveal} onReveal={showInFinder} t={t} />
        </ul>
        {window.desktop?.moveStorage && <div className="storage-move">
          <div><p>{t('知识库内容可以整体移到其他文件夹，例如 iCloud Drive。')}</p><p>{t('应用状态和缓存始终留在本机。')}</p></div>
          <button type="button" className="storage-action" disabled={moving} onClick={() => void moveContent()}>{t('移动内容位置…')}</button>
        </div>}
        <ul className="storage-list" aria-label={t('应用数据')}>
          <StorageRow title={t('应用状态')} description={t('任务快照、做梦产物、随手记草稿和 AI 配置')} place={data.state} reveal={reveal} onReveal={showInFinder} t={t} />
          <StorageRow title={t('缓存')} description={t('录音转写的中间文件和随手记输入备份')} place={data.cache} reveal={reveal} onReveal={showInFinder} t={t} />
        </ul>
        {feedback && <p className="storage-feedback" role="alert">{feedback}</p>}
      </>}
  </section>;
}
