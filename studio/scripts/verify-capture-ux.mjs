// Anonymous browser checks of the real capture components; no live service or vault data.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const studio = fileURLToPath(new URL('../', import.meta.url));
const web = path.join(studio,'apps/web');
const html = path.join(web,'.capture-ux-check.html'), source = path.join(web,'.capture-ux-check.tsx');
let server, browser;
const entries = new Map(); let defaultFolder='随手记', saveCount=0, run;
const folders=['随手记','日常片段','日记2024至今'];
try {
  await writeFile(html,'<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/.capture-ux-check.tsx"></script></html>',{flag:'wx'});
  await writeFile(source,`
    import React from 'react'; import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
    import {LifeRecordCapture} from './src/features/overview/LifeRecordCapture';
    import './src/styles/theme-tokens.css'; import './src/styles/base.css';import './src/styles/form-controls.css';import './src/styles/desktop.css';import './src/styles/desktop-redesign.css';
    createRoot(document.getElementById('root')).render(<MemoryRouter><main className="desktop-shell" style={{display:'block',padding:60,minHeight:'100vh',background:'var(--canvas)'}}><div style={{maxWidth:920,margin:'0 auto'}}><LifeRecordCapture knowledgeBaseId="anonymous" /></div></main></MemoryRouter>);
  `,{flag:'wx'});
  server = spawn(process.execPath,[path.join(web,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5199','--strictPort'],{cwd:web,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Vite did not start')),15000);server.once('exit',()=>{clearTimeout(timer);reject(Error('Vite exited before ready'));});server.stdout.on('data',data=>{if(String(data).includes('5199')){clearTimeout(timer);resolve();}});server.stderr.on('data',data=>process.stderr.write(data));});
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const events={};window.captureTest={emit:(name,value)=>(events[name]||[]).forEach(fn=>fn(value))};
    const listen=name=>fn=>{(events[name] ||= []).push(fn);return()=>events[name]=events[name].filter(v=>v!==fn);};
    window.desktop={startSpeech:async()=>window.captureTest.emit('backup'),pauseSpeech:async()=>{},stopSpeech:async discard=>{await new Promise(r=>setTimeout(r,700));return discard?'':'精确识别的完整文字，带有标点。';},revealSpeechRecording:async()=>{},onSpeechLevel:listen('level'),onSpeechTranscript:listen('text'),onSpeechProgress:listen('progress'),onSpeechWarning:listen('warning'),onSpeechBackup:listen('backup'),onSpeechEnded:listen('ended')};
  });
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();let result={};
    if(url.pathname==='/api/capture/history') result={entries:[...entries.values()],defaultFolder};
    else if(url.pathname==='/api/capture/draft'){
      const existing=entries.get(body.id);expect(body.revision).toBe(existing?.revision||0);
      result={...existing,...body,status:existing?.status||'draft',revision:body.revision+1,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}; entries.set(body.id,result);
    } else if(url.pathname==='/api/capture/default-folder') {defaultFolder=body.folder;result={defaultFolder};}
    else if(url.pathname.startsWith('/api/capture/history/')) {const id=url.pathname.split('/').at(-1);expect(body.revision).toBe(entries.get(id).revision);entries.delete(id);result={ok:true};}
    else if(url.pathname==='/api/sources/folders') { if(request.method()==='POST') {folders.push(body.folder);result={folder:body.folder};} else result=folders.map(path=>({path})); }
    else if(url.pathname==='/api/runs') {
      const target=body.outputTarget,entry=entries.get(target.captureId);expect(target.captureRevision).toBe(entry.revision);expect(target.originalText).toBe(entry.text);saveCount++;
      Object.assign(entry,{status:'saved',originalText:entry.text,content:'# 当天日记\n\n'+entry.text,pageId:entry.pageId||'source-anonymous-diary',revision:entry.revision+1});
      run={id:'anonymous-run-'+saveCount,status:'completed',knowledgeBaseId:'anonymous',outputTarget:target,result:{outputPageId:entry.pageId}};result={...run,status:'running'};
    } else if(url.pathname.startsWith('/api/runs/')) result=run;
    await route.fulfill({json:result});
  });
  await page.goto('http://127.0.0.1:5199/.capture-ux-check.html');
  const editor=page.getByRole('textbox',{name:'此刻的记录',exact:true});
  await expect(page.getByRole('button',{name:'说一段',exact:true})).toBeEnabled();
  expect((await page.getByRole('button',{name:'整理并保存',exact:true}).boundingBox()).x).toBeGreaterThan(900);
  await page.screenshot({path:'/tmp/capture-ux-empty.png'});
  await editor.fill('已有文字。');await editor.press('End');
  await page.getByRole('button',{name:'接着说',exact:true}).click();
  await page.evaluate(()=>{window.captureTest.emit('text','临时识别的第一句，没有校准');window.captureTest.emit('level',.7);});
  await expect(page.locator('.capture-temporary-text')).toHaveText('临时识别的第一句，没有校准');
  await expect(page.getByText('预览：')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'整理并保存',exact:true})).toBeDisabled();
  const strip = await page.locator('.capture-listening').boundingBox(), actions = await page.locator('.capture-action-row').boundingBox();
  expect(actions.y).toBeGreaterThanOrEqual(strip.y+strip.height);
  expect(strip.width).toBeGreaterThan(800);
  await page.screenshot({path:'/tmp/capture-ux-recording.png'});
  await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.getByText('录音已暂停')).toBeVisible();
  await page.getByRole('button',{name:'继续录音',exact:true}).click();
  await page.getByRole('button',{name:'完成录音',exact:true}).click();
  await expect(page.getByText('正在精确识别…')).toBeVisible();
  await expect(editor).toHaveValue('已有文字。精确识别的完整文字，带有标点。');
  await page.getByRole('button',{name:'暂存',exact:true}).click();await expect(editor).toHaveValue('');
  await page.getByRole('button',{name:/历史记录/}).click();await page.getByRole('button',{name:'恢复续写',exact:true}).click();
  await expect(editor).toHaveValue('已有文字。精确识别的完整文字，带有标点。');
  await expect(page.getByText('草稿已恢复，可编辑或接着说')).toBeVisible();
  await expect(page.getByText('恢复草稿', {exact:false})).toHaveCount(0);
  await expect(page.getByText(/Ctrl|⌘/)).toHaveCount(0);
  await page.screenshot({path:'/tmp/capture-ux-restored.png'});
  await expect(page.getByText('整理成文，保留原话',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/保存到/}).click();
  const folderDialog=page.getByRole('dialog',{name:'保存位置',exact:true});
  await expect(folderDialog).toBeVisible();
  await expect(folderDialog.getByRole('radio',{name:/随手记/})).toBeChecked();
  await expect(folderDialog.getByText('默认',{exact:true})).toHaveCount(1);
  await folderDialog.getByRole('radio',{name:'日常片段',exact:true}).check();
  await folderDialog.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('.capture-destination strong')).toHaveText('随手记');expect(defaultFolder).toBe('随手记');
  await page.getByRole('button',{name:/保存到/}).click();
  await expect(folderDialog.getByRole('radio',{name:/随手记/})).toBeChecked();
  const nameField=folderDialog.getByRole('textbox',{name:'新文件夹名称',exact:true});
  await nameField.fill('../不合法');await folderDialog.getByRole('button',{name:'创建文件夹',exact:true}).click();
  await expect(folderDialog.getByRole('alert')).toBeVisible();expect(folders).toHaveLength(3);
  await nameField.fill('单独的');await nameField.press('Enter');
  await expect(folderDialog.getByRole('radio',{name:'单独的',exact:true})).toBeChecked();await expect(nameField).toHaveValue('');
  const iconPositions=await folderDialog.locator('.capture-folder-option > .icon').evaluateAll(icons=>icons.map(icon=>icon.getBoundingClientRect().x));
  expect(new Set(iconPositions).size).toBe(1);
  await page.screenshot({path:'/tmp/capture-ux-folder.png'});
  await folderDialog.getByRole('radio',{name:'日记2024至今',exact:true}).check();
  await folderDialog.getByRole('checkbox',{name:'之后的新记录也保存到这里',exact:true}).uncheck();
  await folderDialog.getByRole('button',{name:'确定',exact:true}).click();expect(defaultFolder).toBe('随手记');
  await page.getByRole('button',{name:/保存到/}).click();
  await expect(folderDialog.getByRole('radio',{name:'日记2024至今',exact:true})).toBeChecked();
  await expect(folderDialog.getByRole('checkbox',{name:'之后的新记录也保存到这里',exact:true})).toBeChecked();
  await folderDialog.getByRole('button',{name:'确定',exact:true}).click();expect(defaultFolder).toBe('日记2024至今');
  await page.getByRole('button',{name:'整理并保存',exact:true}).click();await expect(editor).toHaveValue('');expect(saveCount).toBe(1);expect([...entries.values()][0].folder).toBe('日记2024至今');
  await page.getByRole('button',{name:/历史记录/}).click();await expect(page.getByRole('dialog',{name:'历史记录'})).toBeVisible();await page.screenshot({path:'/tmp/capture-ux-history.png'});
  await page.getByRole('button',{name:'继续补充',exact:true}).click();await editor.fill((await editor.inputValue())+'\n后来又想到一些事。');
  await page.getByRole('button',{name:'整理并保存',exact:true}).click();await expect(editor).toHaveValue('');expect(saveCount).toBe(2);expect(entries.size).toBe(1);
  await page.getByRole('button',{name:/历史记录/}).click();await page.getByRole('button',{name:'删除',exact:true}).click();
  await expect(page.getByText('从历史记录中删除？已保存的日记文件会保留。')).toBeVisible();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByText('还没有历史记录')).toBeVisible();expect(entries.size).toBe(0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await editor.fill('服务中断前已暂存的匿名文字。');await expect(page.getByText('草稿已暂存',{exact:true})).toBeVisible();await page.reload();await expect(editor).toHaveValue('服务中断前已暂存的匿名文字。');
  expect(errors).toEqual([]);
  console.log('Capture UX passed: live text, pause/resume, exact replacement, stash/restore, folder, same-record supplement, delete and reload.');
} finally {
  await browser?.close();
  if(server && server.exitCode===null) { const exited=once(server,'exit');server.kill('SIGTERM');const timer=setTimeout(()=>server.kill('SIGKILL'),5000);await exited;clearTimeout(timer); }
  for(const file of [html,source]) await unlink(file).catch(()=>{});
}
