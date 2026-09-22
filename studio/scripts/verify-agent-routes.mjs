import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-agent-routes-ui-')));
const captures = path.join(studio, '.impeccable/reviews/floating-agent');
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
  await page.waitForURL('**/'); origin=new URL(page.url()).origin;
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1500,1000));
  await page.getByRole('button',{name:'打开Agent对话',exact:true}).click();
  const panel=page.locator('.floating-agent-panel');
  for (const route of ['/', '/questions', '/sources', '/knowledge', '/insights', '/timeline', '/letters', '/relationships', '/predict-self', '/', '/questions']) {
    await page.locator(`.desktop-navigation a[href="${route}"]`).first().click();
    await expect(page).toHaveURL(origin+route);
    const label = {'/':'此刻','/questions':'值得聊聊','/sources':'生活记录','/knowledge':'总览','/insights':'理解自己','/timeline':'人生轨迹','/letters':'近况回信','/relationships':'人与世界','/predict-self':'看见未来'}[route];
    await expect(page.locator('.desktop-window-title')).toContainText(label);
    await expect(panel).toBeVisible();
    await expect(panel.locator('.context-agent-attached-context')).toHaveCount(1);
    await expect(panel.locator('.context-suggestions,.inspector-tabs,.context-agent-context-chip,.context-agent-empty-state')).toHaveCount(0);
    await expect(panel.getByRole('button',{name:/聊过的事，/})).toHaveCount(1);
    await expect(panel.locator('.context-agent-compose-body')).toHaveText('');
    await expect(panel).not.toContainText('我会判断是继续聊清');
  }
  await expect(panel.locator('.context-agent-attached-context summary')).toHaveText('最近值得聊的话题');
  await page.screenshot({path:path.join(captures,'route-switching.png')});
  expect(errors).toEqual([]);
  console.log('PASS: all nine sidebar destinations and repeated Today → Questions navigation retain one context, one history entry and no suggested-prompt cards.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
