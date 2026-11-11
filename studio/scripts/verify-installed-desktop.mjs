// Install the real DMG into an isolated Applications folder and launch its executable.
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, cp, rm, writeFile, realpath, readFile, readdir, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchInstalledApp } from './installed-app-session.mjs';
const studio=fileURLToPath(new URL('../',import.meta.url));
const dmg=process.argv[2];
if(!dmg || !path.isAbsolute(dmg))throw Error('Pass the absolute path to the final DMG or installed app');
const existingApp=dmg.endsWith('.app');
const preflight=process.argv.includes('--preflight');
if(preflight&&!existingApp)throw Error('Preflight is only for a local app before notarization; DMG acceptance always checks the ticket');
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'twh-installed-startup-')));
const mount=path.join(root,'mount'),installed=existingApp ? dmg : path.join(root,'Applications','The Way Here.app');
let mounted=false,app,stateRoot;const errors=[];
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8'});if(result.status!==0)throw Error(`${command}: ${result.stderr}`);return result.stdout;}
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
  const profile=path.join(root,'profile');
  app=await launchInstalledApp(path.join(installed,'Contents/MacOS/The Way Here'),profile,env);
  const {page}=app;
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  // Prove session isolation with actual renderer data, without assuming a
  // Chromium-version-specific Preferences or Default directory layout.
  const sessionMarker='anonymous-session-'+randomUUID();
  await page.evaluate(marker=>localStorage.setItem('anonymous-installed-session-proof',marker),sessionMarker);
  await page.waitForURL('https://workspace-*.localhost/**');
  await expect(page.locator('main h1').first()).toBeVisible();
  const policy=await page.evaluate(()=>fetch('/api/storage/policy').then(async r=>{if(!r.ok)throw Error('Local API unavailable');return r.json()}));
  const workspace=path.join(profile,'workspace');
  const stateKey=createHash('sha256').update(workspace).digest('hex').slice(0,16);
  if(path.basename(policy.stateRoot)!==stateKey||path.basename(path.dirname(policy.stateRoot))!=='vaults')throw Error('Unexpected test state location');
  stateRoot=policy.stateRoot;
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
  try { await app?.close(); }
  finally { if(mounted)run('hdiutil',['detach',mount]); }
  if(stateRoot)await rm(stateRoot,{recursive:true,force:true});
  await rm(root,{recursive:true,force:true});
  console.log('Installed-app test processes, profile and mounted disk cleaned up.');
}
