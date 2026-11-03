import { createHash } from 'node:crypto';
import type { WikiIndex } from '@the-way-here/wiki-core';
/** Resolve the user's scope to a frozen, source-only allow-list; no life interpretation. */
export function resolveLetterScope(index: WikiIndex, options: Record<string,string>, requestedPaths: string[] = [], now = new Date()) {
  const sources = index.list().filter(p => p.isSource && !p.externalSource && p.relativePath.startsWith(index.config.paths.sources + '/'));
  const voice = options.voice || '老朋友';
  if (!['老朋友','同行前辈','未来的你','善意的读者'].includes(voice)) throw new Error('回信视角无效');
  if (voice === '未来的你' && sources.length < 30) throw new Error('未来的你需要至少30份记录');
  const scope = options.scope || '最近 30 天';
  if (!['最近 30 天','全部','指定人物或人生线'].includes(scope)) throw new Error('回信参考范围无效');
  const wanted = new Set(requestedPaths);
  if (requestedPaths.some(p => !sources.some(s => s.relativePath === p))) throw new Error('回信来源不属于当前空间');
  const detail = (options.scopeDetail || '').trim();
  const eligibleAnchors = index.list().filter(p => !p.isSource && !p.externalSource && ['entities','personal-lines'].includes(p.category) && p.relativePath.startsWith(index.config.paths.wiki + '/'));
  let anchor: typeof eligibleAnchors = [];
  if (scope === '指定人物或人生线') {
    // Stable transport identity wins. Legacy display names are accepted only when unambiguous.
    anchor = eligibleAnchors.filter(p => p.relativePath === detail || p.id === detail);
    if (!anchor.length) anchor = eligibleAnchors.filter(p => [p.title,...p.aliases].includes(detail));
    if (anchor.length > 1) throw new Error('同名人物或人生线不唯一，请在手机重新选择明确的页面');
    if (!anchor.length) throw new Error('请选择当前空间中已有的人物或人生线');
  }
  const linked = new Set(anchor.flatMap(p => { const full = index.get(p.id); return [...(full?.incomingLinks || []), ...(full?.outgoingLinks || []).flatMap(l => l.resolvedId ? [index.get(l.resolvedId)].filter(Boolean) : [])].map(p => p!.id); }));
  const from = new Date(now.getTime() - 30*86400000).toISOString();
  const selected = sources.filter(p => (!wanted.size || wanted.has(p.relativePath)) && (scope === '全部' || scope === '最近 30 天' && (p.start || p.modifiedAt) >= from || scope === '指定人物或人生线' && linked.has(p.id)));
  if (!selected.length) throw new Error('所选范围没有可用来源，请调整范围');
  if (selected.length > 100) throw new Error('所选范围超过100份，请在手机选择记录或缩小范围');
  const documents = selected.map(p => ({ path: p.relativePath, title: p.title, markdown: index.get(p.id)!.markdown }));
  return { knowledgeBaseId: index.config.knowledgeBaseId, scope, frozenAt: now.toISOString(), sourcePaths: documents.map(p => p.path), documents, hash: createHash('sha256').update(JSON.stringify(documents)).digest('hex') };
}
