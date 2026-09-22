import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-stage-ui-')));
const captures = path.join(studio, '.impeccable/reviews/stage-focus');
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
    const originalFetch = window.fetch.bind(window);
    const summary = (id) => ({id, title:id, relativePath:`wiki/${id}.md`, category:'events', aliases:[], tags:[], locations:[], sources:[], excerpt:'这一事件带来了新的选择，也改变了日常生活的安排。', start:'2025-06-01', modifiedAt:'2026-09-22', isSource:false});
    window.fetch = async (url, init) => {
      if (url === '/api/views/life-map') {
        const stage = (count) => ({page:summary(`匿名阶段${count}`),range:'2024—2026',focus:'在新的城市里，重新安排工作、关系与日常生活。',current:count===9,lane:0,order:count,relatedPeople:['朋友甲','同事乙','家人丙','同事丁','朋友戊'].map(summary),relatedPlaces:['上海','杭州','组织与项目总览'].map(summary),relatedSystems:['工作与学习','家庭生活','注意力系统','资产系统','表达系统'].map(summary),relatedLetters:[],relatedEvents:Array.from({length:count},(_,i)=>summary(`关键经历${i+1}`))});
        return new Response(JSON.stringify({stages:[stage(9),stage(2)],events:[]}));
      }
      if (String(url).startsWith('/api/views/focus/')) return new Response(JSON.stringify({signal:{id:'test',name:'匿名问题',judgment:'一次匿名布局验收',kind:'观察',observation:'继续观察',links:[]},candidates:[],related:[],evidenceTimeline:[],graph:{focusId:'朋友甲',nodes:[summary('朋友甲'),summary('同事乙')],links:[{source:'朋友甲',target:'同事乙'}]}}));
      if (String(url).startsWith('/api/pages/')) {
        const id=decodeURIComponent(String(url).slice('/api/pages/'.length));
        const markdown=`# ${id}\n\n这是一份匿名只读文档。\n\n[关联人物](/page/朋友甲)`;
        return new Response(JSON.stringify({...summary(id),markdown,renderedMarkdown:markdown,properties:{},sections:[],outgoingLinks:[],incomingLinks:[]}));
      }
      return originalFetch(url,init);
    };
  });
  await page.waitForURL('**/');
  origin = new URL(page.url()).origin;
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1500,1000));
  await page.goto(origin+'/timeline');
  const card=page.locator('.stage-focus-network');
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.stage-event')).toHaveCount(9);
  expect(await card.locator('.stage-event-list').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await card.screenshot({path:path.join(captures,'dense.png')});
  const before=page.url();
  const opener=card.locator('.stage-event').first();
  await opener.click();
  const dialog=page.getByRole('dialog',{name:'只读文件预览'});
  await expect(dialog).toContainText('这是一份匿名只读文档');
  await expect(dialog.locator('textarea')).toHaveCount(0);
  await dialog.getByRole('link',{name:'关联人物'}).click();
  await expect(dialog).toContainText('朋友甲');
  expect(page.url()).toBe(before);
  await dialog.screenshot({path:path.join(captures,'preview.png')});
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.locator('.understanding-timeline-item').filter({hasText:'匿名阶段2'}).click();
  await expect(card.locator('.stage-event')).toHaveCount(2);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.stage-event p').first()).toBeVisible();
  expect(await card.locator('.stage-event-list').evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
  await card.screenshot({path:path.join(captures,'sparse.png')});
  await card.locator('.stage-network-leaf').first().click();
  await expect(dialog).toContainText('朋友甲');
  await dialog.getByRole('button',{name:'关闭文件预览'}).click();
  await expect(dialog).toHaveCount(0);
  const graph = card.locator('.graph-viewport');
  const category=graph.getByRole('button',{name:'● 相关的人 · 5'});
  await category.click();
  await expect(graph.locator('.stage-network-leaf')).toHaveCount(8);
  await category.click();
  await expect(graph.locator('.stage-network-leaf')).toHaveCount(13);
  const names=await graph.locator('.stage-network-leaf').allTextContents();
  for (const name of names) {
    await graph.getByRole('button',{name,exact:true}).click();
    await expect(dialog.locator('h1')).toContainText(name);
    await page.keyboard.press('Escape');
  }
  await graph.getByRole('button',{name:'放大图谱',exact:true}).click();
  await expect(graph.locator('output')).toHaveText('125%');
  await graph.getByRole('button',{name:'适应画布'}).click();
  const svg=graph.locator('svg.graph-viewport-svg');
  const initial=await svg.getAttribute('viewBox');
  const box=await svg.boundingBox();
  await page.mouse.move(box.x+10,box.y+10);
  await page.mouse.down(); await page.mouse.move(box.x+60,box.y+40); await page.mouse.up();
  expect(await svg.getAttribute('viewBox')).not.toBe(initial);
  await graph.getByRole('button',{name:'适应画布'}).click();
  await graph.getByRole('button',{name:'放大查看',exact:true}).click();
  const expanded=page.getByRole('dialog',{name:'阶段关系图谱放大查看',exact:true});
  await expect(expanded).toBeVisible();
  await expanded.getByRole('button',{name:'朋友甲',exact:true}).click();
  await expect(dialog.locator('h1')).toContainText('朋友甲');
  await page.keyboard.press('Escape');
  await expect(expanded).toBeVisible();
  await expanded.screenshot({path:path.join(captures,'expanded.png')});
  await page.keyboard.press('Escape');
  await expect(expanded).toHaveCount(0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,900));
  await card.screenshot({path:path.join(captures,'compact.png')});
  await page.goto(origin+'/relationships');
  const relations=page.locator('.relationships-graph-card .graph-viewport');
  await expect(relations).toBeVisible();
  await relations.getByRole('button',{name:'放大查看',exact:true}).click();
  const network=page.getByRole('dialog',{name:'人物与关系角色网络放大查看'});
  await expect(network).toBeVisible();
  await network.getByRole('button',{name:'放大图谱',exact:true}).click();
  await expect(network.locator('output')).toHaveText('125%');
  await network.getByRole('button',{name:'适应画布'}).click();
  const role=network.locator('.relationships-role-node').first();
  await role.click(); await expect(role).toHaveAttribute('aria-pressed','true');
  await network.screenshot({path:path.join(captures,'relationships.png')});
  await page.keyboard.press('Escape');
  await page.goto(origin+'/focus/test');
  await page.locator('.focus-more-evidence > summary').click();
  const local=page.locator('.context-graph .graph-viewport');
  await local.getByRole('button',{name:'放大查看',exact:true}).click();
  const context=page.getByRole('dialog',{name:'局部关系图谱放大查看'});
  await context.getByRole('button',{name:'预览 朋友甲',exact:true}).click();
  await expect(dialog.locator('h1')).toContainText('朋友甲');
  await page.keyboard.press('Escape');
  await context.getByRole('button',{name:'缩小图谱'}).click();
  await expect(context.locator('output')).toHaveText('80%');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  console.log('Stage graph, nine-event scrolling, two-event descriptions, read-only preview, internal links and focus restoration passed.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
