function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请使用有效日期，如 2024-05-12');
  const [year, month, date] = value.split('-').map(Number);
  const result = new Date(year, month - 1, date);
  if (year < 1900 || year > 2200 || result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== date) throw new Error('日期不存在，请检查年月日');
  return result;
}
function plusDay(value) { return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1); }
const label = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** One date expression plus optional literal album/file keyword or place. No model calls. */
export function photoQuery(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.query !== 'string' || input.query.length > 120 || !['text', 'place'].includes(input.kind)) throw new Error('照片搜索条件无效');
  if (input.cursor !== undefined) {
    if (typeof input.cursor !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.cursor)) throw new Error('照片分页已失效，请重新搜索');
    return { command: 'more', cursor: input.cursor };
  }
  let keyword = input.query.trim(), start, end;
  const expression = /最近\s*(\d{1,3})\s*天|今天|昨天|今年|去年|本月|上个月|\d{4}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{4}-\d{2}(?:-\d{2})?/g;
  const matches = [...keyword.matchAll(expression)];
  if (matches.length > 1) throw new Error('多个日期请用下方的起止日期选择');
  if (matches.length) {
    const token = matches[0][0];
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    if (/^最近/.test(token)) {
      const count = Number(matches[0][1]);
      if (count < 1 || count > 366) throw new Error('最近天数请填写 1–366 天');
      start = new Date(y, m, d - count + 1); end = new Date(y, m, d + 1);
    } else if (token === '今天' || token === '昨天') {
      start = new Date(y, m, d - (token === '昨天' ? 1 : 0)); end = plusDay(start);
    } else if (token === '今年' || token === '去年') {
      start = new Date(y - (token === '去年' ? 1 : 0), 0, 1); end = new Date(start.getFullYear() + 1, 0, 1);
    } else if (token === '本月' || token === '上个月') {
      start = new Date(y, m - (token === '上个月' ? 1 : 0), 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    } else {
      const parts = token.match(/\d+/g).map(Number);
      const [year, month = 1, date = 1] = parts;
      start = day(`${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`);
      end = parts.length === 3 ? plusDay(start) : parts.length === 2 ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
    }
    keyword = keyword.replace(token, '').trim();
  }
  if (input.from || input.through) {
    if (matches.length) throw new Error('输入框与起止日期都指定了时间，请保留其中一种');
    if (input.from) start = day(input.from);
    if (input.through) end = plusDay(day(input.through));
  }
  if (start && end && start >= end) throw new Error('结束日期不能早于开始日期');
  if (input.kind === 'place' && !keyword) throw new Error('请输入拍摄地点，如“杭州富阳”');
  const dates = start || end ? `${start ? label(start) : '最早'} 至 ${end ? label(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)) : '现在'}` : '全部日期';
  return { command: 'search', keyword, kind: input.kind, start: start?.toISOString(), end: end?.toISOString(), summary: `${dates}${keyword ? ` · ${input.kind === 'place' ? '地点' : '相册 / 文件名'}：${keyword}` : ' · 按日期从新到旧'}` };
}
