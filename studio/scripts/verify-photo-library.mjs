import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PhotoLibrary } from '../apps/desktop/src/photo-library.mjs';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-photo-library-check-')));
const captures = path.join(studio, '.impeccable/reviews/photo-library');
let application;
try {
  // Protocol smoke check only: never requests authorization or reads real photos.
  const native = new PhotoLibrary(path.join(studio, 'apps/desktop/dist/photo-library'));
  let nativeChild;
  try {
    const statusPromise = native.status(); nativeChild = native.child;
    expect(['notDetermined', 'authorized', 'denied', 'restricted']).toContain(await statusPromise);
  } finally {
    const exited = nativeChild && new Promise(resolve => nativeChild.once('exit', resolve));
    native.close(); if (exited) await exited;
  }
  await mkdir(captures, { recursive: true });
  await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true });
  await cp(path.join(studio, '../knowledge-engine'), path.join(root, 'knowledge-engine'), { recursive: true });
  await writeFile(path.join(root, 'AGENTS.md'), 'Anonymous photo UI verification workspace.');
  await writeFile(path.join(root, 'the-way-here.config.yaml'), 'version: 3\ndefaultKnowledgeBase: demo\npaths:\n  skills: knowledge-engine/skills\n  tools: knowledge-engine/tools\n  agentInstructions: AGENTS.md\nknowledgeBases:\n  demo:\n    name: 匿名演示\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\nagents:\n  runtimes:\n    codex:\n      enabled: false\n    pi:\n      enabled: false\nvalidation:\n  commands: []\n');
  await mkdir(path.join(root, 'vault/other/wiki'), { recursive: true });
  await mkdir(path.join(root, 'vault/other/sources'), { recursive: true });
  const configPath = path.join(root, 'the-way-here.config.yaml');
  await writeFile(configPath, (await readFile(configPath, 'utf8')).replace('agents:\n', '  other:\n    name: 匿名第二空间\n    paths:\n      wiki: vault/other/wiki\n      sources: vault/other/sources\nagents:\n'));
  const fixture = 'data:image/jpeg;base64,' + (await readFile(path.join(root, 'vault/demo/sources/.photo-memories/demo-hangzhou-photo-2022/photo-1.jpg'))).toString('base64');
  application = await electron.launch({ args: [path.join(studio, 'apps/desktop'), '--diagnostics', `--user-data-dir=${path.join(root, 'electron')}`], env: { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo' }, timeout: 60_000 });
  const page = await application.firstWindow({ timeout: 60_000 });
  await page.waitForLoadState('domcontentloaded');
  await page.addInitScript(() => localStorage.setItem('the-way-here.model-onboarding.confirmed', 'true'));
  await page.reload();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await application.evaluate(({ ipcMain }, fixture) => {
    const state = { status: 'notDetermined', requests: [], cloud: [], closes: 0, scenario: 'results' };
    globalThis.photoTest = state;
    const handle = (name, fn) => { ipcMain.removeHandler(name); ipcMain.handle(name, fn); };
    handle('desktop:photos-status', () => state.status);
    handle('desktop:photos-authorize', () => state.status = 'authorized');
    handle('desktop:photos-close', () => { state.closes += 1; });
    handle('desktop:photos-settings', () => {});
    handle('desktop:photos-search', (_event, input) => {
      state.requests.push(input);
      if (state.scenario === 'error') throw new Error('匿名测试：照片库暂时不可用，请重试');
      if (state.scenario === 'slow') return new Promise(resolve => { state.finishSearch = resolve; });
      const photos = state.scenario === 'empty' ? [] : [{ id: input.cursor ? 'next' : 'demo-photo', name: '匿名演示照片.jpg', createdAt: '2024-05-01T04:00:00.000Z', hasLocation: true, width: 1200, height: 800 }, ...(!input.cursor ? [{ id: 'cloud-photo', name: '匿名云端照片.heic', createdAt: '2024-05-02T04:00:00.000Z', hasLocation: false, width: 1200, height: 800 }] : [])];
      return { photos, summary: '匿名界面验证 · 2024年5月', ...(!input.cursor && photos.length ? { nextCursor: '00000000-0000-4000-8000-000000000000' } : {}), ...(input.kind === 'place' ? { place: { name: '浙江省 · 杭州市 · 富阳区', latitude: 30.05, longitude: 119.95, radiusKm: 30 } } : {}) };
    });
    handle('desktop:photos-image', (_event, input) => {
      state.cloud.push(input);
      return input.assetId === 'cloud-photo' && !input.network ? { cloudOnly: true } : { dataUrl: fixture, cloudOnly: false };
    });
  }, fixture);
  const card = page.locator('.photo-library-card');
  await expect(card).toContainText('从一张照片想起');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
  await page.locator('.home-overview').screenshot({ path: path.join(captures, 'entry.png') });
  await card.getByRole('button', { name: '找照片', exact: true }).click();
  await expect(card.getByRole('button', { name: '允许访问照片库' })).toBeVisible();
  expect(await application.evaluate(() => globalThis.photoTest.requests.length)).toBe(0);
  await card.screenshot({ path: path.join(captures, 'permission.png') });
  await card.getByRole('button', { name: '允许访问照片库' }).click();
  await card.getByLabel('关键词或日期', { exact: true }).fill('2024年5月');
  await card.getByRole('button', { name: '搜索照片' }).click();
  await expect(card.locator('.photo-library-grid img')).toHaveCount(1);
  await expect(card).toContainText('照片在 iCloud');
  await card.screenshot({ path: path.join(captures, 'cloud.png') });
  expect(await application.evaluate(() => globalThis.photoTest.cloud.some(input => input.network))).toBe(false);
  await card.getByRole('button', { name: '下载预览' }).click();
  await expect(card.locator('.photo-library-grid img')).toHaveCount(2);
  await card.getByRole('button', { name: '显示更多照片' }).click();
  await expect(card.locator('.photo-library-grid img')).toHaveCount(3);
  await card.getByRole('button', { name: /放大照片/ }).first().click();
  await expect(card.locator('.photo-library-full-image')).toBeVisible();
  await card.getByRole('button', { name: '关闭大图' }).click();
  for (const width of [1440, 1100]) {
    await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 1000), width);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(captures, `results-${width}.png`) });
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await card.getByLabel('查找方式').selectOption('place');
  await card.getByLabel('地点或日期 + 地点', { exact: true }).fill('去年 杭州富阳');
  await card.getByRole('button', { name: '搜索照片' }).click();
  await expect(card).toContainText('附近 30 公里');
  await expect(card).toContainText('浙江省 · 杭州市 · 富阳区');
  await card.screenshot({ path: path.join(captures, 'place.png') });
  await application.evaluate(() => globalThis.photoTest.scenario = 'empty');
  await card.getByRole('button', { name: '搜索照片' }).click();
  await expect(card).toContainText('没有找到符合条件的照片');
  await application.evaluate(() => globalThis.photoTest.scenario = 'error');
  await card.getByRole('button', { name: '搜索照片' }).click();
  await expect(card.getByRole('alert')).toContainText('照片库暂时不可用');
  await application.evaluate(() => globalThis.photoTest.scenario = 'slow');
  await card.getByRole('button', { name: '搜索照片' }).click();
  await card.getByRole('button', { name: '取消查找' }).click();
  await application.evaluate(() => globalThis.photoTest.finishSearch({ photos: [{ id: 'late', name: '不应出现.jpg' }], summary: 'late' }));
  await expect(card).not.toContainText('不应出现');
  await application.evaluate(() => globalThis.photoTest.status = 'denied');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card.getByRole('button', { name: '打开系统设置' })).toBeVisible();
  await expect(card.locator('img')).toHaveCount(0);
  await card.screenshot({ path: path.join(captures, 'denied.png') });
  await card.getByRole('button', { name: '收起', exact: true }).click();
  expect(await application.evaluate(() => globalThis.photoTest.closes)).toBeGreaterThan(1);
  await expect(card.locator('input')).toHaveCount(0);
  await application.evaluate(() => { globalThis.photoTest.status = 'authorized'; globalThis.photoTest.scenario = 'results'; });
  await card.getByRole('button', { name: '找照片', exact: true }).click();
  await card.getByRole('button', { name: '搜索照片' }).click();
  await expect(card.locator('.photo-library-grid img')).toHaveCount(1);
  await page.locator('.global-kb-trigger').click();
  await page.getByRole('menuitemradio', { name: /匿名第二空间/ }).click();
  await expect(page.locator('.global-kb-trigger')).toContainText('匿名第二空间');
  await expect(card.getByRole('button', { name: '找照片', exact: true })).toBeVisible();
  await expect(card.locator('img')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('Photo library UI verification passed: authorization, previews, cloud opt-in, pagination, place, empty/error, cancellation, revocation and knowledge-base isolation.');
} finally {
  if (application) {
    const child = application.process();
    await application.close();
    if (child.exitCode === null && child.signalCode === null) throw new Error('Verification application did not exit');
  }
  await rm(root, { recursive: true, force: true });
}
