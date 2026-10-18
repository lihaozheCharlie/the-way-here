import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Pair with verify-web.mjs: exercise the current shared UI over native IPC,
// without relying on the retired connection-management panel or HTTP transport.
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-app-parity-')));
const original = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-parity-original-')));
let app, pid, stateRoot;
const errors = [];
try {
  const filter = file => !['.runtime', '__pycache__', '.DS_Store'].includes(path.basename(file));
  await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true, filter });
  await cp(path.join(studio, '../knowledge-engine'), path.join(root, 'knowledge-engine'), { recursive: true, filter });
  await writeFile(path.join(root, 'AGENTS.md'), 'Anonymous platform parity verification.');
  await writeFile(path.join(root, 'the-way-here.config.yaml'), `version: 3
defaultKnowledgeBase: demo
knowledgeBases:
  demo:
    name: 匿名兼容验收
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
  const originalText = '# 平台兼容样例\n\n匿名原文，验证移除入口不会删除文件。';
  await writeFile(path.join(original, '平台兼容样例.md'), originalText);
  const env = { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo', TWH_APP_CACHE_ROOT: path.join(root, 'cache') };
  delete env.THE_WAY_HERE_DEV;
  delete env.THE_WAY_HERE_DESKTOP_TOKEN;
  app = await electron.launch({ ...(process.env.TWH_DESKTOP_EXECUTABLE ? { executablePath: process.env.TWH_DESKTOP_EXECUTABLE, args: ['--diagnostics', `--user-data-dir=${path.join(root, 'profile')}`] } : { args: [path.join(studio, 'apps/desktop'), '--diagnostics', `--user-data-dir=${path.join(root, 'profile')}`] }), env, timeout: 60000 });
  pid = app.process().pid;
  console.log(`Verification App PID ${pid}`);
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForURL('**/');
  const origin = new URL(page.url()).origin;
  expect(new URL(origin).hostname).toMatch(/^workspace-[a-f0-9]+\.localhost$/);
  const policy = await page.evaluate(() => fetch('/api/storage/policy').then(response => response.json()));
  if (path.basename(policy.stateRoot) !== createHash('sha256').update(root).digest('hex').slice(0, 16) || path.basename(path.dirname(policy.stateRoot)) !== 'vaults') throw new Error('Unexpected test state location');
  stateRoot = policy.stateRoot;
  await expect(page.locator('.model-onboarding-dialog')).toBeVisible();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  await page.getByRole('checkbox', { name: '不再提醒我', exact: true }).check();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  for (const route of ['/', '/questions', '/sources', '/knowledge', '/insights', '/timeline', '/letters', '/relationships', '/predict-self']) {
    await page.goto(origin + route);
    await expect(page.locator('main h1').first()).toBeAttached();
    await expect(page.locator('main .loading')).toHaveCount(0);
    await expect(page.locator('.desktop-navigation a.active')).not.toHaveCount(0);
  }
  await page.goto(origin + '/sources');
  await expect(page.locator('.source-connections article, .source-connections label, .source-connections-popover')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /断开连接|确认断开|连接原始目录/ })).toHaveCount(0);
  // Stub only the OS picker/permission dialog, keeping the actual bridge and runtime.
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, original);
  await page.getByRole('button', { name: '打开文件夹…', exact: true }).click();
  await page.getByRole('button', { name: '平台兼容样例.md', exact: true }).click();
  await expect(page.locator('.source-preview')).toContainText('匿名原文');
  const connections = await page.evaluate(() => fetch('/api/source-connections').then(response => response.json()));
  expect(connections).toHaveLength(1);
  const node = page.getByRole('tree', { name: '文件夹树' }).locator(`[data-folder="外部来源/${connections[0].id}"]`);
  await node.hover();
  await node.getByRole('button', { name: /更多文件夹操作/ }).click();
  await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toHaveCount(0);
  await expect(page.getByText('只移除入口，不会删除磁盘上的文件', { exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '从列表移除', exact: true }).click();
  await expect(node).toHaveCount(0);
  expect(await readFile(path.join(original, '平台兼容样例.md'), 'utf8')).toBe(originalText);
  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu().items.find(item => item.label === '文件');
    const item = file.submenu.items.find(item => item.label === '导入生活记录…');
    if (item.accelerator !== 'CmdOrCtrl+O') throw new Error('Import accelerator changed');
    item.click();
  });
  const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.import-type-grid > button')).toHaveCount(3);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  console.log('PASS: App IPC shares Web routes, folder open/remove semantics and three import types; native Cmd/Ctrl+O opens import.');
} finally {
  try {
    const pids = app ? await app.evaluate(({ app }) => app.getAppMetrics().map(item => item.pid)).catch(() => [pid]) : [];
    await app?.close();
    const alive = value => { try { process.kill(value, 0); return true; } catch { return false; } };
    const deadline = Date.now() + 5000;
    while (pids.some(alive) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (pids.some(alive)) throw new Error('Verification App or child process is still running');
  } finally {
    if (stateRoot) await rm(stateRoot, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
    await rm(original, { recursive: true, force: true });
  }
  console.log('Verification App and anonymous state cleaned up.');
}
