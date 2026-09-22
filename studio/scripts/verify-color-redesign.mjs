import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-color-ui-')));
const captures = path.join(studio, '.impeccable/reviews/color-redesign');
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
  await page.waitForURL('**/');
  origin = new URL(page.url()).origin;
  for (const width of [1440, 1100]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900), width);
    for (const route of ['/', '/questions', '/sources', '/knowledge', '/letters', '/predict-self']) {
      await page.goto(origin + route);
      await page.locator('h1').first().waitFor();
      await expect(page).toHaveURL(origin + route);
      if (route === '/sources' || route === '/letters') await page.locator('.source-preview .editable-document-body').first().waitFor();
      const colors = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return Object.fromEntries(['canvas','sidebar','ink','ink-soft','line','accent'].map(key => [key,root.getPropertyValue('--'+key).trim()]));
      });
      expect(colors).toEqual({ canvas:'#fafbf8',sidebar:'#f2f4f0',ink:'#16211b','ink-soft':'#51625a',line:'#e3e8e1',accent:'#2e6e5b' });
      if (route === '/') {
        await expect(page.locator('.today-capture')).toBeVisible();
        await expect(page.locator('.home-intro-card')).toHaveCSS('background-color','rgb(255, 255, 255)');
        await page.getByRole('textbox',{name:'此刻的记录'}).focus();
      }
      if (route === '/questions') {
        await page.locator('.questions-topic-card').first().waitFor();
        await page.locator('.questions-topic-card button').first().click();
        await expect(page.locator('.floating-agent-panel')).toHaveClass(/is-open/);
        await page.locator('.context-agent-composer textarea').waitFor();
      }
      await page.screenshot({path:path.join(captures,`${route.slice(1)||'today'}-${width}.png`)});
      if (route === '/questions') { await page.keyboard.press('Escape'); await expect(page.locator('.floating-agent-panel')).toHaveClass(/is-collapsed/); }
    }
  }
  expect(errors).toEqual([]);
  console.log('Shared palette checked on six routes at 1440 and 1100 px; five main page layouts, input focus, Agent and Escape passed. Prediction content may require the full knowledge-engine fixture.');
} finally {
  if (app) {
    const forceExit = setTimeout(() => app.process().kill("SIGKILL"), 5000);
    try { await app.close(); } finally { clearTimeout(forceExit); }
  }
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
