import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('native transcript accumulates timed utterances across callback resets and preserves capture segments', { skip: process.platform !== 'darwin' }, async t => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'twh-native-transcript-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const source = await readFile(new URL('../native/SpeechCapture.swift', import.meta.url), 'utf8');
  const state = source.split('// Native capture runtime')[0];
  const file = path.join(folder, 'main.swift');
  await writeFile(file, state + `
// Anonymous callback sequence reproduced from on-device historical replay:
// completed utterances carry audio times, the following partial resets to zero,
// and the task can end with an empty final result.
var recognition = SpeechRecognitionText()
recognition.update(text: "第一句话还没修好")
recognition.update(text: "第一句话。", start: 0.2, end: 8.4)
recognition.update(text: "第二")
assert(recognition.text == "第一句话。\\n第二")
recognition.update(text: "第二句话。", start: 9.0, end: 17.2)
recognition.update(text: "第三句话。", start: 18.0, end: 30.0)
recognition.update(text: "")
assert(recognition.text == "第一句话。\\n第二句话。\\n第三句话。")
// Duplicate/timing-corrected stable callbacks replace, without duplicating text.
recognition.update(text: "第二句话修正。", start: 9.0, end: 17.3)
assert(recognition.text == "第一句话。\\n第二句话修正。\\n第三句话。")
// A recognizer returning cumulative results also works.
recognition.update(text: "前三句话合并修正。", start: 0.2, end: 30.1)
assert(recognition.text == "前三句话合并修正。")
// Shorter partials are corrections; identical spoken words at different times
// are distinct utterances, not text to deduplicate.
recognition.update(text: "很长的临时错误文字")
recognition.update(text: "好的")
recognition.update(text: "好的", start: 31.0, end: 32.0)
recognition.update(text: "好的", start: 33.0, end: 34.0)
recognition.update(text: "")
assert(recognition.text == "前三句话合并修正。\\n好的\\n好的")
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
state.revise(segment: 4, text: "修订")
assert(state.text.hasSuffix("修订"))
state.revise(segment: 4, text: "第四段")
// A successful final result may legitimately be shorter after correcting a repetition.
state.finalize(segment: 1, text: "最终稿。")
state.finalize(segment: 2, text: " ")
assert(state.text == "最终稿。\\n第二段\\n第三段\\n第四段")
// A final containing only the last sentence must not erase a longer preview.
let preview = String(repeating: "前面的完整内容", count: 12) + "最后一句"
state.update(segment: 5, text: preview)
assert(!state.finalize(segment: 5, text: "最后一句"))
assert(state.text.hasSuffix(preview))
assert(!state.finalize(segment: 5, text: ""))
// Other segments remain ordered and successful corrections still apply.
assert(state.finalize(segment: 4, text: "第四段。"))
assert(state.text.contains("第三段\\n第四段。\\n"))
`);
  const build = spawnSync('xcrun', ['swiftc', file, '-o', path.join(folder, 'test')], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const run = spawnSync(path.join(folder, 'test'), [], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
