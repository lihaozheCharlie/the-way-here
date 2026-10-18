import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { PhotoLibrary } from './photo-library.mjs';
function harness() {
  const child = new EventEmitter();
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() { this.killed = true; } });
  const messages = [];
  child.stdin.on('data', data => messages.push(JSON.parse(data.toString())));
  return { child, messages, library: new PhotoLibrary('/bundled/photo-library', () => child) };
}
test('routes fragmented/out-of-order responses to their own request', async () => {
  const { child, library, messages } = harness();
  try {
    const first = library.status(), second = library.search({ query: '去年', favoritesOnly: true, photoType: 'screenshot' });
    child.stdout.write(JSON.stringify({ id: messages[1].id, result: { photos: [], summary: 'last year' } }) + '\n');
    child.stdout.write('{"id":"' + messages[0].id + '","result":"auth');
    child.stdout.write('orized"}\n');
    assert.equal(await first, 'authorized');
    assert.deepEqual(await second, { photos: [], summary: 'last year' });
  } finally { library.close(); }
});
test('process failures reject every request and can be retried', async () => {
  const { child, library } = harness();
  const pending = library.status();
  child.emit('error', new Error('ENOENT'));
  await assert.rejects(pending, /照片组件未就绪/);
  assert.equal(library.pending.size, 0);
  assert.equal(child.killed, true);
});
test('preview arguments cannot override the native command; closing rejects work', async () => {
  const { library, messages } = harness();
  const pending = library.image({ assetId: 'anonymous-asset', size: 'thumbnail', network: false, command: 'authorize' });
  assert.equal(messages[0].command, 'image');
  assert.throws(() => library.image({ assetId: 'id', size: 'original', network: true }));
  library.close();
  await assert.rejects(pending, /已关闭/);
});
test('malformed native output fails closed rather than hanging', async () => {
  const { child, library } = harness();
  const pending = library.status(); child.stdout.write('not json\n');
  await assert.rejects(pending, /响应无效/);
  assert.equal(child.killed, true);
});
