// Install the real DMG into an isolated Applications folder and launch its executable.
import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, cp, rm, writeFile, realpath, readFile, readdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studio=fileURLToPath(new URL('../',import.meta.url));
const dmg=process.argv[2];
if(!dmg || !path.isAbsolute(dmg))throw Error('Pass the absolute path to the final DMG or installed app');
const existingApp=dmg.endsWith('.app');
const preflight=process.argv.includes('--preflight');
if(preflight&&!existingApp)throw Error('Preflight is only for a local app before notarization; DMG acceptance always checks the ticket');
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'twh-installed-startup-')));
const mount=path.join(root,'mount'),installed=existingApp ? dmg : path.join(root,'Applications','The Way Here.app');
let mounted=false,browser,child;const errors=[];let observed=[];
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8'});if(result.status!==0)throw Error(`${command}: ${result.stderr}`);return result.stdout;}
function alive(pid){try{process.kill(pid,0);return true}catch{return false}}
async function profileContains(directory,marker){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    try{
      if(entry.isDirectory()&&await profileContains(file,marker))return true;
      if(entry.isFile()&&(await stat(file)).size<16*1024*1024){const bytes=await readFile(file);if(bytes.includes(Buffer.from(marker))||bytes.includes(Buffer.from(marker,'utf16le')))return true;}
    }catch(error){if(error.code!=='ENOENT')throw error}
  }
  return false;
}
function ownedProcesses(){
  const result=spawnSync('ps',['-Ao','pid=,pgid=,args=']);
  return result.stdout.toString('utf8').split('\n').flatMap(line=>{
    const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if(!match)return [];
    const pid=Number(match[1]),group=Number(match[2]);
    return pid!==process.pid&&(line.includes(root)||group===child?.pid)?[pid]:[];
  });
}
try{
  if(!existingApp){
    await mkdir(mount);await mkdir(path.dirname(installed));
    run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);mounted=true;
    await cp(path.join(mount,'The Way Here.app'),installed,{recursive:true,verbatimSymlinks:true});
    run('hdiutil',['detach',mount]);mounted=false;
  }
  run('codesign',['--verify','--deep','--strict',installed]);
  const require=createRequire(import.meta.url);
  const builderRequire=createRequire(require.resolve('app-builder-lib',{paths:[path.dirname(require.resolve('electron-builder/package.json'))]}));
  const {getCurrentFuseWire,FuseV1Options}=builderRequire('@electron/fuses');
  const wire=await getCurrentFuseWire(installed);
  for(const [name,enabled] of [['RunAsNode',false],['EnableNodeOptionsEnvironmentVariable',false],['EnableNodeCliInspectArguments',false],['EnableEmbeddedAsarIntegrityValidation',true],['OnlyLoadAppFromAsar',true]]){
    if(wire[FuseV1Options[name]]!==(enabled?49:48))throw Error(`Installed app has an unexpected ${name} fuse`);
  }
  if(!preflight){
    run('xcrun',['stapler','validate',installed]);
    run('/usr/sbin/spctl',['--assess','--type','execute',installed]);
  }
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.THE_WAY_HERE_VAULT;delete env.THE_WAY_HERE_DEV;delete env.THE_WAY_HERE_KNOWLEDGE_BASE;
  // Production disables Node inspection. Attach only to Chromium's renderer,
  // using a temporary loopback endpoint and an isolated profile, never --inspect.
  const profile=path.join(root,'profile');
  child=spawn(path.join(installed,'Contents/MacOS/The Way Here'),['--diagnostics',`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0'],{env,stdio:'ignore',detached:true});
  let launchError;child.on('error',error=>{launchError=error});
  observed=[child.pid].filter(Number.isSafeInteger);
  let endpoint;
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
    if(launchError)throw launchError;
    if(child.exitCode!==null||child.signalCode!==null)throw Error(`Installed app exited before its window opened (${child.exitCode??child.signalCode})`);
    try{const [port,route]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');if(!/^\d+$/.test(port)||!route?.startsWith('/devtools/browser/'))throw Error('Invalid temporary renderer endpoint');endpoint=`ws://127.0.0.1:${port}${route}`;break}catch(error){if(error.code!=='ENOENT')throw error}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!endpoint)throw Error('The isolated installed app did not expose its renderer endpoint');
  browser=await chromium.connectOverCDP(endpoint);
  let page;
  await expect.poll(()=>{page=browser.contexts()[0]?.pages().find(item=>item.url().startsWith('https://workspace-'));return Boolean(page)},{timeout:30000}).toBe(true);
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  // Prove session isolation with actual renderer data, without assuming a
  // Chromium-version-specific Preferences or Default directory layout.
  const sessionMarker='anonymous-session-'+randomUUID();
  await page.evaluate(marker=>localStorage.setItem('anonymous-installed-session-proof',marker),sessionMarker);
  await page.waitForURL('https://workspace-*.localhost/**');
  await expect(page.locator('main h1').first()).toBeVisible();
  const policy=await page.evaluate(()=>fetch('/api/storage/policy').then(async r=>{if(!r.ok)throw Error('Local API unavailable');return r.json()}));
  if(!policy.stateRoot)throw Error('Local runtime did not return its storage policy');
  const origin=new URL(page.url()).origin;
  await page.goto(origin+'/preferences');
  await expect(page.getByRole('heading',{name:'偏好设置',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'English',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Preferences',exact:true})).toBeVisible();
  await expect.poll(async()=>JSON.parse(await readFile(path.join(profile,'user-preferences.json'),'utf8')).values['global:desktop.locale']?.value).toBe('en');
  const state=await page.evaluate(()=>window.desktop.getUpdateState());
  const version=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(installed,'Contents/Info.plist')]).trim();
  if(state.version!==version || state.status==='disabled')throw Error('Production update bridge unavailable');
  await mkdir(path.join(studio,'.runtime/installed-verification'),{recursive:true});
  await page.screenshot({path:path.join(studio,'.runtime/installed-verification',`preferences-${version}.png`),fullPage:true});
  await page.getByRole('tab',{name:'Chinese',exact:true}).click();
  await expect(page.getByRole('heading',{name:'偏好设置',exact:true})).toBeVisible();
  await expect.poll(()=>profileContains(profile,sessionMarker),{timeout:15000}).toBe(true);
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(path.join(studio,'.runtime/installed-verification/result.json'),JSON.stringify({version,passed:true,notarizationVerified:!preflight,nativeMenusVerified:false,checks:[existingApp?'installed-app':'copied-from-dmg',preflight?'signature-preflight':'signature-and-ticket','production-fuses','isolated-profile-and-chromium-storage','first-window','local-api','preferences','english-persisted','chinese-restored','production-update-bridge']},null,2));
  console.log(`Installed ${version} passed: real app startup, local API, Chinese/English UI and persisted preferences, production update bridge. Native menus require separate native UI acceptance.`);
}finally{
  await browser?.close().catch(()=>{});
  // Every process in this group descends from this test's detached spawn.
  if(child?.pid){try{process.kill(-child.pid,'SIGTERM')}catch{}}
  let remaining=[...new Set([...observed,...ownedProcesses()])].filter(alive);
  for(const pid of remaining){try{process.kill(pid,'SIGTERM')}catch{}}
  const deadline=Date.now()+5000;
  while(remaining.some(alive)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  for(const pid of remaining.filter(alive)){try{process.kill(pid,'SIGKILL')}catch{}}
  await new Promise(resolve=>setTimeout(resolve,100));
  remaining=[...new Set([...remaining,...ownedProcesses()])].filter(alive);
  if(mounted)run('hdiutil',['detach',mount]);
  if(remaining.length)throw Error(`Test processes did not exit: ${remaining.join(',')}`);
  await rm(root,{recursive:true,force:true});
  console.log('Installed-app test processes, profile and mounted disk cleaned up.');
}
