import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';import { fileURLToPath } from 'node:url';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),web=path.join(studio,'apps/web');
const require=createRequire(path.join(web,'package.json')),{createServer}=await import(require.resolve('vite'));
const name=`.title-editing-${process.pid}`,fixture=path.join(web,name+'.tsx'),html=path.join(web,name+'.html');
const before=process.argv.includes('--expect-before');let server,browser;let changes=[];const bodySaves=[];
const detail=(title='匿名日记',modifiedAt='2026-10-28T00:00:00Z')=>({id:`sources/日记/${title}`,relativePath:`sources/日记/${title}.md`,title,markdown:'# 一次散步\n\n今天走了很久。',renderedMarkdown:'# 一次散步\n\n今天走了很久。',modifiedAt,isSource:true,category:'sources',excerpt:'匿名正文',properties:{},aliases:[],tags:[],locations:[],sources:[],outgoingLinks:[],backlinks:[],relatedPages:[]});
try{
 await writeFile(fixture,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MemoryRouter} from 'react-router-dom';import {EditableDocument} from './src/shared/EditableDocument';import './src/styles/theme-tokens.css';import './src/styles/base.css';import './src/styles/form-controls.css';import './src/shared/document.css';import './src/styles/source-navigation.css';function Demo(){const [page,setPage]=useState(${JSON.stringify(detail())});window.switchFixturePage=(markdown=page.markdown)=>flushSync(()=>setPage({...page,id:page.id+"/next",title:"下一篇",markdown,renderedMarkdown:markdown}));return <MemoryRouter><div className="desktop-shell" style={{display:"block",height:"auto"}}><div className="source-vault"><div id="fixture-scroll" className="source-preview" style={{height:440,width:700,overflowY:"auto"}}><EditableDocument key={page.id} page={page} variant="preview" onRenamed={setPage}/></div></div></div><button id="outside">退出编辑</button></MemoryRouter>}createRoot(document.getElementById('root')).render(<Demo/>);`);
 await writeFile(html,`<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/${name}.tsx"></script></html>`);
 server=await createServer({root:web,server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();const port=server.httpServer.address().port;console.log(`Title verification listener: ${port}`);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1300,height:900}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Fixture error:',error.message);});
 await page.route('**/api/**',async route=>{if(new URL(route.request().url()).pathname==='/api/pages/rename'){const body=route.request().postDataJSON();changes.push(body);await route.fulfill({json:detail(body.fileName,`2026-10-28T00:00:0${changes.length}Z`)});}else if(route.request().method()==='PUT'){bodySaves.push(route.request().postDataJSON().markdown);await route.fulfill({json:{ok:true}});}else await route.fulfill({json:{}});});
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
  await input.fill('点击外面保存');await page.locator('#outside').click();await expect.poll(()=>changes.length).toBe(2);await expect(input).toHaveValue('点击外面保存');await expect(page.locator('input[name="file-name-sources/日记/点击外面保存"]')).toBeVisible();
  await expect(input).not.toBeFocused();
  const reading=page.locator('.editable-document-activate'),editor=page.locator('[data-document-editor]');
  const lastParagraph=reading.locator('p').last();
  await expect(lastParagraph).toBeVisible();
  const paragraphBox=await lastParagraph.boundingBox();
  await page.mouse.click(paragraphBox.x+12,paragraphBox.y+paragraphBox.height+16);
  await expect(editor).toBeFocused();
  await page.keyboard.insertText('正文修改');await expect(editor).toContainText('正文修改');
  await page.locator('#outside').click();await expect(reading).toBeVisible();
  await expect.poll(()=>bodySaves.at(-1)).toMatch(/今天走了很久。\s*正文修改\s*$/);
  await reading.click();await expect(editor).toBeFocused();
  await page.keyboard.insertText('切页保存');
  await page.evaluate(()=>window.switchFixturePage());await expect(reading).toBeVisible();
  await expect.poll(()=>bodySaves.some(markdown=>markdown.includes('切页保存'))).toBe(true);
  const longBody=Array.from({length:28},(_,index)=>`第${index+1}段。 ${'这是一段用于验证换行和滚动位置的匿名文字。'.repeat(8)}`).join('\n\n');
  await page.evaluate(markdown=>window.switchFixturePage(markdown),'# 下一篇\n\n'+longBody);
  await expect(reading.locator('p')).toHaveCount(28);
  const tail=reading.locator('p').last();
  await tail.scrollIntoViewIfNeeded();
  const tailBox=await tail.boundingBox();
  const scroll=page.locator('.record-document-scroll');
  const beforeClick=await scroll.evaluate(element=>element.scrollTop);
  expect(beforeClick).toBeGreaterThan(0);
  await page.mouse.click(tailBox.x+12,tailBox.y+tailBox.height+12);
  await expect(editor).toBeFocused();
  await expect.poll(()=>editor.evaluate(node=>{
   const caret=getSelection().getRangeAt(0).getBoundingClientRect();
   const viewport=document.querySelector('.record-document-scroll').getBoundingClientRect();
   return node.contains(getSelection().anchorNode)&&caret.height>0&&caret.top>=viewport.top&&caret.bottom<=viewport.bottom;
  })).toBe(true);
  const caretY=await editor.evaluate(()=>getSelection().getRangeAt(0).getBoundingClientRect().top);
  expect(Math.abs(caretY-(tailBox.y+tailBox.height))).toBeLessThan(32);
  await page.keyboard.insertText('末尾一次点击');
  await page.locator('#outside').click();
  await expect.poll(()=>bodySaves.at(-1)).toMatch(/末尾一次点击\s*$/);
  await page.evaluate(markdown=>window.switchFixturePage(markdown),'# 另一篇\n\n'+longBody);
  await expect(reading.locator('p')).toHaveCount(28);
  const wrappedPoint=await tail.evaluate(paragraph=>{
   const scroll=document.querySelector('.record-document-scroll');
   scroll.scrollTop=scroll.scrollHeight;
   const range=document.createRange();
   range.selectNodeContents(paragraph);
   const row=[...range.getClientRects()][1];
   return {x:row.left+50,y:row.top+row.height/2};
  });
  await page.mouse.click(wrappedPoint.x,wrappedPoint.y);
  await expect(editor).toBeFocused();
  await expect.poll(()=>editor.evaluate(()=>getSelection().getRangeAt(0).getBoundingClientRect().top)).toBeGreaterThan(wrappedPoint.y-32);
  expect(await editor.evaluate(()=>getSelection().getRangeAt(0).getBoundingClientRect().top)).toBeLessThan(wrappedPoint.y+32);

  expect(errors).toEqual([]);await mkdir(path.join(studio,'.runtime/title-editing'),{recursive:true});await writeFile(path.join(studio,'.runtime/title-editing/result.json'),JSON.stringify({passed:true,pauseKeepsFocus:true,keyboardCaret:true,pointerCaret:true,imeEnter:true,enterCommits:true,escapeCancels:true,blurCommits:true},null,2));
  console.log('Title editing passed: pauses/caret movement/IME retain focus; Enter and blur commit once; Escape cancels.');
 }
}finally{await browser?.close();await server?.close();await Promise.all([rm(fixture,{force:true}),rm(html,{force:true})]);console.log('Title test browser, listener and temporary source cleaned up.');}
