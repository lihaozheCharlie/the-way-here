import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoQuery } from './photo-query.mjs';
const now = new Date(2026, 0, 15, 12);
const query = (value, rest = {}) => photoQuery({ query: value, kind: 'text', ...rest }, now);
const localDate = value => { const d = new Date(value); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };
test('dates use local calendar boundaries and include the complete last day', () => {
  for (const [text, start, end] of [
    ['今天', [2026, 1, 15], [2026, 1, 16]],
    ['昨天', [2026, 1, 14], [2026, 1, 15]],
    ['去年', [2025, 1, 1], [2026, 1, 1]],
    ['上个月', [2025, 12, 1], [2026, 1, 1]],
    ['最近30天', [2025, 12, 17], [2026, 1, 16]],
    ['2024年2月', [2024, 2, 1], [2024, 3, 1]],
    ['2024-02-29', [2024, 2, 29], [2024, 3, 1]],
    ['2024年', [2024, 1, 1], [2025, 1, 1]],
  ]) {
    const actual = query(text);
    assert.deepEqual(localDate(actual.start), start, text);
    assert.deepEqual(localDate(actual.end), end, text);
    assert.equal(actual.keyword, '');
  }
});
test('combines literal keywords and dates without claiming visual recognition', () => {
  const result = query('去年 杭州富阳', { kind: 'place' });
  assert.equal(result.keyword, '杭州富阳');
  assert.equal(result.kind, 'place');
  assert.match(result.summary, /2025-01-01 至 2025-12-31/);
  assert.equal(query('阴天').keyword, '阴天');
  assert.equal(query('匿名人物').keyword, '匿名人物');
  assert.equal(query('').start, undefined);
});
test('rejects nonexistent, reversed and conflicting dates instead of broadening search', () => {
  for (const text of ['2023年2月29日', '2024-13-01', '最近0天', '最近999天', '2024-01-01 2024-02-01']) assert.throws(() => query(text));
  assert.throws(() => query('去年', { from: '2024-01-01' }));
  assert.throws(() => query('', { from: '2024-05-02', through: '2024-05-01' }));
  assert.throws(() => query('', { kind: 'place' }));
  const result = query('', { from: '2024-02-29', through: '2024-02-29' });
  assert.deepEqual(localDate(result.end), [2024, 3, 1]);
});
test('validates untrusted IPC input and restricts cursors to opaque IDs', () => {
  for (const input of [null, [], {}, { query: 'a', kind: 'all' }, { query: 'x'.repeat(121), kind: 'text' }]) assert.throws(() => photoQuery(input));
  assert.throws(() => query('', { cursor: '../../private' }));
  assert.deepEqual(query('', { cursor: '00000000-0000-4000-8000-000000000000' }), { command: 'more', cursor: '00000000-0000-4000-8000-000000000000' });
});
