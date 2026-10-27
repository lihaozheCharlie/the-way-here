import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, validateUpdateFeed, UpdateChecker, UPDATE_FEED_URL } from './updates.mjs';
import { writeUpdateFeed } from '../../../scripts/prepare-update-feed.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const feed = () => ({ schemaVersion:1, version:'0.1.4', notes:{zh:'更新说明',en:'Release notes'}, downloads:{arm64:{url:'https://github.com/lihaozheCharlie/the-way-here/releases/download/mac-v0.1.4/The-Way-Here-0.1.4-arm64.dmg', size:230000000, sha256:'a'.repeat(64), minimumSystemVersion:'13.0'}} });
const checker = (fetch, options = {}) => new UpdateChecker({ version:'0.1.3', arch:'arm64', systemVersion:'26.0', fetch, ...options });
test('numeric stable versions never offer a downgrade or prerelease', async () => {
  assert.equal(compareVersions('0.1.10','0.1.9'),1);
  for (const value of ['1.0','1.0.0-beta','v1.0.0','bad']) assert.throws(() => compareVersions(value,'0.1.3'));
  for (const version of ['0.1.4','0.2.0']) {
    const c=checker(async()=>Response.json(feed()),{version});
    assert.equal((await c.check()).status,'current');
    assert.throws(()=>c.downloadURL());
  }
});
test('a compatible update exposes notes but opens no browser and reveals no URL to the renderer', async () => {
  let calls=0;
  const c=checker(async(url,options)=>{calls++;assert.equal(url,UPDATE_FEED_URL);assert.equal(options.cache,'no-store');assert.ok(options.signal);return Response.json(feed());});
  assert.throws(()=>c.downloadURL());
  const state=await c.check();
  assert.equal(calls,1);assert.equal(state.status,'available');assert.equal(state.version,'0.1.3');assert.equal(state.latestVersion,'0.1.4');
  assert.equal(state.notes.en,'Release notes');assert.equal(state.url,undefined);
  assert.equal(c.downloadURL(),feed().downloads.arm64.url);
});
test('incompatible systems and unsupported architectures cannot download', async () => {
  const c=checker(async()=>Response.json(feed()),{systemVersion:'12.7.1'});
  assert.equal((await c.check()).status,'incompatible');assert.throws(()=>c.downloadURL());
  const other=checker(async()=>Response.json(feed()),{arch:'x64'});
  assert.equal((await other.check()).status,'unsupported');assert.throws(()=>other.downloadURL());
});
test('download metadata rejects untrusted destinations, mismatched versions, malformed hashes and oversized notes', () => {
  for (const url of ['http://github.com/a','https://evil.example/a','https://github.com.evil.example/a',feed().downloads.arm64.url+'?token=private',feed().downloads.arm64.url.replace('mac-v0.1.4','mac-v0.1.5'),feed().downloads.arm64.url.replace('https://','https://user:password@')]) {
    const value=feed();value.downloads.arm64.url=url;assert.throws(()=>validateUpdateFeed(value,'arm64'));
  }
  for(const changes of [{size:-1},{size:Infinity},{sha256:'invalid'},{minimumSystemVersion:'bad'}]) {
    const value=feed();Object.assign(value.downloads.arm64,changes);assert.throws(()=>validateUpdateFeed(value,'arm64'));
  }
  const value=feed();value.notes.zh='x'.repeat(4001);assert.throws(()=>validateUpdateFeed(value,'arm64'));
});
test('concurrent checks share one request; offline and oversized replies become recoverable errors', async () => {
  let resolve,calls=0;const response=new Promise(r=>resolve=r);
  const c=checker(async()=>{calls++;return response;});
  const first=c.check(),second=c.check();assert.equal(first,second);resolve(Response.json(feed()));await first;assert.equal(calls,1);
  for(const fetch of [async()=>{throw Error('offline')},async()=>new Response('x'.repeat(65537)),async()=>new Response('<html>login</html>'),async()=>new Response('',{status:503})]) {
    const bad=checker(fetch);assert.equal((await bad.check()).status,'error');assert.throws(()=>bad.downloadURL());
  }
});
test('disabled channels never check and shutdown aborts requests without late events', async () => {
  const disabled=checker(()=>{throw Error('must not fetch')},{enabled:false});assert.equal((await disabled.check()).status,'disabled');
  let signal,resolve;const states=[];
  const c=checker(async(_url,options)=>{signal=options.signal;return new Promise(r=>resolve=r)},{onChange:s=>states.push(s.status)});
  const pending=c.check();c.dispose();assert.ok(signal.aborted);resolve(Response.json(feed()));await pending;
  assert.deepEqual(states,['checking']);assert.throws(()=>c.downloadURL());
});
test('publish feed exactly describes the notarized release and round-trips through the installed client', async t => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'twh-update-feed-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const output=path.join(directory,'update.json');
  const release={ready:true,version:'0.1.4',arch:'arm64',filename:'The-Way-Here-0.1.4-arm64.dmg',size:230000000,sha256:'a'.repeat(64),minimumSystemVersion:'13.0'};
  await writeUpdateFeed(release,output,{zh:'匿名测试发布'});
  const c=checker(async()=>new Response(await readFile(output)));
  assert.equal((await c.check()).status,'available');assert.equal(c.downloadURL(),feed().downloads.arm64.url);
  await assert.rejects(writeUpdateFeed({...release,ready:false},output));
  await assert.rejects(writeUpdateFeed({...release,filename:'other.dmg'},output));
});
