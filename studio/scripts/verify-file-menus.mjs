import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-file-menu-ui-')));
const captures = path.join(studio, '.impeccable/reviews/file-menus');
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
    window.fetch = async (url, init) => {
      if (url === '/api/files/reveal') {
        sessionStorage.setItem('test.reveal', init.body);
        return new Response(JSON.stringify({ ok: true }));
      }
      return originalFetch(url, init);
    };
  });
  await page.waitForURL('**/');
  origin = new URL(page.url()).origin;
  await page.goto(origin + '/letters');
  const menus = page.locator('.letter-index .file-menu-trigger');
  await expect(menus.first()).toBeVisible();
  await menus.first().click();
  await expect(page.getByRole('menuitem')).toHaveText(['重命名', '打开原始目录', '删除']);
  const box = await page.getByRole('menu').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
  if (!process.env.SKIP_CAPTURE) await page.screenshot({ path: path.join(captures, 'letters-menu.png') });
  await page.getByRole('menuitem', { name: '打开原始目录' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(sessionStorage.getItem('test.reveal')))).toBe(true);
  await menus.first().click();
  await page.getByRole('menuitem', { name: '重命名' }).click();
  await page.getByRole('textbox', { name: '文件名', exact: true }).fill('2026-09-21 匿名菜单验收回信');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const renamed = page.getByRole('button', { name: '更多文件操作：2026-09-21 匿名菜单验收回信', exact: true });
  await expect(renamed).toBeVisible();
  await renamed.click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(renamed).toBeVisible();
  await renamed.click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '删除文件', exact: true }).click();
  await expect(renamed).toHaveCount(0);
  await page.goto(origin + '/cards/personal-lines');
  await page.locator('.collection-list .file-menu-trigger').first().click();
  await expect(page.getByRole('menuitem')).toHaveText(['重命名', '打开原始目录', '删除']);
  await page.keyboard.press('Escape');
  await page.goto(origin + '/sources');
  await page.locator('.source-file-row > .file-menu-trigger').first().click();
  await expect(page.getByRole('menuitem', { name: '打开原始目录' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '构建这篇文档' })).toBeVisible();
  await expect(page.getByText('在原文件中显示', { exact: true })).toHaveCount(0);
  if (!process.env.SKIP_CAPTURE) await page.screenshot({ path: path.join(captures, 'sources-menu.png') });
  for (const route of ['/relationships', '/timeline', '/search?q=林', '/insights']) {
    await page.goto(origin + route);
    await page.locator('.file-menu-trigger').first().click();
    await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '打开原始目录', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    if (!process.env.SKIP_CAPTURE) await page.screenshot({ path: path.join(captures, route.slice(1).split('?')[0] + '.png') });
  }
  expect(errors).toEqual([]);
  console.log('File menu reveal, Wiki actions, rename, delete cancellation, deletion refresh and source build checks passed.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
