// Real Squirrel.Mac replacement using disposable signed apps and an anonymous profile.
// No public release, Apple upload, real library, or existing application is changed.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio=fileURLToPath(new URL('../',import.meta.url));
const source=process.argv[2];if(!source||!path.isAbsolute(source)||!source.endsWith('.app'))throw Error('Pass the absolute path to a signed local app');
const requireBundled=process.argv.includes('--require-bundled-updater');
const require=createRequire(import.meta.url),builderRequire=createRequire(require.resolve('electron-builder/package.json'));
const asar=createRequire(builderRequire.resolve('app-builder-lib/package.json'))('@electron/asar');
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status!==0)throw Error(`${cmd}: ${r.stderr||r.stdout}`);return r.stdout;}
const root=await mkdtemp(path.join(os.tmpdir(),'twh-native-upgrade-'));
const bundleId='com.thewayhere.updatefixture.'+randomUUID().replaceAll('-','');
const old=path.join(root,'Applications','The Way Here.app'),target=path.join(root,'target','The Way Here.app'),result=path.join(root,'result.json'),trace=path.join(root,'trace.json');
const cachePaths=[path.join(os.homedir(),'Library/Caches',bundleId+'.ShipIt'),path.join(os.homedir(),'Library/Caches',bundleId),path.join(os.homedir(),'Library/Preferences',bundleId+'.plist')];
let server,child;const childLogs=[];
function owned(){return run('ps',['-Ao','pid=,args=']).split('\n').filter(line=>line.includes(root)).map(line=>Number(line.trim().split(/\s+/)[0])).filter(pid=>Number.isSafeInteger(pid)&&pid!==process.pid);}
function alive(pid){try{process.kill(pid,0);return true}catch{return false;}}
try{
 for(const file of cachePaths)if(await stat(file).catch(()=>null))throw Error('Fixture path already exists');
 const identityText=spawnSync('codesign',['-dvv',source],{encoding:'utf8'}).stderr;
 const identity=identityText.match(/Authority=(Developer ID Application:[^\n]+)/)?.[1];if(!identity)throw Error('A Developer ID signed app is required');
 await mkdir(path.dirname(old),{recursive:true});await mkdir(path.dirname(target),{recursive:true});
 await cp(source,old,{recursive:true,verbatimSymlinks:true});await cp(source,target,{recursive:true,verbatimSymlinks:true});
 await mkdir(path.join(root,'profile'),{recursive:true});await writeFile(path.join(root,'profile','sentinel.txt'),'anonymous draft kept');
 let metadata;
 server=createServer((req,res)=>{
  if(req.url.startsWith('/latest-mac.yml')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(metadata));}
  else if(req.url==='/fixture.zip'){res.setHeader('Content-Type','application/zip');res.setHeader('Content-Length',metadata.files[0].size);createReadStream(path.join(root,'fixture.zip')).pipe(res);}
  else{res.statusCode=404;res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const base=`http://127.0.0.1:${server.address().port}/`;
 const updaterModule=path.join(studio,'apps/desktop/node_modules/electron-updater');
 const common=`import {app} from 'electron';import fs from 'node:fs';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);app.setPath('userData',${JSON.stringify(path.join(root,'profile'))});app.setPath('cache',${JSON.stringify(path.join(root,'cache'))});app.setPath('sessionData',app.getPath('userData'));import {UserPreferences} from './user-preferences.mjs';const preferences=new UserPreferences(app.getPath('userData'));`;
 async function fixture(folder,version,code){
  const appSource=path.join(root,'code-'+version);await mkdir(appSource);
  const archive=path.join(folder,'Contents/Resources/app.asar');
  asar.extractAll(archive,appSource);
  await writeFile(path.join(appSource,'package.json'),JSON.stringify({name:'twh-native-upgrade-fixture',version,type:'module',main:'main.mjs'}));
  await cp(path.join(studio,'apps/desktop/src/user-preferences.mjs'),path.join(appSource,'user-preferences.mjs'));
  await writeFile(path.join(appSource,'main.mjs'),common+code);
  await rm(archive);await asar.createPackage(appSource,archive);
  await writeFile(path.join(folder,'Contents/Resources/app-update.yml'),JSON.stringify({provider:'generic',url:base,updaterCacheDirName:'native-update-fixture'}));
  const integrity=createHash('sha256').update(asar.getRawHeader(archive).headerString).digest('hex');
  run('/usr/bin/python3',['-c','import plistlib,sys; p=sys.argv[1]; d=plistlib.load(open(p,"rb")); d.update(CFBundleIdentifier=sys.argv[2],CFBundleShortVersionString=sys.argv[3],CFBundleVersion=sys.argv[3]); d["ElectronAsarIntegrity"]={"Resources/app.asar":{"algorithm":"SHA256","hash":sys.argv[4]}}; plistlib.dump(d,open(p,"wb"))',path.join(folder,'Contents/Info.plist'),bundleId,version,integrity]);
  run('/usr/bin/codesign',['--force','--sign',identity,'--options','runtime','--timestamp=none','--entitlements',path.join(studio,'apps/desktop/build/entitlements.direct.plist'),folder]);
  run('/usr/bin/codesign',['--verify','--deep','--strict',folder]);
 }
 await fixture(target,'0.0.2',`app.whenReady().then(()=>{app.setActivationPolicy('prohibited');let bundledUpdater=false;try{bundledUpdater=typeof require('electron-updater').MacUpdater==='function'}catch{}fs.writeFileSync(${JSON.stringify(result)},JSON.stringify({version:app.getVersion(),restarted:true,bundledUpdater,preferencesPreserved:preferences.get('/anonymous','desktop.notifications')==='false'&&preferences.get('/anonymous','photo-capture.folder.demo')==='匿名照片',draftPreserved:fs.readFileSync(${JSON.stringify(path.join(root,'profile','sentinel.txt'))},'utf8')==='anonymous draft kept'}));app.quit();});`);
 run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',target,path.join(root,'fixture.zip')]);
 const zip=await readFile(path.join(root,'fixture.zip'));
 const artifact={filename:`The-Way-Here-0.0.2-${process.arch}.zip`,size:zip.length,sha512:createHash('sha512').update(zip).digest('base64')};
 const official=`https://github.com/lihaozheCharlie/the-way-here/releases/download/mac-v0.0.2/${artifact.filename}`;
 metadata={version:'0.0.2',files:[{url:official,size:artifact.size,sha512:artifact.sha512}],path:official,sha512:artifact.sha512,releaseDate:new Date().toISOString()};
 const installerUrl=new URL('../apps/desktop/src/update-installer.mjs',import.meta.url).href,checkerUrl=new URL('../apps/desktop/src/updates.mjs',import.meta.url).href;
 await fixture(old,'0.0.1',`
 import {createMacInstaller} from ${JSON.stringify(installerUrl)};import {UpdateChecker} from ${JSON.stringify(checkerUrl)};
 app.whenReady().then(async()=>{app.setActivationPolicy('prohibited');preferences.set('/anonymous','desktop.notifications','false');preferences.set('/anonymous','photo-capture.folder.demo','匿名照片');let ready=false;const states=[];let checker;
 const installer=createMacInstaller({onError:e=>{fs.writeFileSync(${JSON.stringify(path.join(root,'error.txt'))},String(e.stack||e));checker?.installationFailed();},createUpdater:async()=>{let module;try{module=require('electron-updater')}catch(e){if(${JSON.stringify(requireBundled)})throw e;module=require(${JSON.stringify(updaterModule)})}const {MacUpdater}=module;const u=new MacUpdater({provider:'generic',url:${JSON.stringify(base)}});u.logger=null;const download=u.httpExecutor.download.bind(u.httpExecutor);u.httpExecutor.download=(url,dest,options)=>{if(url.href!==${JSON.stringify(official)})throw Error('Unexpected fixture download');return download(new URL(${JSON.stringify(base+'fixture.zip')}),dest,options)};return u;}});
 const feed={schemaVersion:1,version:'0.0.2',downloads:{[${JSON.stringify(process.arch)}]:{url:${JSON.stringify(`https://github.com/lihaozheCharlie/the-way-here/releases/download/mac-v0.0.2/The-Way-Here-0.0.2-${process.arch}.dmg`)},size:120,sha256:'a'.repeat(64),minimumSystemVersion:'13.0',installer:${JSON.stringify(artifact)}}}};
 checker=new UpdateChecker({version:app.getVersion(),arch:${JSON.stringify(process.arch)},systemVersion:process.getSystemVersion(),fetch:async()=>Response.json(feed),installer,canInstall:async()=>ready,onChange:state=>{states.push(state.status);fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify(states));}});
 try{await checker.check();await checker.download();if(await checker.installWhenReady())throw Error('Installed before ready');ready=true;await checker.installWhenReady();}catch(e){fs.writeFileSync(${JSON.stringify(path.join(root,'error.txt'))},String(e.stack||e));app.quit();}
 });`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(path.join(old,'Contents/MacOS/The Way Here'),[],{env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>childLogs.push(String(d)));child.stderr.on('data',d=>childLogs.push(String(d)));
 const deadline=Date.now()+90000;let outcome;
 while(Date.now()<deadline){
  const error=await readFile(path.join(root,'error.txt'),'utf8').catch(()=>null);if(error)throw Error(error);
  outcome=await readFile(result,'utf8').then(JSON.parse).catch(()=>null);if(outcome)break;
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(!outcome)throw Error('Native replacement timed out: '+childLogs.join('').slice(-3000));
 const states=JSON.parse(await readFile(trace,'utf8'));
 if(outcome.version!=='0.0.2'||!outcome.draftPreserved||!outcome.preferencesPreserved||!states.includes('ready')||!states.includes('installing'))throw Error('Native replacement failed');
 if(requireBundled&&!outcome.bundledUpdater)throw Error('Updater missing from packaged application');
 await mkdir(path.join(studio,'.runtime/update-ui'),{recursive:true});
 await writeFile(path.join(studio,'.runtime/update-ui/native-upgrade.json'),JSON.stringify({...outcome,signedFixtures:true,realSquirrelReplacement:true,states},null,2));
 console.log('Native upgrade passed: real signed replacement, automatic restart, readiness wait, anonymous draft and actual persisted preferences preserved.');
}finally{
 for(const pid of owned())try{process.kill(pid,'SIGTERM')}catch{}
 let deadline=Date.now()+5000;while(owned().some(alive)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
 for(const pid of owned().filter(alive))try{process.kill(pid,'SIGKILL')}catch{}
 await new Promise(resolve=>setTimeout(resolve,100));if(owned().some(alive))throw Error('Fixture processes remain');
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await rm(root,{recursive:true,force:true});for(const file of cachePaths)await rm(file,{recursive:true,force:true});
 console.log('Native fixture apps, processes, server, profile and caches cleaned up.');
}
