import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-background-navigation-')));
let server, browser, origin, stateRoot, page;
let log = '';
try {
  await mkdir(path.join(root, 'vault/demo/wiki'), { recursive: true });
  await mkdir(path.join(root, 'vault/demo/sources'), { recursive: true });
  await writeFile(path.join(root, 'the-way-here.config.yaml'), `version: 3
defaultKnowledgeBase: demo
knowledgeBases:
  demo:
    name: 匿名演示
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
agents:
  runtimes:
    codex:
      enabled: false
    pi:
      enabled: false
validation:
  commands: []
`);
  server = spawn(process.execPath, [path.join(studio, 'apps/server/dist/index.js')], {
    env: { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo', THE_WAY_HERE_PORT: '0', THE_WAY_HERE_WEB_ROOT: path.join(studio, 'apps/web/dist'), THE_WAY_HERE_DEV: '', THE_WAY_HERE_DESKTOP_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(log)), 30000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', () => { clearTimeout(timer); reject(new Error(log)); });
    const capture = data => { log += data; const match = log.match(/TWH_READY (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); resolve(match[1]); } };
    server.stdout.on('data', capture); server.stderr.on('data', capture);
  });
  const policy = await fetch(`${origin}/api/storage/policy`).then(response => response.json());
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  if (path.basename(policy.stateRoot) !== key || path.basename(path.dirname(policy.stateRoot)) !== 'vaults') throw new Error('Unexpected test state location');
  stateRoot = policy.stateRoot;
  browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const run = { id: 'background-build', knowledgeBaseId: 'demo', mode: 'write', runtimeId: 'codex', status: 'running', title: '匿名后台构建', prompt: '构建匿名记录', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events: [], approvals: [], changes: [] };
  const interruptions = [];
  await page.route('**/api/runs**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/runs') return route.fulfill({ json: [run] });
    if (url.pathname === `/api/runs/${run.id}`) return route.fulfill({ json: run });
    if (url.pathname === `/api/runs/${run.id}/interrupt`) { interruptions.push(url.pathname); run.status = 'interrupted'; return route.fulfill({ json: run }); }
    return route.continue();
  });
  await page.goto(origin);
  await page.locator('.desktop-navigation').waitFor();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  await page.getByRole('checkbox', { name: '不再提醒我', exact: true }).check();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  await page.getByRole('button', { name: '打开Agent对话', exact: true }).click();
  await expect(page.getByRole('button', { name: '聊过的事，1 个话题' })).toBeVisible();
  // Exercise a live Run without invoking a model or touching a real knowledge base.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-context-agent', { detail: { runId: 'background-build' } })));
  await expect(page.locator('.context-agent-panel')).toHaveAttribute('data-run-id', run.id);
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toBeVisible();
  for (const destination of ['/sources', '/knowledge', '/questions']) {
    await page.locator(`.desktop-navigation a[href="${destination}"]`).first().click();
    await expect(page).toHaveURL(origin + destination);
    await expect(page.locator('.context-agent-panel')).toHaveAttribute('data-run-id', '');
    expect(interruptions).toEqual([]);
    expect(run.status).toBe('running');
    // Restore the existing running conversation after each page switch.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-context-agent', { detail: { view: 'history' } })));
    await page.locator('.context-history-open').click();
    await expect(page.getByRole('button', { name: '停止任务', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: '停止任务', exact: true }).click();
  await expect.poll(() => interruptions.length).toBe(1);
  expect(run.status).toBe('interrupted');
  console.log('PASS: active build survives page navigation and can be restored; explicit stop still interrupts.');
} catch (error) {
  console.error(await page?.locator('body').innerText());
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    server.kill('SIGTERM');
    try { await exited; } finally { clearTimeout(timer); }
  }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  if (stateRoot) await rm(stateRoot, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
}
