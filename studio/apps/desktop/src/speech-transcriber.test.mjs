import test from 'node:test';
import assert from 'node:assert/strict';
import { whisperTranscript } from './speech-transcriber.mjs';

test('keeps every long-recording segment and its punctuation in timeline order', () => {
  const transcription = Array.from({length: 21}, (_, index) => ({ offsets:{from:index*15_000,to:(index+1)*15_000}, text:`第${index + 1}段，有标点。` }));
  const result = whisperTranscript({ transcription });
  assert.equal(result.segments.at(-1).to,315_000);
  assert.equal(result.text.split('\n').length,21);
  assert.ok(result.text.startsWith('第1段，有标点。'));
  assert.ok(result.text.endsWith('第21段，有标点。'));
});
test('rejects empty and malformed timelines instead of returning a misleading final transcript', () => {
  for (const data of [{}, {transcription:[]}, {transcription:[{text:'',offsets:{from:0,to:1}}]}, {transcription:[{text:'文字',offsets:{from:20,to:10}}]}, {transcription:[{text:'后',offsets:{from:20,to:30}},{text:'前',offsets:{from:10,to:20}}]}]) assert.throws(()=>whisperTranscript(data));
});
