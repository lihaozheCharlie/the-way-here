// Real components and update-readiness hooks against an anonymous desktop bridge.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studio=fileURLToPath(new URL('../',import.meta.url)),web=path.join(studio,'apps/web');
const html=path.join(web,'.update-ui-check.html'),source=path.join(web,'.update-ui-check.tsx');
let server,browser;
try {
 await writeFile(html,'<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/.update-ui-check.tsx"></script></html>',{flag:'wx'});
 await writeFile(source,`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {AppUpdateSidebar,AppUpdatePreferences} from './src/features/desktop/AppUpdates';
 import {useUpdateGuard,useUpdatePreparation} from './src/shared/update-readiness';
 import {Icon} from './src/shared/ui';import {useI18n} from './src/shared/i18n';
 import './src/styles/theme-tokens.css';import './src/styles/base.css';import './src/styles/archive-foundation.css';import './src/styles/desktop.css';import './src/styles/desktop-redesign.css';import './src/features/desktop/preferences.css';
 function Harness(){const {t}=useI18n();useUpdatePreparation();useUpdateGuard(()=>!window.updateTest.blocked);return <main className="desktop-shell" style={{display:'grid',gridTemplateColumns:'220px 1fr',gridTemplateRows:'1fr',height:'100vh'}}><aside className="desktop-sidebar" style={{gridRow:1,padding:12}}><h2 style={{fontSize:17}}>The Way Here</h2><nav className="desktop-navigation"><p>{t('生活记录')}</p><p>{t('已有理解')}</p></nav><div className="desktop-sidebar-bottom"><div className="desktop-settings-row"><button><Icon name="controls" size={16}/><span>{t('偏好设置')}</span></button><AppUpdateSidebar/></div></div></aside><div className="desktop-preferences" style={{padding:40,overflow:'auto'}}><AppUpdatePreferences/></div></main>};
 createRoot(document.getElementById('root')).render(<Harness/>);
 `,{flag:'wx'});
 server=spawn(process.execPath,[path.join(web,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5207','--strictPort'],{cwd:web,stdio:['ignore','pipe','pipe'],detached:true});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Vite startup timeout')),15000);server.once('exit',()=>{clearTimeout(timer);reject(Error('Vite exited'))});server.stdout.on('data',data=>{if(String(data).includes('5207')){clearTimeout(timer);resolve()}});server.stderr.on('data',data=>process.stderr.write(data));});
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1380,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  let state={version:'0.1.7',status:'idle'},prepare,resume;const listeners=new Set();
  window.updateTest={downloads:0,blocked:true,prepare:()=>prepare(),resume:()=>resume(),emit:next=>{state={...state,...next};listeners.forEach(callback=>callback(state));}};
  window.desktop={getUpdateState:async()=>state,onUpdateState:callback=>{listeners.add(callback);return()=>listeners.delete(callback)},checkForUpdates:async()=>{window.updateTest.emit({status:'current'});return state},downloadUpdate:async()=>{window.updateTest.downloads++;if(window.updateTest.rejectDownload)throw Error('bridge failed');window.updateTest.emit({status:'downloading',progress:0})},onPrepareUpdate:callback=>{prepare=callback;return()=>{}},onResumeAfterUpdate:callback=>{resume=callback;return()=>{}}};
 });
 await page.goto('http://127.0.0.1:5207/.update-ui-check.html');
 await page.getByRole('button',{name:'检查更新',exact:true}).click();await expect(page.getByText('当前已是最新版本')).toBeVisible();
 await page.evaluate(()=>window.updateTest.emit({status:'available',latestVersion:'0.1.8',size:230000000,notes:{zh:'匿名更新说明',en:'Synthetic update notes'}}));
 const sidebar=page.locator('.desktop-sidebar-bottom');
 await expect(sidebar.getByRole('button',{name:'下载更新',exact:true})).toBeVisible();
 await expect(sidebar.locator('.sidebar-update-button svg')).toBeVisible();
 const updateShape=await sidebar.locator('.sidebar-update-button').evaluate(el=>{const box=el.getBoundingClientRect(),style=getComputedStyle(el);return {width:box.width,height:box.height,radius:style.borderRadius,background:style.backgroundColor,text:el.textContent}});
 expect(updateShape).toEqual({width:40,height:40,radius:'50%',background:'rgb(10, 124, 255)',text:''});
 expect(await page.evaluate(()=>window.updateTest.downloads)).toBe(0);
 await mkdir(path.join(studio,'.runtime/update-ui'),{recursive:true});
 await page.screenshot({path:path.join(studio,'.runtime/update-ui/sidebar-available-zh.png'),fullPage:true});
 await sidebar.screenshot({path:path.join(studio,'.runtime/update-ui/sidebar-cloud-download.png')});
 await page.evaluate(()=>window.updateTest.rejectDownload=true);
 await sidebar.getByRole('button',{name:'下载更新',exact:true}).click();await expect(sidebar.getByRole('button',{name:'重试下载',exact:true})).toBeVisible();
 await page.screenshot({path:path.join(studio,'.runtime/update-ui/sidebar-error-zh.png'),fullPage:true});
 await page.evaluate(()=>window.updateTest.rejectDownload=false);
 await sidebar.getByRole('button',{name:'重试下载',exact:true}).click();expect(await page.evaluate(()=>window.updateTest.downloads)).toBe(2);
 await page.evaluate(()=>window.updateTest.emit({status:'downloading',progress:42}));await expect(sidebar.getByRole('button',{name:'下载中 42%',exact:true})).toBeDisabled();
 await page.screenshot({path:path.join(studio,'.runtime/update-ui/sidebar-downloading-zh.png'),fullPage:true});
 await page.evaluate(()=>window.updateTest.emit({status:'ready',progress:100}));expect(await page.evaluate(()=>window.updateTest.prepare())).toBe(false);expect(await page.evaluate(()=>document.body.inert)).toBe(false);
 await page.evaluate(()=>window.updateTest.blocked=false);expect(await page.evaluate(()=>window.updateTest.prepare())).toBe(true);expect(await page.evaluate(()=>document.body.inert)).toBe(true);
 await page.evaluate(()=>window.updateTest.resume());expect(await page.evaluate(()=>document.body.inert)).toBe(false);
 await page.evaluate(()=>window.updateTest.emit({status:'download-error'}));await expect(sidebar.getByRole('button',{name:'重试下载',exact:true})).toBeEnabled();
 await page.evaluate(()=>window.updateTest.emit({status:'incompatible',minimumSystemVersion:'27.0'}));await expect(page.getByText('新版需要 macOS 27.0 或更新版本')).toBeVisible();await expect(sidebar.locator('.sidebar-update')).toHaveCount(0);
 await page.evaluate(()=>localStorage.setItem('desktop.locale','en'));await page.reload();
 await page.evaluate(()=>window.updateTest.emit({status:'available',latestVersion:'0.1.8',size:230000000,notes:{zh:'测试',en:'Synthetic notes <img src=x onerror=alert(1)>'}}));
 await expect(sidebar.getByRole('button',{name:'Download update',exact:true})).toBeVisible();await expect(page.locator('.app-update-notes img')).toHaveCount(0);
 await page.screenshot({path:path.join(studio,'.runtime/update-ui/sidebar-available-en.png'),fullPage:true});
 await page.evaluate(()=>window.updateTest.emit({status:'ready'}));await page.screenshot({path:path.join(studio,'.runtime/update-ui/sidebar-ready-en.png'),fullPage:true});
 await page.evaluate(()=>window.updateTest.emit({status:'install-error'}));await expect(sidebar.getByRole('button',{name:'Retry install',exact:true})).toBeVisible();
 await page.screenshot({path:path.join(studio,'.runtime/update-ui/sidebar-install-error-en.png'),fullPage:true});
 for(const width of [1000,1380]){await page.setViewportSize({width,height:900});const overflow=await sidebar.evaluate(el=>el.scrollWidth>el.clientWidth);expect(overflow).toBe(false);}
 expect(errors).toEqual([]);console.log('Update UI passed: sidebar placement, progress, explicit download, retry, readiness guard, English and safe notes.');
} finally {
 await browser?.close();
 if(server&&server.exitCode===null){const exited=once(server,'exit');process.kill(-server.pid,'SIGTERM');const timer=setTimeout(()=>{try{process.kill(-server.pid,'SIGKILL')}catch{}},5000);await exited;clearTimeout(timer);}
 for(const file of [html,source])await unlink(file).catch(()=>{});
}
