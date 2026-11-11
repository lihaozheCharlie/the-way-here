import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, cp, writeFile, readFile, rm, realpath, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';import path from 'node:path';import { fileURLToPath } from 'node:url';
import { launchInstalledApp } from './installed-app-session.mjs';
import { UserPreferences } from '../apps/desktop/src/user-preferences.mjs';
const studio=fileURLToPath(new URL('../',import.meta.url));
const installedApp=process.argv[2];
if(installedApp&&(!path.isAbsolute(installedApp)||!installedApp.endsWith('.app')))throw Error('Pass an absolute installed app path');
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'twh-preference-validation-'))),profile=path.join(root,'profile');
let app,stateRoot;const observed=new Set();
const env={...process.env,THE_WAY_HERE_VAULT:root,THE_WAY_HERE_KNOWLEDGE_BASE:'demo'};delete env.ELECTRON_RUN_AS_NODE;delete env.THE_WAY_HERE_DEV;
async function launch(){
 let page;
 if(installedApp){
  app=await launchInstalledApp(path.join(installedApp,'Contents/MacOS/The Way Here'),profile,env);
  page=app.page;
 }else{
  app=await electron.launch({args:[path.join(studio,'apps/desktop'),'--diagnostics',`--user-data-dir=${profile}`],env,timeout:60000});
  for(const pid of await app.evaluate(({app})=>app.getAppMetrics().map(x=>x.pid)))observed.add(pid);
  expect(await app.evaluate(({app})=>app.getPath('sessionData'))).toBe(profile);
  expect(await app.evaluate(({session})=>session.defaultSession.getStoragePath())).toBe(profile);
  page=await app.firstWindow();
 }
 page.setDefaultTimeout(15000);await page.waitForURL('https://workspace-*.localhost/**');
 const policy=await page.evaluate(()=>fetch('/api/storage/policy').then(r=>r.json()));
 const stateKey=createHash('sha256').update(root).digest('hex').slice(0,16);
 if(path.basename(policy.stateRoot)!==stateKey||path.basename(path.dirname(policy.stateRoot))!=='vaults')throw Error('Unexpected test state location');
 stateRoot=policy.stateRoot;return page;
}
async function close(){if(app){await app.close();app=undefined;}}
try{
 await cp(path.join(studio,'../vault/demo'),path.join(root,'vault/demo'),{recursive:true});
 await cp(path.join(studio,'../knowledge-engine'),path.join(root,'knowledge-engine'),{recursive:true});
 await writeFile(path.join(root,'AGENTS.md'),'Anonymous preference retention verification.');
 await writeFile(path.join(root,'the-way-here.config.yaml'),'version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    name: 匿名配置验收\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\nagents:\n  runtimes:\n    codex:\n      enabled: false\n    pi:\n      enabled: false\nvalidation:\n  commands: []\n');
 // The installed renderer cannot resize the native window. Verify that the
 // signed app restores a persisted choice before and after restart.
 if(installedApp) new UserPreferences(profile).set(root,'desktop.window.main',JSON.stringify({x:40,y:40,width:1120,height:760}));
 let page=await launch();await page.evaluate(()=>window.desktop.writePreference('the-way-here.model-onboarding.dismissed','true'));await page.reload();
 if(installedApp) await expect.poll(()=>page.evaluate(()=>window.outerWidth)).toBe(1120);
 const origin=new URL(page.url()).origin;
 await page.evaluate(()=>fetch('/api/sources/folders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({knowledgeBaseId:'demo',folder:'持久保存'})}).then(async r=>{if(!r.ok)throw Error(await r.text());}));
 await page.goto(origin+'/capture');await page.locator('.capture-destination').first().click();
 const dialog=page.getByRole('dialog',{name:'保存位置',exact:true});await dialog.locator('input[type=radio][value="持久保存"]').check();await dialog.getByRole('button',{name:'确定',exact:true}).click();
 await expect(page.locator('.capture-destination strong').first()).toHaveText('持久保存');
 await page.goto(origin+'/preferences');await page.getByRole('switch').uncheck();
 await page.evaluate(()=>{window.desktop.writePreference('photo-capture.folder.demo','匿名照片目录');window.desktop.writePreference('the-way-here.agent-panel-width','480');window.desktop.writePreference('the-way-here.import-route','photo');});
 if(!installedApp) await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1120,height:760}));
 await expect.poll(async()=>JSON.parse(await readFile(path.join(profile,'user-preferences.json'),'utf8')).values['global:desktop.window.main']?.value).toContain('1120');
 await page.getByRole('tab',{name:'English',exact:true}).click();await expect(page.getByRole('heading',{name:'Preferences',exact:true})).toBeVisible();
 if(installedApp) await page.evaluate(()=>localStorage.clear());
 else await app.evaluate(({session})=>session.defaultSession.clearStorageData({storages:['localstorage']}));
 await close();
 page=await launch();await page.goto(new URL('/preferences',page.url()).href);
 await expect(page.getByRole('heading',{name:'Preferences',exact:true})).toBeVisible();await expect(page.getByRole('switch')).not.toBeChecked();
 expect(await page.evaluate(()=>['photo-capture.folder.demo','the-way-here.agent-panel-width','the-way-here.import-route'].map(k=>window.desktop.readPreference(k)))).toEqual(['匿名照片目录','480','photo']);
 await expect.poll(()=>installedApp?page.evaluate(()=>window.outerWidth):app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNormalBounds().width)).toBe(1120);
 expect((await page.evaluate(()=>fetch('/api/capture/history?knowledgeBaseId=demo').then(r=>r.json()))).defaultFolder).toBe('持久保存');
 await page.goto(new URL('/capture',page.url()).href);await expect(page.locator('.capture-destination strong').first()).toHaveText('持久保存');
 await mkdir(path.join(studio,'.runtime/preference-verification'),{recursive:true});await writeFile(path.join(studio,'.runtime/preference-verification/result.json'),JSON.stringify({passed:true,restart:true,chromiumStorageCleared:true,isolatedSessionData:true,defaultFolder:true,notifications:true,locale:true,photoFolder:true,importRoute:true,panelWidth:true,windowDimensions:true},null,2));
 console.log('Preference retention passed: real capture selection, notifications, language, photo destination, import route, panel/window dimensions survive storage loss and restart.');
}finally{
 await close().catch(()=>{});const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
 for(const pid of observed)if(alive(pid))try{process.kill(pid,'SIGTERM');}catch{}
 const deadline=Date.now()+5000;while([...observed].some(alive)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
 if([...observed].some(alive))throw Error('Preference verification processes remain');
 if(stateRoot)await rm(stateRoot,{recursive:true,force:true});await rm(root,{recursive:true,force:true});console.log('Preference test app, processes and anonymous state cleaned up.');
}
