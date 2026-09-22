import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-dismiss-layers-ui-')));
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
  await page.goto(origin+'/sources');
  await expect(page.locator('.source-preview-actions')).toHaveCount(0);
  const panel=page.locator('.floating-agent-panel');
  const openAgent=()=>page.getByRole('button',{name:'打开Agent对话',exact:true}).click();
  await openAgent();
  const input=panel.getByRole('textbox');
  await input.fill('Esc 验证草稿');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button',{name:'打开Agent对话',exact:true})).toBeFocused();
  await openAgent();
  await expect(input).toHaveValue('Esc 验证草稿');
  await panel.getByRole('button',{name:'AI 设置',exact:true}).click();
  await expect(page.locator('.agent-settings-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.agent-settings-dialog')).not.toBeVisible();
  await expect(panel).toBeVisible();
  await page.getByRole('button',{name:'搜索与命令',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'搜索与命令'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'搜索与命令'})).toHaveCount(0);
  await expect(panel).toBeVisible();
  // These toolbar controls can lie beneath the floating Agent; activate via keyboard.
  for (const [button,dialog] of [['导入资料','带一段记录进来'],['新建记录','写一条生活记录']]) {
    await page.getByRole('button',{name:button,exact:true}).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog',{name:dialog,exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog',{name:dialog,exact:true})).toHaveCount(0);
    await expect(panel).toBeVisible();
  }
  await page.getByRole('button',{name:'连接来源目录',exact:true}).count();
  const connections=page.locator('.source-connections-popover summary').first();
  await connections.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.source-connections-popover')).toHaveAttribute('open','');
  await page.keyboard.press('Escape');
  await expect(page.locator('.source-connections-popover')).not.toHaveAttribute('open','');
  await expect(panel).toBeVisible();
  const fileMenu=page.locator('.source-file-row .file-menu-trigger').first();
  await fileMenu.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.file-menu-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.file-menu-popover')).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await openAgent(); await expect(input).toHaveValue('Esc 验证草稿');
  expect(errors).toEqual([]);
  console.log('PASS: Escape closes Agent and restores focus without losing draft; native AI settings, command palette, import, new source, connection popover and file menu close individually above Agent.');
} finally {
  if (app) await app.close();
  if (appPid) { let alive = true; try { process.kill(appPid, 0); } catch { alive = false; } if (alive) throw new Error('Verification desktop process is still running'); }
  if (origin) { let response; try { response = await fetch(`${origin}/api/health`); } catch {} if (response?.ok) throw new Error('Verification server is still listening'); }
  await rm(root, { recursive: true, force: true });
}
