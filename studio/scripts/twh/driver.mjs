// 验证实例的驾驶进程。launch 时在后台启动，独占一个匿名工作区、一个服务、一个浏览器。
// 只听 127.0.0.1 上的随机端口和一次性令牌。cleanup 之后不留进程、端口和临时目录，只留证据。
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = path.join(studio, '.runtime/verify');
const sessionFile = path.join(runtime, 'session.json');
const session = JSON.parse(process.argv[2] ?? '{}');
const evidenceRoot = path.join(studio, '.runtime/evidence', session.runId);
const errors = [];
const apiFailures = [];
let server;
let browser;
let page;
let origin;
let control;
let closing = false;

try {
  await mkdir(runtime, { recursive: true });
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(sessionFile, `${JSON.stringify({ ...session, pid: process.pid, starting: true }, null, 2)}\n`);
  await prepareWorkspace();
  origin = await startServer();
  browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400) apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const port = await listen();
  await writeFile(sessionFile, `${JSON.stringify({ ...session, pid: process.pid, port, origin, evidenceDir: path.relative(studio, evidenceRoot) }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`验证实例启动失败：${error.message}\n`);
  await cleanup();
  process.exit(1);
}

// 没人来清理时自己收摊，不留孤儿进程。
setTimeout(() => void cleanup().then(() => process.exit(0)), session.maxAgeMs ?? 2 * 60 * 60 * 1000).unref();
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => void cleanup().then(() => process.exit(0)));

async function listen() {
  control = createServer((request, response) => void handle(request, response).catch(error => reply(response, 500, { error: error.message })));
  await new Promise(resolve => control.listen(0, '127.0.0.1', resolve));
  return control.address().port;
}

async function handle(request, response) {
  const url = new URL(request.url, 'http://twh.local');
  if (request.headers['x-twh-token'] !== session.token) return reply(response, 403, { error: '令牌不对，这个实例不是你启动的。' });
  const body = request.method === 'POST' ? JSON.parse(await text(request) || '{}') : {};
  if (url.pathname === '/doctor') return reply(response, 200, await doctor());
  if (url.pathname === '/go') {
    await page.goto(origin + body.route);
    await expect(page.locator('main')).toBeVisible();
    return reply(response, 200, { url: page.url(), h1: await page.locator('main h1').first().innerText().catch(() => null) });
  }
  if (url.pathname === '/eval') {
    const timeout = Number(body.timeout ?? 30);
    let timer;
    const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`drive 超过 ${timeout} 秒`)), timeout * 1000); });
    try {
      const result = await Promise.race([new AsyncFunction('page', 'expect', 'origin', body.code)(page, expect, origin), guard]);
      return reply(response, 200, { result: json(result), errors, apiFailures });
    } finally { clearTimeout(timer); }
  }
  if (url.pathname === '/evidence') {
    const target = path.join(evidenceRoot, `${body.name}.${body.kind === 'aria' ? 'aria.txt' : 'png'}`);
    if (body.kind === 'aria') await writeFile(target, await page.locator('body').ariaSnapshot());
    else await page.screenshot({ path: target, fullPage: true, animations: 'disabled' });
    return reply(response, 200, { path: path.relative(studio, target) });
  }
  if (url.pathname === '/cleanup') {
    reply(response, 200, { evidenceDir: path.relative(studio, evidenceRoot) });
    await cleanup();
    control.close();
    return process.exit(0);
  }
  reply(response, 404, { error: `没有 ${url.pathname}` });
}

function reply(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function text(stream) {
  let value = '';
  for await (const chunk of stream) value += chunk;
  return value;
}

function json(value) {
  try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return String(value); }
}

async function doctor() {
  const health = await fetch(`${origin}/api/health`).then(response => response.ok, () => false);
  const problems = [];
  if (!health) problems.push(`服务没有响应：${origin}`);
  if (!session.workspace.startsWith(await realpath(os.tmpdir()))) problems.push('工作区不在临时目录里');
  if (!browser?.isConnected()) problems.push('浏览器已断开');
  return { ok: problems.length === 0, problems, origin, workspace: session.workspace, head: session.head, evidenceDir: path.relative(studio, evidenceRoot), browser: browser?.version() };
}

async function prepareWorkspace() {
  const root = session.workspace;
  const skip = file => !['.runtime', '__pycache__', '.DS_Store', 'node_modules'].includes(path.basename(file));
  await mkdir(path.join(root, 'vault'), { recursive: true });
  await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true, filter: skip });
  await cp(path.join(studio, '../knowledge-engine'), path.join(root, 'knowledge-engine'), { recursive: true, filter: skip });
  await writeFile(path.join(root, 'AGENTS.md'), '# 匿名验证工作区\n\n只用于验证，不含任何私人内容。\n');
  await writeFile(path.join(root, 'the-way-here.config.yaml'), `version: 3
name: 匿名验证
defaultKnowledgeBase: demo
paths:
  skills: knowledge-engine/skills
  tools: knowledge-engine/tools
  agentInstructions: AGENTS.md
knowledgeBases:
  demo:
    name: 匿名验证
    description: verify-twh 启动的一次性实例
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
}

async function startServer() {
  // HOME 指到临时工作区：应用状态默认写在 ~/Library/Application Support 下，不改的话每次验证都往用户的真实目录里留东西。
  const home = path.join(session.workspace, 'home');
  await mkdir(home, { recursive: true });
  const env = { ...process.env, HOME: home, THE_WAY_HERE_VAULT: session.workspace, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo', THE_WAY_HERE_PORT: '0', THE_WAY_HERE_WEB_ROOT: path.join(studio, 'apps/web/dist'), TWH_APP_CACHE_ROOT: path.join(session.workspace, 'cache') };
  delete env.THE_WAY_HERE_DEV;
  delete env.THE_WAY_HERE_DESKTOP_TOKEN;
  let log = '';
  server = spawn(process.execPath, [path.join(studio, 'apps/server/dist/index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const record = chunk => { log = (log + chunk).slice(-20_000); };
  server.stdout.on('data', record);
  server.stderr.on('data', record);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { clearInterval(poll); reject(new Error(`服务 30 秒内没有就绪。日志末尾：\n${log.slice(-2000)}`)); }, 30_000);
    server.once('error', error => { clearTimeout(timer); clearInterval(poll); reject(error); });
    server.once('exit', () => { clearTimeout(timer); clearInterval(poll); reject(new Error(`服务启动后退出了。日志末尾：\n${log.slice(-2000)}`)); });
    const poll = setInterval(() => {
      const ready = log.match(/TWH_READY (http:\/\/127\.0\.0\.1:\d+)/);
      if (ready) { clearTimeout(timer); clearInterval(poll); resolve(ready[1]); }
    }, 50);
  });
}

async function cleanup() {
  if (closing) return;
  closing = true;
  await browser?.close().catch(() => {});
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    server.kill('SIGTERM');
    try { await exited; } finally { clearTimeout(timer); }
  }
  if (origin) {
    const still = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
    if (still) throw new Error(`端口还在监听：${origin}`);
  }
  await rm(session.workspace, { recursive: true, force: true });
  await rm(sessionFile, { force: true });
  await stat(evidenceRoot).catch(() => mkdir(evidenceRoot, { recursive: true }));
}
