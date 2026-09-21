import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-today-ui-')));
const captures = path.join(studio, '.impeccable/reviews/today');
await mkdir(captures, { recursive: true });
await writeFile(path.join(root, 'the-way-here.config.yaml'), 'version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    name: 匿名演示\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\nagents:\n  runtimes:\n    codex:\n      enabled: false\n    pi:\n      enabled: false\nvalidation:\n  commands: []\n');
let app, appPid, origin;
const errors = [];
try {
  app = await electron.launch({ args: [path.join(studio, 'apps/desktop'), '--diagnostics'], env: { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo' }, timeout: 60000 });
  appPid = app.process().pid;
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('textbox', { name: '此刻的记录' })).toBeVisible();
  origin = new URL(page.url()).origin;
  await expect(page.locator('.today-simple > section')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '整理并保存' })).toBeDisabled();
  for (const width of [1440, 1000, 760]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900), width);
    if (!process.env.SKIP_CAPTURE) await page.screenshot({ path: path.join(captures, `today-${width}.png`) });
    const box = await page.getByRole('button', { name: '整理并保存' }).boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  const input = page.getByRole('textbox', { name: '此刻的记录' });
  await input.fill('今天去公园散步，路上见到了一只猫。');
  await page.reload();
  await expect(input).toHaveValue('今天去公园散步，路上见到了一只猫。');
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      if (url === '/api/runs' && init?.method === 'POST') {
        if (sessionStorage.getItem('test.fail')) return new Response(JSON.stringify({ error: '请先配置 AI 助手' }), { status: 503 });
        const requested = JSON.parse(init.body);
        sessionStorage.setItem('test.request', JSON.stringify(requested));
        sessionStorage.setItem('test.count', String(Number(sessionStorage.getItem('test.count') || 0) + 1));
        return new Response(JSON.stringify({ ...requested, id: 'capture-ui-test', status: 'running' }));
      }
      if (url === '/api/runs/capture-ui-test') {
        const finished = sessionStorage.getItem('test.finished');
        return new Response(JSON.stringify({ ...JSON.parse(sessionStorage.getItem('test.request')), id: 'capture-ui-test', status: finished ? 'completed' : 'running', result: finished ? { outputPageId: 'source:test', outputSavedAt: new Date().toISOString() } : undefined }));
      }
      return originalFetch(url, init);
    };
  });
  await page.reload();
  await page.getByRole('button', { name: '整理并保存' }).click();
  await expect(input).toBeDisabled();
  const requested = await page.evaluate(() => JSON.parse(sessionStorage.getItem('test.request')));
  expect(requested.knowledgeBaseId).toBe('demo');
  expect(requested.outputTarget.originalText).toBe('今天去公园散步，路上见到了一只猫。');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('today.capture.demo.run'))).toBe('capture-ui-test');
  await page.reload();
  await expect(input).toBeDisabled();
  await page.evaluate(() => sessionStorage.setItem('test.finished', 'true'));
  await expect(page.getByRole('link', { name: '查看记录' })).toBeVisible();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(() => sessionStorage.getItem('test.count'))).toBe('1');
  await input.fill('失败后仍然留下的原话');
  await page.evaluate(() => sessionStorage.setItem('test.fail', 'true'));
  await page.getByRole('button', { name: '整理并保存' }).click();
  await expect(page.getByRole('alert')).toContainText('请先配置 AI 助手');
  await expect(input).toHaveValue('失败后仍然留下的原话');
  await expect(page.getByRole('button', { name: '整理并保存' })).toBeEnabled();
  expect(errors).toEqual([]);
  console.log('Today desktop layout, draft recovery, bound model request, run recovery, completion and failure checks passed.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
