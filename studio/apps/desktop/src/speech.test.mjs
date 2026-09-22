import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { speechSession } from './speech.mjs';

async function fixture(t, source) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'twh-speech-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = path.join(directory, 'speech');
  await writeFile(binary, `#!${process.execPath}\n${source}`);
  await chmod(binary, 0o755);
  return binary;
}
test('manual stop returns all recognition segments and tolerates repeated stop', async (t) => {
  const binary = await fixture(t, `process.stdin.resume(); process.stdin.on('end', () => { console.log(JSON.stringify({text:'第一段\\n第二段\\n最后一段', error:''})); });`);
  const session = speechSession(binary);
  session.stop(); session.stop();
  assert.equal(await session.result, '第一段\n第二段\n最后一段');
});
test('auto-completed recording remains retrievable when renderer stops later', async (t) => {
  const binary = await fixture(t, `console.log(JSON.stringify({text:'完整录音', error:''}));`);
  const session = speechSession(binary);
  assert.equal(await session.result, '完整录音');
  session.stop(); session.stop();
  assert.equal(await session.result, '完整录音');
});
test('recognition errors remain visible to the caller', async (t) => {
  const binary = await fixture(t, `console.log(JSON.stringify({text:'', error:'麦克风不可用'}));`);
  const session = speechSession(binary);
  await assert.rejects(session.result, /麦克风不可用/);
  session.stop();
});
