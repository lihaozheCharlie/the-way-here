// Real update components against an anonymous bridge, with no vault or backend.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studio=fileURLToPath(new URL('../',import.meta.url)), web=path.join(studio,'apps/web');
const html=path.join(web,'.update-ui-check.html'),source=path.join(web,'.update-ui-check.tsx');
let server,browser;
try {
  await writeFile(html,'<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/.update-ui-check.tsx"></script></html>',{flag:'wx'});
  await writeFile(source,`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {AppUpdateBanner,AppUpdatePreferences} from './src/features/desktop/AppUpdates';
    import './src/styles/theme-tokens.css';import './src/styles/base.css';import './src/features/desktop/preferences.css';
    createRoot(document.getElementById('root')).render(<main className="desktop-shell" style={{display:'block',padding:40,minHeight:'100vh',background:'var(--canvas)'}}><div style={{maxWidth:700,margin:'auto'}}><AppUpdateBanner/><div className="desktop-preferences"><AppUpdatePreferences/></div></div></main>);
  `,{flag:'wx'});
  server=spawn(process.execPath,[path.join(web,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5207','--strictPort'],{cwd:web,stdio:['ignore','pipe','pipe'],detached:true});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Vite startup timeout')),15000);server.once('exit',()=>{clearTimeout(timer);reject(Error('Vite exited'))});server.stdout.on('data',data=>{if(String(data).includes('5207')){clearTimeout(timer);resolve()}});server.stderr.on('data',data=>process.stderr.write(data));});
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    let state={version:'0.1.3',status:'idle'};const listeners=new Set();
    window.updateTest={downloads:0,emit:next=>{state={...state,...next};listeners.forEach(callback=>callback(state));}};
    window.desktop={getUpdateState:async()=>state,onUpdateState:callback=>{listeners.add(callback);return()=>listeners.delete(callback)},checkForUpdates:async()=>{window.updateTest.emit({status:'checking'});await new Promise(resolve=>setTimeout(resolve,200));window.updateTest.emit({status:'current'});return state;},downloadUpdate:async()=>{window.updateTest.downloads++;}};
  });
  await page.goto('http://127.0.0.1:5207/.update-ui-check.html');
  await expect(page.getByText('当前版本 0.1.3')).toBeVisible();
  await page.getByRole('button',{name:'检查更新',exact:true}).click();await expect(page.getByText('正在检查更新…')).toBeVisible();await expect(page.getByText('当前已是最新版本')).toBeVisible();
  await page.evaluate(()=>window.updateTest.emit({status:'available',latestVersion:'0.1.4',size:230000000,notes:{zh:'启动时自动检查更新。\n由你决定何时下载。',en:'Checks for updates at startup.\nYou choose when to download.'}}));
  await expect(page.getByRole('button',{name:'下载更新'})).toHaveCount(2);
  expect(await page.evaluate(()=>window.updateTest.downloads)).toBe(0);
  await page.locator('.app-update-banner').getByText('更新说明',{exact:true}).click();
  await page.locator('.app-update-banner').getByRole('button',{name:'下载更新'}).click();expect(await page.evaluate(()=>window.updateTest.downloads)).toBe(1);
  await mkdir(path.join(studio,'.runtime/update-ui'),{recursive:true});
  await page.screenshot({path:path.join(studio,'.runtime/update-ui/available-zh.png'),fullPage:true});
  await page.locator('.app-update-banner').getByRole('button',{name:'稍后',exact:true}).click();await expect(page.locator('.app-update-banner')).toHaveCount(0);await expect(page.getByRole('button',{name:'下载更新'})).toHaveCount(1);
  await page.evaluate(()=>window.updateTest.emit({status:'incompatible',minimumSystemVersion:'27.0'}));await expect(page.getByText('新版需要 macOS 27.0 或更新版本')).toBeVisible();await expect(page.getByRole('button',{name:'下载更新'})).toHaveCount(0);
  await page.evaluate(()=>window.updateTest.emit({status:'error'}));await expect(page.getByText('暂时无法检查更新，请稍后重试。')).toBeVisible();await expect(page.getByRole('button',{name:'检查更新',exact:true})).toBeEnabled();
  await page.evaluate(()=>localStorage.setItem('desktop.locale','en'));await page.reload();await expect(page.getByRole('button',{name:'Check for updates',exact:true})).toBeVisible();
  await page.evaluate(()=>window.updateTest.emit({status:'available',latestVersion:'0.1.4',size:230000000,notes:{zh:'测试',en:'A small update.\n<img src=x onerror=alert(1)>'}}));
  await expect(page.locator('.app-update-preferences').getByText('Version 0.1.4 is available')).toBeVisible();await expect(page.locator('.app-update-notes img')).toHaveCount(0);
  await page.screenshot({path:path.join(studio,'.runtime/update-ui/available-en.png'),fullPage:true});
  expect(errors).toEqual([]);console.log('Update UI passed: check/current/offline/incompatible, automatic banner, click-only download, dismiss, English and safe release notes.');
} finally {
  await browser?.close();
  if(server && server.exitCode===null){const exited=once(server,'exit');process.kill(-server.pid,'SIGTERM');const timer=setTimeout(()=>{try{process.kill(-server.pid,'SIGKILL')}catch{}},5000);await exited;clearTimeout(timer);}
  for(const file of [html,source])await unlink(file).catch(()=>{});
}
