import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, access, rm, realpath } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { runLockedVerification } from './verification-lock.mjs';
const helper=new URL('./verification-lock.mjs',import.meta.url).href;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(action){for(let i=0;i<200;i++){if(await action())return;await wait(25);}throw new Error('Anonymous lock fixture timed out.');}
async function fixture(t){const studio=await mkdtemp(path.join(await realpath(os.tmpdir()),'twh-anonymous-verification-lock-'));await mkdir(path.join(studio,'.runtime/ios'),{recursive:true});t.after(()=>rm(studio,{recursive:true,force:true}));return {studio,lock:path.join(studio,'.runtime/ios/verification.lock'),report:path.join(studio,'.runtime/ios/verification.json')};}
const env=studio=>({PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1',TEST_LOCK_STUDIO:studio});
function execute(studio,code,extra={}){return runLockedVerification({studio,command:process.execPath,args:['--input-type=module','-e',code],env:{...env(studio),...extra},stdio:'ignore'});}
const held=`import {verificationWorkerOwnsLock} from ${JSON.stringify(helper)};import{writeFile,access}from'node:fs/promises';import path from'node:path';const root=process.env.TEST_LOCK_STUDIO;if(!await verificationWorkerOwnsLock(root))throw Error('not owner');await writeFile(path.join(root,process.env.NAME+'.prepared'),'prepared');await writeFile(path.join(root,'.runtime/ios/verification.json'),process.env.NAME);await writeFile(path.join(root,'ready'),'ready');for(let i=0;i<400;i++){try{await access(path.join(root,'release'));break;}catch{}await new Promise(r=>setTimeout(r,25));}`;
test('a competing live owner fails before preparation and preserves the existing report',async t=>{
 const f=await fixture(t);const first=execute(f.studio,held,{NAME:'first'});await until(()=>access(path.join(f.studio,'ready')).then(()=>true,()=>false));
 try{assert.equal(await execute(f.studio,held,{NAME:'second'}),73);assert.equal(await readFile(f.report,'utf8'),'first');await assert.rejects(access(path.join(f.studio,'second.prepared')),{code:'ENOENT'});}finally{await writeFile(path.join(f.studio,'release'),'go');assert.equal(await first,0);}
 assert.equal(JSON.parse(await readFile(f.lock,'utf8')),null);
});
test('a genuinely exited PID is reclaimed and a live metadata owner without flock is not stolen',async t=>{
 const f=await fixture(t);const child=spawn(process.execPath,['-e','process.exit(0)'],{detached:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
 const owner={version:1,token:randomUUID(),launcherPid:child.pid,workerPid:child.pid,processGroup:child.pid};await writeFile(f.lock,JSON.stringify(owner));
 assert.equal(await execute(f.studio,'process.exit(0)'),0);assert.equal(JSON.parse(await readFile(f.lock,'utf8')),null);
 const live=JSON.stringify({...owner,launcherPid:process.pid,workerPid:null,processGroup:null});await writeFile(f.lock,live);await writeFile(f.report,'protected report');
 assert.equal(await execute(f.studio,'process.exit(0)'),73);assert.equal(await readFile(f.lock,'utf8'),live);assert.equal(await readFile(f.report,'utf8'),'protected report');
});
test('worker failure releases its own lock and permits the next anonymous check',async t=>{
 const f=await fixture(t);assert.notEqual(await execute(f.studio,"throw Error('anonymous fixture failure')"),0);assert.equal(JSON.parse(await readFile(f.lock,'utf8')),null);assert.equal(await execute(f.studio,'process.exit(0)'),0);
});
test('release never clears a different ownership token',async t=>{
 const f=await fixture(t);const first=execute(f.studio,held,{NAME:'first'});await until(()=>access(path.join(f.studio,'ready')).then(()=>true,()=>false));
 const replaced={...JSON.parse(await readFile(f.lock,'utf8')),token:randomUUID()};await writeFile(f.lock,JSON.stringify(replaced));await writeFile(path.join(f.studio,'release'),'go');assert.equal(await first,0);assert.equal(JSON.parse(await readFile(f.lock,'utf8')).token,replaced.token);
});
test('a surviving child process group keeps ownership after its Node worker exits',async t=>{
 const f=await fixture(t);const code=`import{spawn}from'node:child_process';import{writeFile}from'node:fs/promises';const child=spawn(process.execPath,['-e','setTimeout(()=>{},900)'],{stdio:'ignore'});await writeFile(${JSON.stringify(path.join(f.studio,'ready'))},'ready');child.unref();process.exit(0);`;
 const first=execute(f.studio,code);await until(()=>access(path.join(f.studio,'ready')).then(()=>true,()=>false));
 assert.equal(await execute(f.studio,'process.exit(0)'),73);assert.equal(await first,0);assert.equal(await execute(f.studio,'process.exit(0)'),0);
});

test('a killed launcher cannot make a still-running child group reclaimable',async t=>{
 const f=await fixture(t);const code=`import{spawn}from'node:child_process';import{writeFile}from'node:fs/promises';const child=spawn(process.execPath,['-e','setTimeout(()=>{},1300)'],{stdio:'ignore'});await writeFile(${JSON.stringify(path.join(f.studio,'ready'))},'ready');child.unref();process.exit(0);`;
 const first=execute(f.studio,code);await until(()=>access(path.join(f.studio,'ready')).then(()=>true,()=>false));
 const owner=JSON.parse(await readFile(f.lock,'utf8'));process.kill(owner.launcherPid,'SIGKILL');await first;
 assert.equal(await execute(f.studio,'process.exit(0)'),73);
 assert.equal(JSON.parse(await readFile(f.lock,'utf8')).token,owner.token);
 await wait(1400);assert.equal(await execute(f.studio,'process.exit(0)'),0);
});

test('unverifiable ownership fails closed without changing the old lock or report',async t=>{
 const f=await fixture(t);await writeFile(f.lock,'{}');await writeFile(f.report,'old successful report');
 assert.notEqual(await execute(f.studio,'process.exit(0)'),0);assert.equal(await readFile(f.lock,'utf8'),'{}');assert.equal(await readFile(f.report,'utf8'),'old successful report');
});
