import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoQuery } from './photo-query.mjs';
const now = new Date(2026, 0, 15, 12);
const query = (value, rest = {}) => photoQuery({ query: value, ...rest }, now);
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
    assert.equal(actual.place, '');
  }
});
test('combines native filters independently and rejects unsupported text', () => {
  const result = query('去年', { dateBasis: 'added', place: '杭州富阳', radiusKm: 5, albumId: 'anonymous-album', favoritesOnly: true, photoType: 'live' });
  assert.equal(result.place, '杭州富阳');
  assert.equal(result.radiusKm, 5);
  assert.equal(result.albumId, 'anonymous-album');
  assert.equal(result.favoritesOnly, true);
  assert.equal(result.photoType, 'live');
  assert.equal(result.dateBasis, 'added');
  assert.match(result.summary, /2025-01-01 至 2025-12-31/);
  assert.match(result.summary, /加入图库时间.*仅收藏.*附近5公里/);
  for (const text of ['阴天', '匿名人物', '去年 杭州', '2024年5月旅行']) assert.throws(() => query(text), /时间只支持/);
  assert.equal(query('').start, undefined);
});
test('rejects nonexistent, reversed and conflicting dates instead of broadening search', () => {
  for (const text of ['2023年2月29日', '2024-13-01', '最近0天', '最近999天', '2024-01-01 2024-02-01']) assert.throws(() => query(text));
  assert.throws(() => query('去年', { from: '2024-01-01' }));
  assert.throws(() => query('', { from: '2024-05-02', through: '2024-05-01' }));
  const result = query('', { from: '2024-02-29', through: '2024-02-29' });
  assert.deepEqual(localDate(result.end), [2024, 3, 1]);
});
test('validates untrusted IPC input and restricts cursors to opaque IDs', () => {
  for (const input of [null, [], {}, { query: 'a', kind: 'all' }, { query: 'x'.repeat(121) }, { query: '', favoritesOnly: 'true' }, { query: '', place: [] }, { query: '', albumId: {} }, { query: '', radiusKm: 0 }, { query: '', radiusKm: Infinity }, { query: '', photoType: 'people' }, { query: '', dateBasis: 'unknown' }, { query: '', from: 123 }]) assert.throws(() => photoQuery(input));
  assert.throws(() => query('', { cursor: '../../private' }));
  assert.deepEqual(query('', { cursor: '00000000-0000-4000-8000-000000000000' }), { command: 'more', cursor: '00000000-0000-4000-8000-000000000000' });
});

test('DST and open-ended date ranges keep local calendar semantics', () => {
  const result = photoQuery({ query: '昨天' }, new Date(2026, 2, 9, 12));
  assert.deepEqual(localDate(result.start), [2026, 3, 8]);
  assert.deepEqual(localDate(result.end), [2026, 3, 9]);
  assert.equal(query('', { through: '2024-05-01' }).start, undefined);
  assert.equal(query('', { from: '2024-05-01' }).end, undefined);
});
