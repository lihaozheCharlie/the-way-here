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
    window.addEventListener('open-context-agent', event => sessionStorage.setItem('test.reread', JSON.stringify(event.detail)));
    const originalFetch = window.fetch.bind(window);
    const names = ['阿尔伯特·爱因斯坦','埃隆·马斯克','本杰明·富兰克林','查理·芒格','沃伦·巴菲特','理查德·费曼','史蒂夫·乔布斯','彼得·德鲁克','纳瓦尔'];
    window.fetch = async (url, init) => {
      if (url === '/api/lenses') return new Response(JSON.stringify(names.map((displayName, i) => ({ id: `lens-${i}`, displayName, attention: '这是用于布局验收的简短关注点。完整说明保留在悬浮提示中。', helperUse: '匿名交互测试说明：核对证据与假设，保留不同解释。', signals: ['证据', '假设'], relativePath: '' }))));
      if (url === '/api/runs' && init?.method === 'POST') {
        sessionStorage.setItem('test.reread', init.body);
        return new Response(JSON.stringify({ error: '匿名验收不调用模型' }), { status: 503 });
      }
      if (url === '/api/runs' && !init?.method) {
        const data = await (await originalFetch('/api/views/letters')).json();
        const page = data.letters.slice().sort((a, b) => b.letterDate.localeCompare(a.letterDate))[0].page;
        return new Response(JSON.stringify([['older', '埃隆·马斯克', '2026-09-18'], ['other', '查理·芒格', '2026-09-19'], ['latest', '埃隆·马斯克', '2026-09-20']].map(([id, lensName, date]) => ({ id, title: '匿名重读', knowledgeBaseId: 'demo', mode: 'read', status: 'completed', prompt: '', events: [], createdAt: date + 'T10:00:00Z', outputTarget: { kind: 'letter-version', pageId: page.id, lensId: lensName, lensName, label: lensName + '视角回信' }, result: { finalAnswer: '# 匿名重读标题\n\n## 来信\n\n' + id + ' 版本的匿名回信正文。' } }))));
      }
      return originalFetch(url, init);
    };
  });
  await page.waitForURL('**/');
  origin = new URL(page.url()).origin;
  await page.goto(origin + '/letters');
  const reading = page.locator('.source-preview');
  await expect(reading).toContainText('latest 版本的匿名回信正文');
  await expect(reading.locator('.document-meta-row,.editable-document-properties')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '埃隆·马斯克视角回信', exact: true })).toHaveCount(1);
  const title = await page.locator('.editable-document-identity').boundingBox();
  const bar = await page.locator('.letter-version-bar').boundingBox();
  expect(title.y).toBeLessThan(bar.y);
  await expect(page.locator('.editable-document-identity .letter-version-actions')).toBeVisible();
  const actions = await page.locator('.letter-version-actions').boundingBox();
  expect(actions.y).toBeLessThan(bar.y);
  expect(actions.x + actions.width).toBeGreaterThan(title.x + title.width - 35);
  await expect(page.locator('.letter-history-banner')).toHaveCount(0);
  await page.screenshot({path:path.join(captures,'header-clean.png')});
  await page.getByRole('tab', { name: '查理·芒格视角回信', exact: true }).click();
  await expect(reading).toContainText('other 版本的匿名回信正文');
  await expect(page.locator('.letter-history-banner')).toContainText('你正在查看历史版本');
  await page.getByRole('button', { name: '历史版本', exact: true }).click();
  await expect(page.getByRole('menu')).toContainText('当前查看');
  await page.getByRole('menuitemradio').filter({hasText:'2026年9月18日'}).click();
  await expect(reading).toContainText('older 版本的匿名回信正文');
  await expect(page.getByRole('tab', { name: '埃隆·马斯克视角回信', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '回到最新版本' }).click();
  await expect(reading).toContainText('latest 版本的匿名回信正文');
  await expect(page.getByRole('tab', { name: '原始回信', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '历史版本', exact: true }).click();
  await page.getByRole('menu').screenshot({path:path.join(captures,'history.png')});
  await page.getByRole('menuitemradio').filter({hasText:'原始回信'}).click();
  await expect(reading.locator('.editable-document-activate')).toBeVisible();
  await reading.locator('.editable-document-activate').dblclick();
  await expect(reading.locator('textarea')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '回到最新版本' }).click();
  await page.getByRole('button', { name: '用新视角重读', exact: true }).click();
  await expect(page.locator('.letter-lens-popover > p')).toHaveText('用 9 种从公开原则提炼的视角重新写这封信。');
  await expect(page.getByText('对比两个视角')).toHaveCount(0);
  const choices = page.locator('.letter-lens-choice');
  await expect(choices).toHaveCount(9);
  for (let i = 0; i < 9; i++) {
    await choices.nth(i).hover();
    const tooltip = page.locator('.letter-lens-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('匿名交互测试说明');
    const box = await tooltip.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  }
  if (!process.env.SKIP_CAPTURE) await page.screenshot({ path: path.join(captures, 'lenses.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('.letter-lens-tooltip')).toHaveCount(0);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 900));
  if (!process.env.SKIP_CAPTURE) await page.screenshot({ path: path.join(captures, 'reader.png') });
  await page.getByRole('button', { name: '用新视角重读', exact: true }).click();
  await choices.first().click();
  await expect.poll(() => page.evaluate(() => Boolean(sessionStorage.getItem('test.reread')))).toBe(true);
  const request = await page.evaluate(() => JSON.parse(sessionStorage.getItem('test.reread')));
  expect(request.outputTarget.kind).toBe('letter-version');
  expect(request.outputTarget.lensId).toBe('lens-0');
  expect(errors).toEqual([]);
  console.log('Letter title hierarchy, perspective tabs, history, editing, nine tooltips and single-perspective reread checks passed.');
} finally {
  if (app) {
    const forceExit = setTimeout(() => app.process().kill("SIGKILL"), 5000);
    try { await app.close(); } finally { clearTimeout(forceExit); }
  }
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
