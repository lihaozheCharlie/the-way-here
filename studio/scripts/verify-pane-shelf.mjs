import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-pane-shelf-ui-')));
const captures = path.join(studio, '.impeccable/reviews/pane-shelf');
await mkdir(captures, { recursive: true });
await writeFile(path.join(root, 'the-way-here.config.yaml'), 'version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    name: 匿名演示\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\nagents:\n  runtimes:\n    codex:\n      enabled: false\n    pi:\n      enabled: false\nvalidation:\n  commands: []\n');
await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true });
let app, appPid, origin;
const errors = [];
try {
  app = await electron.launch({ args: [path.join(studio, 'apps/desktop'), '--diagnostics', `--user-data-dir=${path.join(root, 'electron-profile')}`], env: { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo' }, timeout: 60000 });
  appPid = app.process().pid;
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(url,init)=>{
      if(String(url).startsWith('/api/pages/fixture-')) {
        const id=String(url).split('/').at(-1), markdown='# 匿名记录\n\n用于验收文件列表与阅读区域。';
        return new Response(JSON.stringify({id,title:'匿名记录',relativePath:'sources/匿名文件夹/记录.md',category:'sources',isSource:true,aliases:[],tags:[],locations:[],sources:[],excerpt:'匿名摘要',modifiedAt:'2026-09-22',markdown,renderedMarkdown:markdown,properties:{},sections:[],outgoingLinks:[],incomingLinks:[]}));
      }
      const response=await originalFetch(url,init);
      if(url==='/api/pages?sources=true' && response.ok) {
        const pages=await response.json();
        const sample=pages.find(p=>p.relativePath.endsWith('.md')) || pages[0];
        return new Response(JSON.stringify(Array.from({length:140},(_,i)=>({...sample,id:i===0?sample.id:`fixture-${i}`,title:`匿名记录 ${i+1}`,excerpt:'一段用于列表布局验收的匿名记录。',relativePath:i===0?sample.relativePath:`sources/匿名文件夹/记录${i}.md`}))));
      }
      return response;
    };
  });
  await page.waitForURL('**/'); origin=new URL(page.url()).origin;
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1500,1000));
  await page.goto(origin+'/sources');
  const heads=page.locator('.pane-shelf');
  await expect(heads).toHaveCount(2);
  await expect(heads.nth(1)).toContainText('140 份');
  const styles=await heads.evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,bg:getComputedStyle(el).backgroundColor})));
  expect(styles[0]).toEqual(styles[1]);
  const list=page.locator('.source-file-list');
  await page.mouse.move(10,10);
  await expect.poll(()=>list.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
  await list.hover();
  await expect.poll(()=>list.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('thin');
  await list.evaluate(el=>el.scrollTop=el.scrollHeight);
  await page.mouse.move(10,10);
  await expect(list).toHaveAttribute('data-scrolling','true');
  await expect.poll(()=>list.getAttribute('data-scrolling')).toBe(null);
  await expect.poll(()=>list.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
  await page.screenshot({path:path.join(captures,'load-more.png')});
  await page.getByRole('button',{name:'继续显示 20 份'}).click();
  await expect(page.locator('.source-file-row')).toHaveCount(140);
  await expect(page.locator('.source-file-list-more')).toHaveCount(0);
  await page.getByRole('button',{name:'收起文件夹栏',exact:true}).click();
  await expect(page.locator('.source-folder-pane .pane-shelf-count')).toBeHidden();
  await page.getByRole('button',{name:'展开文件夹栏',exact:true}).click();
  await page.getByRole('button',{name:'收起文件列表',exact:true}).click();
  await expect(page.locator('.source-file-pane .pane-shelf-count')).toBeHidden();
  await page.getByRole('button',{name:'展开文件列表',exact:true}).click();
  await list.evaluate(el=>el.scrollTop=0);
  await page.mouse.move(10,10);
  await expect.poll(()=>list.getAttribute('data-scrolling')).toBe(null);
  await page.screenshot({path:path.join(captures,'panes.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,900));
  await page.screenshot({path:path.join(captures,'compact.png')});
  expect(errors).toEqual([]);
  console.log('Matching pane shelves, quiet scrollbars, loading more and both collapse controls passed.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
