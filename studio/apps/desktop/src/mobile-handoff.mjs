/** Handoff carries library-relative identity only. Never a machine path or command. */
export function parseMobileHandoff(value) {
  if (!value || typeof value !== 'object' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.knowledgeBaseId || '')) throw new Error('Handoff 空间标识无效');
  if (!['future','document'].includes(value.route)) throw new Error('Handoff 页面无效');
  if (value.route === 'document' && (typeof value.path !== 'string' || !value.path || value.path.length > 1000 || /[\\\x00-\x1f:]/.test(value.path) || value.path.startsWith('/') || value.path.split('/').some(p=>!p || p==='.' || p==='..'))) throw new Error('Handoff 文档位置无效');
  return {knowledgeBaseId:value.knowledgeBaseId,route:value.route,...(value.route==='document'?{path:value.path}:{})};
}
export async function receiveMobileHandoff(value, request, open, showError) {
  try {
    const target=parseMobileHandoff(value);
    const response=await request('/api/mobile-sync/handoff',{method:'POST',body:JSON.stringify(target)});
    if(!response?.route?.startsWith('/'))throw new Error('请在 Mac 打开同一个共享空间后继续。');
    open(response.route,'reader'); return true;
  } catch { showError('未能继续手机阅读','请在 Mac 打开同一个共享空间，并确认内容已同步。手机上的内容保留。'); return false; }
}
