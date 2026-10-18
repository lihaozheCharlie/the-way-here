import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-web-check-')));
const linkedRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-web-original-')));
const captures = path.join(studio, '.impeccable/reviews/web');
const sampleId = 'sources/Web 验收/浏览器样例';
const samplePath = path.join(root, 'vault/demo/sources/Web 验收/浏览器样例.md');
let server, browser, origin, stateRoot;
let serverLog = '';
const errors = [], apiFailures = [], passed = [];
const record = name => { passed.push(name); console.log(`PASS: ${name}`); };

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, 'exit');
  const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
  server.kill('SIGTERM');
  try { await exited; } finally { clearTimeout(timer); }
}

try {
  await mkdir(captures, { recursive: true });
  const filter = file => !['.runtime', '__pycache__', '.DS_Store'].includes(path.basename(file));
  await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true, filter });
  await cp(path.join(studio, '../knowledge-engine'), path.join(root, 'knowledge-engine'), { recursive: true, filter });
  await writeFile(path.join(root, 'AGENTS.md'), 'Anonymous browser verification workspace.');
  await writeFile(path.join(root, 'the-way-here.config.yaml'), `version: 3
defaultKnowledgeBase: demo
paths:
  skills: knowledge-engine/skills
  tools: knowledge-engine/tools
  agentInstructions: AGENTS.md
knowledgeBases:
  demo:
    name: 匿名 Web 演示
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
  await mkdir(path.dirname(samplePath), { recursive: true });
  await writeFile(path.join(linkedRoot, '连接原文.md'), '# 连接原文\n\n匿名外部文件夹，仅用于浏览器验收。');
  await writeFile(samplePath, '# 浏览器样例\n\n## 原始片段\n\n仅用于匿名 Web 功能验收。\n\n## 后续记录\n\n测试资料不进入私人知识库。');
  const env = { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo', THE_WAY_HERE_PORT: '0', THE_WAY_HERE_WEB_ROOT: path.join(studio, 'apps/web/dist'), TWH_APP_CACHE_ROOT: path.join(root, 'cache') };
  delete env.THE_WAY_HERE_DEV;
  delete env.THE_WAY_HERE_DESKTOP_TOKEN;
  server = spawn(process.execPath, [path.join(studio, 'apps/server/dist/index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', data => { serverLog += data; });
  origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Web server did not become ready: ${serverLog}`)), 30000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', () => { clearTimeout(timer); reject(new Error(`Web server exited: ${serverLog}`)); });
    server.stdout.on('data', data => {
      serverLog += data;
      const ready = serverLog.match(/TWH_READY (http:\/\/127\.0\.0\.1:\d+)/);
      if (ready) { clearTimeout(timer); resolve(ready[1]); }
    });
  });
  console.log(`Verification server PID ${server.pid}, ${origin}`);
  const policy = await fetch(`${origin}/api/storage/policy`).then(response => response.json());
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  if (path.basename(policy.stateRoot) !== key || path.basename(path.dirname(policy.stateRoot)) !== 'vaults') throw new Error('Unexpected test state location');
  stateRoot = policy.stateRoot;
  browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400) apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  const go = async route => { await page.goto(origin + route); await expect(page.locator('main')).toBeVisible(); };

  await go('/');
  await expect(page.locator('.model-onboarding-dialog')).toBeVisible();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '稍后再配置 AI 模型？' })).toBeVisible();
  await page.getByRole('checkbox', { name: '不再提醒我', exact: true }).check();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  await expect(page.locator('.model-onboarding-dialog')).toHaveCount(0);
  record('AI onboarding can be postponed without blocking local browsing');

  const routes = ['/', '/questions', '/sources', '/knowledge', '/insights', '/timeline', '/letters', '/relationships', '/predict-self'];
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await go(route);
      await expect(page.locator('main h1').first()).toBeAttached();
      await expect(page.locator('main .loading')).toHaveCount(0);
      await expect(page.locator('.desktop-navigation a.active')).not.toHaveCount(0);
      await page.screenshot({ path: path.join(captures, `${width}-${route.slice(1) || 'today'}.png`), animations: 'disabled' });
    }
  }
  expect(apiFailures).toEqual([]);
  record('all nine main routes load at desktop and narrow browser widths');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await go('/');
  await page.getByRole('button', { name: '搜索与命令', exact: true }).click();
  const palette = page.locator('.command-palette');
  await palette.locator('input').fill('浏览器样例');
  await palette.getByRole('option').filter({ hasText: '浏览器样例' }).click();
  await expect(page.getByRole('textbox', { name: '浏览器样例 文件名', exact: true })).toHaveValue('浏览器样例');
  await expect(page.locator('.editable-document-body')).toContainText('仅用于匿名 Web 功能验收');
  record('global search finds and opens indexed source content');

  const body = page.locator('.editable-document-activate');
  await body.press('Enter');
  const editor = page.locator('[data-document-editor]');
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n\n浏览器自动保存验证。');
  await expect.poll(() => readFile(samplePath, 'utf8')).toContain('浏览器自动保存验证。');
  await editor.press('Escape');
  await page.reload();
  await expect(page.locator('.editable-document-body')).toContainText('浏览器自动保存验证。');
  record('document keyboard editing, autosave and reload persist to the original file');

  const nameInput = page.getByRole('textbox', { name: '浏览器样例 文件名', exact: true });
  await nameInput.fill('浏览器样例改名');
  await nameInput.press('Enter');
  await expect.poll(() => readFile(samplePath.replace('浏览器样例.md', '浏览器样例改名.md'), 'utf8').catch(() => '')).toContain('浏览器自动保存验证。');
  await expect(page.locator('.document-file-name input')).toHaveValue('浏览器样例改名');
  await page.locator('.document-file-name input').fill('浏览器样例');
  await page.locator('.document-file-name input').press('Enter');
  await expect.poll(() => readFile(samplePath, 'utf8').catch(() => '')).toContain('浏览器自动保存验证。');
  await go(`/page/${sampleId.split('/').map(encodeURIComponent).join('/')}?detached=true`);
  await expect(page.locator('.document-readonly-title')).toContainText('浏览器样例');
  await page.locator('.editable-document-body').dblclick();
  await expect(page.locator('[data-document-editor]')).toHaveCount(0);
  record('file rename preserves content; detached reading stays read-only');

  await go('/');
  await page.getByRole('button', { name: '说一段', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '请在 Mac 客户端中使用麦克风' })).toBeVisible();
  await expect(page.getByText('请在 macOS 桌面应用中连接系统照片库。', { exact: false })).toBeVisible();
  const capture = page.getByRole('textbox', { name: '此刻的记录', exact: true });
  await capture.fill('匿名浏览器草稿，不调用真实模型。');
  await expect.poll(async () => {
    const response = await fetch(`${origin}/api/capture/history?knowledgeBaseId=demo`).then(value => value.json());
    return response.entries.some(entry => entry.text === '匿名浏览器草稿，不调用真实模型。');
  }).toBe(true);
  await page.getByRole('button', { name: '暂存', exact: true }).click();
  await expect(capture).toHaveValue('');
  await page.getByRole('button', { name: /历史记录/ }).click();
  await page.getByRole('button', { name: '恢复续写', exact: true }).click();
  await expect(capture).toHaveValue('匿名浏览器草稿，不调用真实模型。');
  await page.getByRole('button', { name: /保存到/ }).click();
  const folderDialog = page.getByRole('dialog', { name: '保存位置', exact: true });
  await folderDialog.getByRole('textbox', { name: '新文件夹名称', exact: true }).fill('浏览器草稿目录');
  await folderDialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
  await folderDialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.locator('.capture-destination strong')).toHaveText('浏览器草稿目录');
  record('browser draft autosave, history and restore work; native features explain their availability');

  await go('/letters');
  await expect(page.locator('.file-browser-item').first()).toBeVisible();
  await expect(page.locator('.source-preview .editable-document-body')).toBeVisible();
  await page.getByRole('button', { name: '主动写一封', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭写信窗口', exact: true }).click();
  await page.getByRole('button', { name: '用新视角重读', exact: true }).click();
  const lenses = page.locator('.letter-lens-popover .letter-lens-choice');
  await expect(lenses.first()).toBeVisible();
  await lenses.first().click();
  await expect(page.locator('.context-agent-composer textarea')).toHaveValue(/独立人物视角版本/);
  record('letter list, original reading and composer open without a desktop bridge');

  await go('/timeline');
  const stageButtons = page.locator('button.understanding-timeline-item');
  await expect(stageButtons.first()).toBeVisible();
  const stageCount = await stageButtons.count();
  if (stageCount > 1) await stageButtons.nth(1).click();
  await expect(page.locator('.stage-network-header h2')).toBeVisible();
  await page.getByRole('button', { name: /预览阶段：/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await go('/questions');
  await page.evaluate(() => window.addEventListener('open-context-agent', event => { window.webVerificationTopic = event.detail; }, { once: true }));
  await page.getByRole('button', { name: '聊聊这个', exact: false }).first().click();
  await expect(page.locator('.context-agent-panel')).toBeVisible();
  expect(await page.evaluate(() => window.webVerificationTopic?.attachedContext?.topicId)).toBeTruthy();
  await expect(page.locator('.context-agent-composer textarea')).toHaveAttribute('placeholder', /已经带上了这页的上下文/);
  record('timeline selection, stage preview and evidence-bound topic conversation work');

  await go('/sources');
  const expandFolders = page.getByRole('button', { name: '展开文件夹栏', exact: true });
  if (await expandFolders.isVisible()) await expandFolders.click();
  const folderPrompt = async dialog => {
    if (dialog.type() === 'prompt') await dialog.accept(linkedRoot);
    else if (dialog.type() === 'confirm') await dialog.accept();
    else throw new Error(`Unexpected native dialog: ${dialog.type()}`);
  };
  page.on('dialog', folderPrompt);
  await page.getByRole('button', { name: '打开文件夹…', exact: false }).click();
  await expect(page.getByRole('button', { name: '连接原文.md', exact: true })).toBeVisible();
  page.off('dialog', folderPrompt);
  await page.getByRole('button', { name: '连接原文.md', exact: true }).click();
  await expect(page.locator('.source-preview')).toContainText('匿名外部文件夹，仅用于浏览器验收。');
  const connections = await fetch(`${origin}/api/source-connections`).then(response => response.json());
  expect(connections).toHaveLength(1);
  const externalRoot = page.getByRole('tree', { name: '文件夹树' }).locator(`[data-folder="外部来源/${connections[0].id}"]`);
  await externalRoot.hover();
  await externalRoot.getByRole('button', { name: /更多文件夹操作/ }).click();
  await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toHaveCount(0);
  await expect(page.getByText('只移除入口，不会删除磁盘上的文件', { exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '从列表移除', exact: true }).click();
  await expect(externalRoot).toHaveCount(0);
  expect(await fetch(`${origin}/api/source-connections`).then(response => response.json())).toEqual([]);
  expect(await readFile(path.join(linkedRoot, '连接原文.md'), 'utf8')).toContain('匿名外部文件夹');
  await expect(page.locator('.source-connections article, .source-connections label, .source-connections-popover')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /断开连接|确认断开|连接原始目录/ })).toHaveCount(0);
  record('folder menu matches App: open original folder, remove list entry and preserve original files');

  // App's native menu owns Cmd/Ctrl+O; Web must open the same import dialog once.
  for (const modifier of ['Meta', 'Control']) {
    await go('/');
    let prompts = 0;
    const rejectFolderPrompt = async dialog => { prompts++; await dialog.dismiss(); };
    page.on('dialog', rejectFolderPrompt);
    await page.keyboard.press(`${modifier}+o`);
    await expect(page.getByRole('dialog', { name: '带一段记录进来', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Repeat on Sources, where the removed folder listener used to intercept Cmd+O.
    await page.keyboard.press(`${modifier}+o`);
    await expect(page.getByRole('dialog', { name: '带一段记录进来', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    page.off('dialog', rejectFolderPrompt);
    expect(prompts).toBe(0);
  }
  record('Cmd/Ctrl+O matches native import menu on every route, with no folder prompt');

  async function importFile(kind, file, action = '导入 1 个文件') {
    await go('/sources');
    await page.getByRole('button', { name: '导入资料', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true });
    await dialog.locator('.import-type-grid button').filter({ hasText: kind }).click();
    await dialog.locator('input[name="import-files"]').setInputFiles(file);
    await dialog.getByRole('button', { name: '下一步', exact: true }).click({ timeout: 30000 });
    await dialog.getByRole('button', { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30000 });
  }
  await importFile('聊天记录', { name: 'web-chat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    title: '匿名浏览器对话', messages: [{ role: 'user', content: '今天试着记录一件小事。' }, { role: 'assistant', content: '这是一条虚构的验收回复。' }],
  })) });
  let imported = await fetch(`${origin}/api/imports`).then(response => response.json());
  expect(imported.some(batch => batch.channel === 'chatgpt' && batch.files.length)).toBe(true);
  const csv = [
    '支付宝交易记录明细查询',
    '交易号,商家订单号,交易创建时间,付款时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态',
    '0000000000000000000000000001,anonymous-order,2026-01-01 12:00:00,2026-01-01 12:00:00,2026-01-01 12:00:00,其他,即时到账交易,匿名便利店,测试消费,5.00,支出,交易成功,0.00,0.00,,已支出',
  ].join('\r\n');
  await importFile('消费账单', { name: 'web-bill.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  imported = await fetch(`${origin}/api/imports`).then(response => response.json());
  expect(imported.some(batch => batch.channel === 'alipay' && batch.files.length)).toBe(true);
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await importFile('照片', { name: 'web-photo.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') }, '开始认人物');
  imported = await fetch(`${origin}/api/imports`).then(response => response.json());
  expect(imported.some(batch => batch.channel === 'photos' && batch.files.length)).toBe(true);
  record('chat, Alipay CSV and photo imports complete through the real Web API without an AI service');

  for (const route of ['/capture', '/preferences', '/preferences?tab=ai', '/privacy', '/search?q=浏览器样例']) {
    await go(route);
    await expect(page.locator('main h1').first()).toBeVisible();
  }

  await go('/sources?q=浏览器样例');
  const sampleRow = page.locator('.source-file-row').filter({ has: page.getByRole('button', { name: '浏览器样例.md', exact: true }) });
  await expect(sampleRow).toHaveCount(1);
  await sampleRow.getByRole('button', { name: '更多文件操作：浏览器样例', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '删除文件', exact: true }).click();
  await expect.poll(() => readFile(samplePath, 'utf8').then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))).toBe(false);
  record('source search and confirmed file deletion update the underlying library');

  await go('/');
  await page.locator('.global-kb-trigger').click();
  await page.getByRole('menuitem', { name: '新建一个知识库', exact: true }).click();
  await page.getByRole('textbox', { name: '空间名称', exact: true }).fill('匿名隔离测试库');
  await page.getByRole('button', { name: '创建并开始', exact: true }).click();
  await expect(page.locator('.global-kb-trigger')).toContainText('匿名隔离测试库');
  await expect(page.getByRole('textbox', { name: '此刻的记录', exact: true })).toHaveValue('');
  await go('/letters');
  await expect(page.getByText('当前范围暂无回信，可以切换筛选查看。', { exact: true })).toBeVisible();
  await page.locator('.global-kb-trigger').click();
  await page.getByRole('menuitemradio').filter({ hasText: '匿名 Web 演示' }).click();
  await expect(page.locator('.global-kb-trigger')).toContainText('匿名 Web 演示');
  await expect(page.locator('.source-preview .editable-document-body')).toBeVisible();
  await go('/');
  await expect(page.getByRole('textbox', { name: '此刻的记录', exact: true })).toHaveValue('匿名浏览器草稿，不调用真实模型。');
  await page.locator('.global-kb-trigger').click();
  await page.getByRole('menuitem', { name: '删除知识库「匿名隔离测试库」', exact: true }).click();
  await page.getByRole('button', { name: '删除知识库', exact: true }).click();
  await expect.poll(async () => (await fetch(`${origin}/api/vault`).then(value => value.json())).knowledgeBases.length).toBe(1);
  await expect(page.getByRole('textbox', { name: '此刻的记录', exact: true })).toHaveValue('匿名浏览器草稿，不调用真实模型。');
  record('knowledge-base creation, empty states, switching, isolated drafts and deletion work');
  expect(errors).toEqual([]);
  expect(apiFailures).toEqual([]);
  record('capture, preferences, AI setup, privacy and search routes render without runtime or API errors');
  console.log(`Web verification passed: ${passed.length} groups. Real AI generation and macOS permissions are outside this anonymous browser run.`);
} finally {
  const cleanup = await Promise.allSettled([browser?.close(), stopServer()]);
  if (server?.pid) { let alive = true; try { process.kill(server.pid, 0); } catch { alive = false; } if (alive) throw new Error('Verification server is still running'); }
  if (origin) { const response = await fetch(`${origin}/api/health`).catch(() => null); if (response?.ok) throw new Error('Verification port is still listening'); }
  if (stateRoot) await rm(stateRoot, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await rm(linkedRoot, { recursive: true, force: true });
  for (const result of cleanup) if (result.status === 'rejected') throw result.reason;
  console.log('Verification browser, server, port and anonymous state cleaned up.');
}
