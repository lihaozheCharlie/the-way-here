import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { UpdateChecker, validateUpdateFeed } from './updates.mjs';
import { createMacInstaller } from './update-installer.mjs';
import { UpdateReadiness } from './update-readiness.mjs';

const artifact = {filename:'The-Way-Here-0.2.0-arm64.zip',size:100,sha512:Buffer.alloc(64,1).toString('base64')};
const feed = () => ({schemaVersion:1,version:'0.2.0',notes:{zh:'匿名更新'},downloads:{arm64:{url:'https://github.com/lihaozheCharlie/the-way-here/releases/download/mac-v0.2.0/The-Way-Here-0.2.0-arm64.dmg',size:120,sha256:'a'.repeat(64),minimumSystemVersion:'13.0',installer:{...artifact}}}});
function checker(installer, options = {}) { return new UpdateChecker({version:'0.1.0',arch:'arm64',systemVersion:'26.0',fetch:async()=>Response.json(feed()),installer,...options}); }

test('check never downloads; one explicit transfer reports progress and waits for safe restart',async()=>{
 let downloads=0,installs=0,ready=false,finish;
 const c=checker({download:async(_version,_file,progress)=>{downloads++;progress(42);await new Promise(resolve=>finish=resolve);},install:()=>{installs++;},dispose(){}},{canInstall:async()=>ready});
 await c.check(); assert.equal(downloads,0);
 const first=c.download(),second=c.download();assert.equal(first,second);assert.equal(downloads,1);assert.equal(c.state.progress,42);
 await c.check();assert.equal(c.state.status,'downloading');
 finish();await first;assert.equal(c.state.status,'ready');
 assert.equal(await c.installWhenReady(),false);assert.equal(installs,0);
 ready=true;await Promise.all([c.installWhenReady(),c.installWhenReady()]);assert.equal(installs,1);assert.equal(c.state.status,'installing');
});
test('failed transfer retries; failed install is recoverable without redownloading',async()=>{
 let failDownload=true,failInstall=true,downloads=0;
 const c=checker({download:async()=>{downloads++;if(failDownload)throw Error('checksum');},install:()=>{if(failInstall)throw Error('signature');},dispose(){}});
 await c.check();await assert.rejects(c.download());assert.equal(c.state.status,'download-error');
 failDownload=false;await c.download();await c.installWhenReady();assert.equal(c.state.status,'install-error');
 failInstall=false;await c.installWhenReady();assert.equal(c.state.status,'installing');assert.equal(downloads,2);
});
test('disposing during download cancels the adapter and cannot install later',async()=>{
 let finish,disposed=false,installs=0;
 const c=checker({download:async()=>new Promise(resolve=>finish=resolve),install:()=>installs++,dispose:()=>{disposed=true;}});
 await c.check();const pending=c.download();c.dispose();finish();await pending;await c.installWhenReady();assert.equal(disposed,true);assert.equal(installs,0);
});
test('automatic metadata must match version, architecture and SHA-512 encoding',()=>{
 for(const invalid of [{filename:'../evil.zip'},{filename:'The-Way-Here-0.2.0-x64.zip'},{sha512:'bad'},{size:-1}]){
  const value=feed();Object.assign(value.downloads.arm64.installer,invalid);assert.throws(()=>validateUpdateFeed(value,'arm64'));
 }
});
function fakeUpdater(changes={}){
 const u=new EventEmitter();let downloads=0,installs=0,cancelled=0;
 u.checkForUpdates=async()=>({updateInfo:{version:'0.2.0',files:[{url:artifact.filename,sha512:artifact.sha512,size:artifact.size,...changes}]},cancellationToken:{cancel:()=>cancelled++}});
 u.downloadUpdate=async()=>{downloads++;u.emit('download-progress',{percent:50});};u.quitAndInstall=()=>installs++;u.closeServerIfExists=()=>{};
 return {u,counts:()=>({downloads,installs,cancelled})};
}
test('native adapter disables implicit download/quit installation and rejects tampered metadata before download',async()=>{
 for(const changes of [{url:'https://evil.example/evil.zip'},{sha512:Buffer.alloc(64,2).toString('base64')},{size:101}]){
  const {u,counts}=fakeUpdater(changes);const adapter=createMacInstaller({createUpdater:async()=>u});
  await assert.rejects(adapter.download('0.2.0',artifact,()=>{}));assert.equal(counts().downloads,0);assert.equal(u.autoDownload,false);assert.equal(u.autoInstallOnAppQuit,false);adapter.dispose();
 }
 const {u,counts}=fakeUpdater();let progress=0;
 const adapter=createMacInstaller({createUpdater:async()=>u});await adapter.download('0.2.0',artifact,value=>progress=value);assert.equal(progress,50);assert.equal(counts().installs,0);
 adapter.install();assert.equal(counts().installs,1);adapter.dispose();assert.equal(counts().cancelled,1);
});
test('all windows must acknowledge; spoofed replies and timeout cannot authorize installation',async()=>{
 const gate=new UpdateReadiness({timeoutMs:20});
 const makeWindow=(id,ack)=>({isDestroyed:()=>false,webContents:{id,isLoadingMainFrame:()=>false,send:(event,token)=>{if(event==='desktop:update-prepare')ack(token);}}});
 const first=makeWindow(1,token=>gate.reply(1,token,true));
 const second=makeWindow(2,token=>gate.reply(1,token,true));
 assert.equal(await gate.prepare(new Set([first,second])),false);
 const ready=makeWindow(2,token=>gate.reply(2,token,true));assert.equal(await gate.prepare(new Set([first,ready])),true);gate.dispose();
});
