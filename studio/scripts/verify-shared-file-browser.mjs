import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-floating-agent-ui-')));
const captures = path.join(studio, '.impeccable/reviews/shared-file-browser');
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
  await page.goto(origin+'/sources');
  await expect(page.locator('.source-preview-actions')).toHaveCount(0);
  const sampleStyles=async()=>({
    row:await page.locator('.source-file-row').first().evaluate(el=>{const s=getComputedStyle(el);return [s.borderRadius,s.borderWidth,s.backgroundColor]}),
    title:await page.locator('.source-file-select b').first().evaluate(el=>{const s=getComputedStyle(el);return [s.font,s.color]}),
    document:await page.locator('.source-preview .editable-document-body').evaluate(el=>{const s=getComputedStyle(el);return [s.font,s.padding,s.color]}),
    identity:await page.locator('.source-preview .editable-document-identity').evaluate(el=>{const s=getComputedStyle(el);return [s.padding,s.borderBottomWidth]})
  });
  await expect(page.locator('.source-preview .editable-document-body')).toBeVisible();
  const records=await sampleStyles();
  await page.locator('.desktop-navigation a[href="/letters"]').click();
  await expect(page.locator('.source-file-pane')).toHaveAttribute('aria-label','回信列表');
  await expect(page.locator('.source-preview .editable-document-body')).toBeVisible();
  expect(await sampleStyles()).toEqual(records);
  await expect(page.locator('.letter-index,.letter-reading,.letter-detail,.embedded-page')).toHaveCount(0);
  await page.screenshot({path:path.join(captures,'letters-wide.png')});
  await page.getByRole('button',{name:'收起回信列表',exact:true}).click();
  await expect(page.locator('.source-file-contents')).toBeHidden();
  await page.getByRole('button',{name:'展开回信列表',exact:true}).click();
  await expect(page.locator('.source-file-contents')).toBeVisible();
  const body=page.locator('.source-preview .editable-document-activate');
  await body.press('Enter');
  await expect(page.locator('.source-preview textarea')).toBeVisible();
  await page.locator('.source-preview textarea').press('Escape');
  await expect(body).toBeVisible();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,900));
  await page.screenshot({path:path.join(captures,'letters-compact.png')});
  const list=await page.locator('.source-file-pane').boundingBox(), doc=await page.locator('.source-preview').boundingBox();
  expect(doc.x).toBeGreaterThan(list.x+list.width);
  expect(errors).toEqual([]);
  console.log('PASS: records and letters share list/editor computed styles, collapse/expand and editing; wide and compact layout checked.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
