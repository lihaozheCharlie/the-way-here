export function localRoute(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) throw new Error('无效的本地页面');
  const url = new URL(value, 'http://local');
  if (url.origin !== 'http://local' || url.pathname.startsWith('/api/')) throw new Error('只允许打开应用页面');
  return url.pathname + url.search + url.hash;
}
export function allowedExternal(value) {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol); } catch { return false; }
}
export function trustedSender(url, origin) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
