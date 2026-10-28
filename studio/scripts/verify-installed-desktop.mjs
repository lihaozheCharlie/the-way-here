// Install the real DMG into an isolated Applications folder and launch its executable.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, cp, rm, writeFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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
let mounted=false,app;const errors=[];let observed=[];
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8'});if(result.status!==0)throw Error(`${command}: ${result.stderr}`);return result.stdout;}
function alive(pid){try{process.kill(pid,0);return true}catch{return false}}
function ownedProcesses(){
  const result=spawnSync('ps',['-Ao','pid=,args=']);
  return result.stdout.toString('utf8').split('\n').filter(line=>line.includes(root)&&!line.trim().startsWith(String(process.pid)+' ')).map(line=>Number(line.trim().split(/\s+/)[0])).filter(Number.isSafeInteger);
}
try{
  if(!existingApp){
    await mkdir(mount);await mkdir(path.dirname(installed));
    run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);mounted=true;
    await cp(path.join(mount,'The Way Here.app'),installed,{recursive:true,verbatimSymlinks:true});
    run('hdiutil',['detach',mount]);mounted=false;
  }
  run('codesign',['--verify','--deep','--strict',installed]);
  if(!preflight){
    run('xcrun',['stapler','validate',installed]);
    run('/usr/sbin/spctl',['--assess','--type','execute',installed]);
  }
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.THE_WAY_HERE_VAULT;delete env.THE_WAY_HERE_DEV;delete env.THE_WAY_HERE_KNOWLEDGE_BASE;
  app=await electron.launch({executablePath:path.join(installed,'Contents/MacOS/The Way Here'),args:['--diagnostics',`--user-data-dir=${path.join(root,'profile')}`],env,timeout:30000});
  observed=await app.evaluate(({app})=>app.getAppMetrics().map(item=>item.pid));
  const profile=await app.evaluate(({app})=>app.getPath('userData'));
  if(profile!==path.join(root,'profile'))throw Error('The test did not use its isolated user profile');
  if(await app.evaluate(({app})=>app.getPath('sessionData'))!==profile)throw Error('Chromium storage did not use the isolated user profile');
  const page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.waitForURL('https://workspace-*.localhost/**');
  await expect(page.locator('main h1').first()).toBeVisible();
  const policy=await page.evaluate(()=>fetch('/api/storage/policy').then(async r=>{if(!r.ok)throw Error('Local API unavailable');return r.json()}));
  if(!policy.stateRoot)throw Error('Local runtime did not return its storage policy');
  const origin=new URL(page.url()).origin;
  await page.goto(origin+'/preferences');
  await expect(page.getByRole('heading',{name:'偏好设置',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'English',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Preferences',exact:true})).toBeVisible();
  await expect.poll(()=>app.evaluate(({Menu})=>Menu.getApplicationMenu().items.map(item=>item.label))).toContain('File');
  const state=await page.evaluate(()=>window.desktop.getUpdateState());
  const version=await app.evaluate(({app})=>app.getVersion());
  if(state.version!==version || state.status==='disabled')throw Error('Production update bridge unavailable');
  await mkdir(path.join(studio,'.runtime/installed-verification'),{recursive:true});
  await page.screenshot({path:path.join(studio,'.runtime/installed-verification',`preferences-${version}.png`),fullPage:true});
  await page.getByRole('tab',{name:'Chinese',exact:true}).click();
  await expect(page.getByRole('heading',{name:'偏好设置',exact:true})).toBeVisible();
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(path.join(studio,'.runtime/installed-verification/result.json'),JSON.stringify({version,passed:true,notarizationVerified:!preflight,checks:[existingApp?'installed-app':'copied-from-dmg',preflight?'signature-preflight':'signature-and-ticket','fresh-user-profile','first-window','local-api','preferences','english-native-menu','chinese-restored','production-update-bridge']},null,2));
  console.log(`Installed ${version} passed: real app startup, local API, Chinese/English UI and native menus, production update bridge.`);
}finally{
  if(app){observed=await app.evaluate(({app})=>app.getAppMetrics().map(item=>item.pid)).catch(()=>observed);await app.close().catch(()=>{});}
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
