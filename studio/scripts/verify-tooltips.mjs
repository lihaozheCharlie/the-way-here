import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-tooltip-ui-')));
const captures = path.join(studio, '.impeccable/reviews/tooltips');
await mkdir(captures, { recursive: true });
await writeFile(path.join(root, 'the-way-here.config.yaml'), 'version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    name: 匿名演示\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\nagents:\n  runtimes:\n    codex:\n      enabled: false\n    pi:\n      enabled: false\nvalidation:\n  commands: []\n');
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
      if (url === '/api/views/relationships') {
        const role = { id: 'role-demo', title: '组织信号源', aliases: [] };
        const people = ['示例人物甲', '示例人物乙'].map((title, index) => ({
          id: `person-${index}`, title, aliases: [], mentionCount: 5, lastMention: '2026-09-01',
          excerpt: '这是一段用于验证悬浮提示的匿名人物记录。'.repeat(20),
          relatedRoles: [role], relatedStages: [], relatedSystems: [],
        }));
        return new Response(JSON.stringify({ roles: [role], groups: [{ name: '人物', people }], totalPeople: 2 }));
      }
      return originalFetch(url, init);
    };
  });
  await page.waitForURL('**/');
  origin = new URL(page.url()).origin;
  await page.goto(origin + '/relationships');
  const tooltip = page.locator('.truncated-text-tooltip');
  const excerpt = page.locator('.relationships-person-excerpt').first();
  await expect(excerpt).toBeVisible();
  await expect(page.locator('.relationships-graph-card footer')).toHaveCount(0);
  await expect(page.locator('.relationships-bridge')).toHaveCount(0);
  await expect(page.locator('.relationships-page-head p')).toHaveText('这里记录了出现在你世界里的人。模型已根据已有记录为他们分类，你可以随时调整。');
  await page.getByRole('button', { name: '筛选关系角色：组织信号源' }).click();
  await page.waitForTimeout(550);
  await expect(tooltip).toHaveCount(0);
  await page.locator('#main-content').evaluate(node => node.focus());
  await expect(tooltip).toHaveCount(0);
  await excerpt.hover();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(0, 0);
  await excerpt.hover();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(550);
  await expect(tooltip).toHaveCount(0);
  // Keyboard focus exposes only the card's own truncated text.
  await page.locator('.relationships-role-filters button').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.relationships-person-card').first()).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.getByRole('button', { name: '筛选关系角色：组织信号源' }).click();
  await expect(tooltip).toHaveCount(0);
  await excerpt.hover();
  await expect(tooltip).toBeVisible();
  // Removing a hovered element without moving the mouse clears its tooltip.
  await excerpt.evaluate(node => node.remove());
  await expect(tooltip).toHaveCount(0);
  await page.reload();
  await expect(excerpt).toBeVisible();
  await page.mouse.move(0, 0);
  if (!process.env.SKIP_CAPTURE) await page.screenshot({ path: path.join(captures, 'relationships.png') });
  expect(errors).toEqual([]);
  console.log('Relationship filtering, hover delay, pointer dismissal, keyboard focus and detached-anchor checks passed.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
