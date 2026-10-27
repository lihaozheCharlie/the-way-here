import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('native transcript retains four long-recording segments through empty finals and late callbacks', { skip: process.platform !== 'darwin' }, async t => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'twh-native-transcript-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const source = await readFile(new URL('../native/SpeechCapture.swift', import.meta.url), 'utf8');
  const state = source.split('// Native capture runtime')[0];
  const file = path.join(folder, 'main.swift');
  await writeFile(file, state + `
var state = SpeechTranscript()
state.update(segment: 1, text: "第一段")
state.update(segment: 2, text: "第二段")
state.update(segment: 3, text: "第三段")
state.update(segment: 4, text: "第四段")
state.update(segment: 1, text: "第一段最终文字")
state.update(segment: 2, text: "")
state.update(segment: 1, text: "短结果")
state.update(segment: 4, text: "  ")
assert(state.text == "第一段最终文字\\n第二段\\n第三段\\n第四段")
assert(state.hasText(segment: 4))
assert(!state.hasText(segment: 5))
// A successful final result may legitimately be shorter after correcting a repetition.
state.finalize(segment: 1, text: "最终稿。")
state.finalize(segment: 2, text: " ")
assert(state.text == "最终稿。\\n第二段\\n第三段\\n第四段")
`);
  const build = spawnSync('xcrun', ['swiftc', file, '-o', path.join(folder, 'test')], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const run = spawnSync(path.join(folder, 'test'), [], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
