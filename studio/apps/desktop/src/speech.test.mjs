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
test('streams microphone readiness and bounded levels without mixing them into the transcript', async (t) => {
  const binary = await fixture(t, `
    process.stdout.write('{"event":"rea');
    setTimeout(() => {
      process.stdout.write('dy"}\\n{"event":"level","level":0.75}\\n{"event":"level","level":3}\\n');
      console.log(JSON.stringify({text:'识别文字', error:''}));
    }, 10);
  `);
  const events = [];
  const session = speechSession(binary, event => events.push(event));
  assert.equal(await session.result, '识别文字');
  assert.deepEqual(events, [{event:'ready'}, {event:'level',level:0.75}, {event:'level',level:1}]);
});
test('long-session checkpoints survive an empty final result and are delivered while recording', async t => {
  const binary = await fixture(t, `
    const lines = ['第一分钟', '第二分钟', '第三分钟', '最后一段'];
    lines.forEach((_, i) => console.log(JSON.stringify({event:'transcript', text:lines.slice(0,i+1).join('\\n')})));
    console.log(JSON.stringify({event:'transcript', text:''}));
    process.stdin.resume();
    process.stdin.on('end', () => console.log(JSON.stringify({text:'',error:'No speech detected'})));
  `);
  const events = [];
  let checkpoint;
  const ready = new Promise(resolve => { checkpoint = resolve; });
  const session = speechSession(binary, event => { events.push(event); if(event.event === 'transcript' && event.text.includes('最后一段')) checkpoint(); });
  await ready;
  session.stop();
  assert.equal(await session.result, '第一分钟\n第二分钟\n第三分钟\n最后一段');
  assert.equal(events.filter(event => event.event === 'transcript').length, 4);
  assert.equal(events.at(-1).event, 'warning');
});
test('unexpected native exit recovers the last nonempty checkpoint', async t => {
  const binary = await fixture(t, `console.log(JSON.stringify({event:'transcript',text:'已经说过的话'})); process.exit(1);`);
  assert.equal(await speechSession(binary).result, '已经说过的话');
});
test('audio-only failure points to recovery rather than claiming microphone silence', async t => {
  const binary = await fixture(t, `console.log(JSON.stringify({event:'recording',recordingPath:'/anonymous/recording.caf'}));console.log(JSON.stringify({text:'',error:'No speech detected'}));`);
  await assert.rejects(speechSession(binary).result, /原始录音已保留/);
});
test('whole-recording transcription replaces a nonempty truncated live preview', async t => {
  const binary = await fixture(t, `console.log(JSON.stringify({event:'recording',recordingPath:'/anonymous/recording.caf'}));console.log(JSON.stringify({event:'transcript',text:'只剩结尾'}));console.log(JSON.stringify({text:'只剩结尾',error:''}));`);
  const events=[];
  const session=speechSession(binary,event=>events.push(event),undefined,async(file,{onProgress})=>{assert.equal(file,'/anonymous/recording.caf');onProgress(50);return '开头，完整的五分钟内容。\n最后一句。';});
  assert.equal(await session.result,'开头，完整的五分钟内容。\n最后一句。');
  assert.ok(events.some(event=>event.event==='processing'));
  assert.ok(events.some(event=>event.event==='progress'&&event.percent===50));
  assert.equal(events.at(-1).text,'开头，完整的五分钟内容。\n最后一句。');
});
test('whole-recording transcription can recover when live recognition returned no text', async t => {
  const binary=await fixture(t, `console.log(JSON.stringify({event:'recording',recordingPath:'/anonymous/recording.caf'}));console.log(JSON.stringify({text:'',error:'No speech detected'}));`);
  assert.equal(await speechSession(binary,()=>{},undefined,async()=> '从原始音频找回。').result,'从原始音频找回。');
});
test('offline failure preserves the preview and cancellation skips costly retranscription', async t => {
  const binary=await fixture(t, `console.log(JSON.stringify({event:'recording',recordingPath:'/anonymous/recording.caf'}));process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({text:'预览文字',error:''})));`);
  const events=[];
  const session=speechSession(binary,event=>events.push(event),undefined,async()=>{throw Error('offline failed')});session.stop();
  assert.equal(await session.result,'预览文字');assert.ok(events.some(event=>event.event==='warning'));
  let called=false;const cancelled=speechSession(binary,()=>{},undefined,async()=>{called=true;return 'unused'});cancelled.stop(true);
  assert.equal(await cancelled.result,'预览文字');assert.equal(called,false);
});
test('pause and resume are acknowledged without ending or losing the recording', async t => {
  const binary = await fixture(t, `
    let pending='';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', data => {
      pending+=data; let at;
      while((at=pending.indexOf('\\n'))>=0) {
        const command=pending.slice(0,at);pending=pending.slice(at+1);
        if(command==='pause'||command==='resume') console.log(JSON.stringify({event:'paused',paused:command==='pause'}));
      }
    });
    process.stdin.on('end',()=>console.log(JSON.stringify({text:'暂停前。继续后。',error:''})));
  `);
  const session = speechSession(binary);
  await session.pause(true); await session.pause(false); session.stop();
  assert.equal(await session.result,'暂停前。继续后。');
  await assert.rejects(session.pause(true),/状态已变化/);
});
