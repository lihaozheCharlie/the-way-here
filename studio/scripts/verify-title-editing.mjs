import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';import { fileURLToPath } from 'node:url';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),web=path.join(studio,'apps/web');
const require=createRequire(path.join(web,'package.json')),{createServer}=await import(require.resolve('vite'));
const name=`.title-editing-${process.pid}`,fixture=path.join(web,name+'.tsx'),html=path.join(web,name+'.html');
const before=process.argv.includes('--expect-before');let server,browser;let changes=[];
const detail=(title='匿名日记',modifiedAt='2026-10-28T00:00:00Z')=>({id:`sources/日记/${title}`,relativePath:`sources/日记/${title}.md`,title,markdown:'# 一次散步\n\n今天走了很久。',renderedMarkdown:'# 一次散步\n\n今天走了很久。',modifiedAt,isSource:true,category:'sources',excerpt:'匿名正文',properties:{},aliases:[],tags:[],locations:[],sources:[],outgoingLinks:[],backlinks:[],relatedPages:[]});
try{
 await writeFile(fixture,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {EditableDocument} from './src/shared/EditableDocument';import './src/styles/theme-tokens.css';import './src/styles/base.css';import './src/styles/form-controls.css';import './src/shared/document.css';function Demo(){const [page,setPage]=useState(${JSON.stringify(detail())});return <MemoryRouter><EditableDocument key={page.id} page={page} variant="preview" onRenamed={setPage}/><button id="outside">离开标题</button></MemoryRouter>}createRoot(document.getElementById('root')).render(<Demo/>);`);
 await writeFile(html,`<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/${name}.tsx"></script></html>`);
 server=await createServer({root:web,server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();const port=server.httpServer.address().port;console.log(`Title verification listener: ${port}`);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1300,height:900}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Fixture error:',error.message);});
 await page.route('**/api/**',async route=>{if(new URL(route.request().url()).pathname==='/api/pages/rename'){const body=route.request().postDataJSON();changes.push(body);await route.fulfill({json:detail(body.fileName,`2026-10-28T00:00:0${changes.length}Z`)});}else await route.fulfill({json:{}});});
 await page.goto(`http://127.0.0.1:${port}/${name}.html`);const input=page.locator('.record-document-title input');await input.fill('匿名日记增');await input.press('ArrowLeft');
 await page.waitForTimeout(1300);
 if(before){expect(changes).toHaveLength(1);await expect(input).not.toBeFocused();console.log('Reproduced: typing pause causes rename/remount and loses input focus.');}
 else{
  expect(changes).toHaveLength(0);await expect(input).toBeFocused();expect(await input.evaluate(n=>n.selectionStart)).toBe(4);
  const box=await input.boundingBox();await page.mouse.click(box.x+20,box.y+box.height/2);const selection=await input.evaluate(n=>n.selectionStart);await page.waitForTimeout(1300);
  await expect(input).toBeFocused();expect(await input.evaluate(n=>n.selectionStart)).toBe(selection);expect(changes).toHaveLength(0);
  await input.evaluate(n=>n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));await expect(input).toBeFocused();expect(changes).toHaveLength(0);
  await input.fill('修改后的标题');await input.press('Enter');await expect.poll(()=>changes.length).toBe(1);await expect(input).toHaveValue('修改后的标题');
  await input.fill('这次取消');await input.press('Escape');await expect(input).toHaveValue('修改后的标题');expect(changes).toHaveLength(1);
  await input.fill('点击外面保存');await page.locator('#outside').click();await expect.poll(()=>changes.length).toBe(2);await expect(input).toHaveValue('点击外面保存');
  expect(errors).toEqual([]);await mkdir(path.join(studio,'.runtime/title-editing'),{recursive:true});await writeFile(path.join(studio,'.runtime/title-editing/result.json'),JSON.stringify({passed:true,pauseKeepsFocus:true,keyboardCaret:true,pointerCaret:true,imeEnter:true,enterCommits:true,escapeCancels:true,blurCommits:true},null,2));
  console.log('Title editing passed: pauses/caret movement/IME retain focus; Enter and blur commit once; Escape cancels.');
 }
}finally{await browser?.close();await server?.close();await Promise.all([rm(fixture,{force:true}),rm(html,{force:true})]);console.log('Title test browser, listener and temporary source cleaned up.');}
