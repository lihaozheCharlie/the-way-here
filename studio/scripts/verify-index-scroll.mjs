import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-letter-reading-ui-')));
const captures = path.join(studio, '.impeccable/reviews/letter-reading');
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
    window.fetch=async (url,init)=>{
      const response=await originalFetch(url,init);
      if (typeof url==='string' && url.startsWith('/api/pages/') && !init?.method && response.ok) {
        const data=await response.json();
        data.markdown=data.renderedMarkdown='# 匿名长文\n\n'+('用于滚动验收的匿名正文。正文较长时，左侧列表应停靠在阅读区域顶部。\n\n'.repeat(100));
        return new Response(JSON.stringify(data));
      }
      return response;
    };
  });
  await page.waitForURL('**/');
  origin=new URL(page.url()).origin;
  for (const route of ['/letters','/cards/personal-lines','/cards/systems','/cards/cycles','/mental-models']) {
    await page.goto(origin+route);
    const index=page.locator(route === '/letters' ? '.source-file-list' : '.collapsible-index-content > aside');
    await expect(index).toBeVisible();
    if (route==='/mental-models') await page.locator('.model-detail').evaluate(el=>el.style.minHeight='3000px');
    await page.locator('#main-content').evaluate(el=>el.scrollTop=700);
    await expect.poll(async()=>Math.round((await index.boundingBox()).y)).toBe(38);
    expect(await index.evaluate(el=>el.clientHeight<=innerHeight-38)).toBe(true);
    if(route==='/letters') await page.screenshot({path:path.join(captures,'scroll-index.png')});
    await page.locator('#main-content').evaluate(el=>el.scrollTop=1200);
    await expect.poll(async()=>Math.round((await index.boundingBox()).y)).toBe(38);
  }
  expect(errors).toEqual([]);
  console.log('Letter, personal-line, system, cycle and mental-model indexes stay at the desktop scrollport top.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
