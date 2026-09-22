import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-preferences-')));
const captures = path.join(studio, '.impeccable/review/preferences');
await mkdir(captures, { recursive: true });
await writeFile(path.join(root, 'the-way-here.config.yaml'), 'version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    name: 匿名演示\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\nagents:\n  runtimes:\n    codex:\n      enabled: true\n    pi:\n      enabled: true\nvalidation:\n  commands: []\n');
await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true });
let app, pid, origin;
const errors = [];
try {
  app = await electron.launch({ args: [path.join(studio, 'apps/desktop'), '--diagnostics', `--user-data-dir=${path.join(root, 'profile')}`], env: { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo' }, timeout: 60000 });
  pid = app.process().pid;
  const main = await app.firstWindow();
  await main.waitForURL('**/');
  origin = new URL(main.url()).origin;
  const opened = app.waitForEvent('window');
  await main.evaluate(() => window.desktop.openWindow('/preferences', 'settings'));
  const page = await opened;
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: '偏好设置', exact: true })).toBeVisible();
  const toggle = page.getByRole('switch');
  await toggle.check();
  await page.reload();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  for (const width of [820, 700]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows().find(win => win.kind === 'settings').setSize(width, 900), width);
    await page.getByRole('tab', { name: '通用', exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: path.join(captures, `general-${width}.png`) });
    await page.getByRole('tab', { name: '通用', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'AI 助手' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.ai-config-footer button')).toBeDisabled();
    await page.screenshot({ animations: 'disabled', path: path.join(captures, `codex-${width}.png`) });
    await page.getByRole('radio', { name: /第三方模型/ }).click();
    await expect(page.getByLabel('模型厂商')).toBeVisible();
    await expect(page.locator('.agent-key-label')).toContainText('必填');
    await page.screenshot({ animations: 'disabled', path: path.join(captures, `third-party-${width}.png`) });
    await page.locator('.preferences-key-note').scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: path.join(captures, `third-party-bottom-${width}.png`) });
    expect(await page.locator('.desktop-preferences').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('radio', { name: /Codex/ }).click();
  }
  await page.getByRole('radio', { name: /第三方模型/ }).click();
  await page.locator('input[type=password]').fill('anonymous-ui-test-key');
  await expect(page.locator('.agent-key-label')).toContainText('待应用');
  // Simulate a failed write without touching any real user settings.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (url, options) => {
      if (url === '/api/agent-settings' && options?.method === 'PUT') {
        window.fetch = original;
        return new Response(JSON.stringify({ error: '模拟保存失败' }), { status: 500 });
      }
      return original(url, options);
    };
  });
  await page.getByRole('button', { name: '应用到所有入口' }).click();
  await expect(page.getByRole('alert')).toContainText('模拟保存失败');
  await expect(page.locator('input[type=password]')).toHaveValue('anonymous-ui-test-key');
  await page.getByRole('button', { name: '应用到所有入口' }).click();
  await expect(page.locator('.ai-config-footer')).toContainText('全局设置已更新');
  await expect(page.locator('input[type=password]')).toHaveValue('');
  await expect(page.locator('.agent-key-label')).toContainText('已保存');
  await page.reload();
  await page.getByRole('tab', { name: 'AI 助手' }).click();
  await expect(page.locator('.agent-key-label')).toContainText('已保存');
  await page.getByRole('button', { name: '移除', exact: true }).click();
  await expect(page.locator('.agent-key-label')).toContainText('必填');
  await page.getByRole('radio', { name: /Codex/ }).click();
  await page.getByRole('button', { name: '应用到所有入口' }).click();
  await expect(page.locator('.ai-config-footer')).toContainText('全局设置已更新');
  expect(errors).toEqual([]);
  console.log('Preferences: 820/700px, general/Codex/third-party, notification persistence, keyboard tabs, save failure recovery, key save/reload/removal passed.');
} finally {
  if (app) {
    const kill = setTimeout(() => app.process().kill('SIGKILL'), 5000);
    try { await app.close(); } finally { clearTimeout(kill); }
  }
  if (pid) { let alive = true; try { process.kill(pid, 0); } catch { alive = false; } if (alive) throw new Error('Verification app is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
