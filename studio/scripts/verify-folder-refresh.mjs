import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),web=path.join(studio,'apps/web');
const require=createRequire(path.join(web,'package.json')),{createServer}=await import(require.resolve('vite'));
const name=`.folder-refresh-${process.pid}`,fixture=path.join(web,name+'.tsx'),html=path.join(web,name+'.html');
let browser,server,port;
try {
  await writeFile(fixture,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {OrganizedSources} from './src/features/sources/Sources';import {useLiveRevision} from './src/shared/routing';
${['theme-tokens','base','form-controls','features','archive-foundation','refinements','archive-theme','sources-redesign','desktop','desktop-redesign'].map(x=>`import './src/styles/${x}.css';`).join('\n')}
import './src/shared/document.css';import './src/styles/source-navigation.css';
function App(){const revision=useLiveRevision();return <MemoryRouter><div className="desktop-shell" style={{display:'block',padding:20,height:'100vh'}}><OrganizedSources revision={revision}/></div></MemoryRouter>};createRoot(document.getElementById('root')).render(<App/>);`);
  await writeFile(html,`<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/${name}.tsx"></script></html>`);
  server=await createServer({root:web,server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();port=server.httpServer.address().port;console.log(`Verification listener: ${port}`);
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const fetch=window.fetch;window.folderPending=0;window.fetch=async(...args)=>{const folder=String(args[0]).startsWith('/api/sources/folders');if(folder)window.folderPending++;try{return await fetch(...args);}finally{if(folder)window.folderPending--;}};window.EventSource=class extends EventTarget{constructor(){super();window.testEvents=this;}close(){}};});
  let markdown='# 匿名记录\n\n保留原来的内容。',modifiedAt='2026-10-11T00:00:00Z',writes=0,rootReads=0,fail=false;
  const roots=Array.from({length:24},(_,i)=>({path:`笔记${String(i).padStart(2,'0')}`,label:`笔记${String(i).padStart(2,'0')}`}));roots.unshift({path:'日记',label:'日记'});
  const children={'日记':[{path:'日记/2026',label:'2026'}],'日记/2026':[{path:'日记/2026/十月',label:'十月'}]};
  const record=()=>({id:'anonymous',title:'匿名记录',relativePath:'sources/日记/2026/匿名记录.md',modifiedAt,isSource:true,category:'sources',properties:{},tags:[],aliases:[],locations:[],sources:[],sections:[],outgoingLinks:[],incomingLinks:[],excerpt:'匿名摘要',markdown,renderedMarkdown:markdown});
  await page.route('**/api/**',async route=>{const req=route.request(),u=new URL(req.url());let json={};
    if(u.pathname==='/api/vault')json={knowledgeBaseId:'demo'};
    else if(u.pathname==='/api/sources/folders'){const parent=u.searchParams.get('parent')||'';if(!parent)rootReads++;await new Promise(resolve=>setTimeout(resolve,150));if(fail){await route.fulfill({status:503,json:{error:'临时读取失败'}});return;}json=parent?(children[parent]||[]):roots;}
    else if(u.pathname==='/api/pages')json=[record()];
    else if(u.pathname==='/api/pages/anonymous'){if(req.method()==='PUT'){writes++;markdown=req.postDataJSON().markdown;modifiedAt='2026-10-11T00:01:00Z';json={ok:true,modifiedAt};}else json=record();}
    else if(u.pathname==='/api/source-connections'||u.pathname==='/api/imports')json=[];
    await route.fulfill({json});
    if(u.pathname==='/api/pages/anonymous'&&req.method()==='PUT'){await page.evaluate(()=>window.testEvents.dispatchEvent(new MessageEvent('file')));await page.evaluate(()=>window.testEvents.dispatchEvent(new MessageEvent('index')));}
  });
  const settled=()=>expect.poll(()=>page.evaluate(()=>window.folderPending)).toBe(0);
  const emit=event=>page.evaluate(event=>window.testEvents.dispatchEvent(new MessageEvent(event)),event);
  await page.goto(`http://127.0.0.1:${port}/${name}.html`);const tree=page.getByRole('tree',{name:'文件夹树'}),node=p=>tree.locator(`[data-folder="${p}"]`);
  await expect(node('笔记23')).toBeAttached();await node('日记').click();await node('日记/2026').click();await expect(node('日记/2026/十月')).toBeVisible();await expect(tree.locator('.folder-tree-loading')).toHaveCount(0);
  // Capture transient removals throughout slow refreshes, not just the final appearance.
  await tree.evaluate(tree=>{window.removedRows=[];window.originalRows=new Map([...tree.querySelectorAll('[data-folder]')].map(row=>[row.dataset.folder,row]));window.treeObserver=new MutationObserver(changes=>{for(const change of changes)for(const removed of change.removedNodes)if(removed instanceof Element){if(removed.matches('[data-folder]'))window.removedRows.push(removed.dataset.folder);for(const row of removed.querySelectorAll('[data-folder]'))window.removedRows.push(row.dataset.folder);}});window.treeObserver.observe(tree,{childList:true,subtree:true});});
  const body=page.locator('.source-preview .editable-document-body');await body.dblclick();const editor=page.locator('[data-document-editor]');await expect(editor).toBeFocused();await page.keyboard.press('Meta+End');await page.keyboard.insertText('自动保存补充。');const beforeSave=rootReads;
  await expect.poll(()=>writes).toBe(1);await expect.poll(()=>rootReads).toBeGreaterThan(beforeSave);await settled();expect(markdown).toContain('自动保存补充。');await expect(node('日记/2026/十月')).toBeVisible();await expect(editor).toBeFocused();
  await node('日记/2026').focus();const scroller=page.locator('.source-folder-contents');await scroller.evaluate(el=>{el.scrollTop=80;});const scroll=await scroller.evaluate(el=>el.scrollTop);
  for(const event of ['run','open','index']){const before=rootReads;await emit(event);await expect.poll(()=>rootReads).toBeGreaterThan(before);await settled();}
  const beforeFocus=rootReads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>rootReads).toBeGreaterThan(beforeFocus);await settled();await expect(node('日记/2026')).toBeFocused();expect(await scroller.evaluate(el=>el.scrollTop)).toBe(scroll);expect(await page.evaluate(()=>window.removedRows)).toEqual([]);
  expect(await tree.evaluate(tree=>[...tree.querySelectorAll('[data-folder]')].every(row=>window.originalRows.get(row.dataset.folder)===row))).toBe(true);
  fail=true;await emit('index');await expect(page.getByRole('alert')).toContainText('临时读取失败');await expect(node('日记/2026/十月')).toBeVisible();expect(await page.evaluate(()=>window.removedRows)).toEqual([]);
  fail=false;roots.push({path:'外部新增',label:'外部新增'});await page.getByRole('button',{name:'重试',exact:true}).click();await expect(node('外部新增')).toBeAttached();
  children['日记']=[];await emit('index');await expect(node('日记/2026')).toHaveCount(0);await expect(node('日记/2026/十月')).toHaveCount(0);
  children['日记']=[{path:'日记/2026',label:'2026'}];children['日记/2026']=[];await emit('index');await expect(node('日记/2026')).toBeVisible();await expect(node('日记/2026/十月')).toHaveCount(0);expect(errors).toEqual([]);
  console.log('PASS: autosave/file/index, run/reconnect/focus, stable DOM, expanded branches, scroll/focus, failed refresh/retry, directory additions/removals.');
} finally {await browser?.close();await server?.close();await Promise.all([rm(fixture,{force:true}),rm(html,{force:true})]);if(server?.httpServer?.listening)throw new Error('Listener did not close');console.log(`Verification browser and listener ${port??''} closed.`);}
