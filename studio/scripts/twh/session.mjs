// twh 命令行里和验证实例打交道的部分：launch、doctor、cleanup 和控制请求。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = path.join(studio, '.runtime/verify');
const sessionFile = path.join(runtime, 'session.json');

export async function launch({ build = false, allowStale = false } = {}) {
  const existing = await readSession();
  if (existing) {
    const alive = await doctor(existing).catch(() => null);
    if (alive) return { reused: true, session: existing, doctor: alive };
    await rm(existing.workspace, { recursive: true, force: true });
    await unlink(sessionFile).catch(() => {});
    console.log('清掉了上次没收拾的验证实例。');
  }

  if (build) run('pnpm', ['build'], studio);
  const dist = await buildStatus();
  if (!dist.present) throw new Error('还没有构建产物。运行 `pnpm twh launch --build`，或先 `pnpm build`。');
  if (dist.stale && !allowStale) throw new Error(`构建产物比源码旧（${dist.builtAt}），实跑看到的不是你刚改的代码。运行 \`pnpm twh launch --build\`；确认要用旧产物就加 --allow-stale。`);

  await mkdir(runtime, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}-${process.pid}`;
  const session = { runId, token: randomBytes(16).toString('hex'), workspace: await mkdtemp(path.join(await realpath(os.tmpdir()), 'twh-verify-')), head: git('rev-parse', 'HEAD'), startedAt: new Date().toISOString() };
  const logPath = path.join(runtime, 'driver.log');
  const log = await open(logPath, 'w');
  const child = spawn(process.execPath, [path.join(studio, 'scripts/twh/driver.mjs'), JSON.stringify(session)], { cwd: studio, detached: true, stdio: ['ignore', log.fd, log.fd] });
  child.unref();
  await log.close();

  const deadline = Date.now() + 90_000;
  let last;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    last = await readSession();
    if (last?.port) {
      const health = await doctor(last).catch(() => null);
      if (health?.ok) return { session: last, doctor: health };
    }
    if (childExit(child)) break;
  }
  const tail = await readFile(logPath, 'utf8').catch(() => '');
  throw new Error(`验证实例没能启动。驾驶日志末尾：\n${tail.slice(-2000)}\n修好后重试；清理用 \`pnpm twh cleanup\`。`);
}

export async function cleanup() {
  const session = await readSession();
  if (!session) return { cleaned: false, note: '没有在跑的验证实例。' };
  let evidenceDir = session.evidenceDir;
  if (session.port) {
    const response = await fetch(`http://127.0.0.1:${session.port}/cleanup`, { method: 'POST', headers: { 'x-twh-token': session.token }, body: '{}' }).catch(() => null);
    const value = await response?.json().catch(() => null);
    if (value?.evidenceDir) evidenceDir = value.evidenceDir;
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && alive(session.pid)) await new Promise(resolve => setTimeout(resolve, 200));
  if (alive(session.pid)) {
    process.kill(session.pid, 'SIGKILL');
    throw new Error(`驾驶进程 ${session.pid} 没有自己退出，已强杀。检查有没有残留端口：lsof -nP -iTCP -sTCP:LISTEN | grep ${session.pid}`);
  }
  await rm(session.workspace, { recursive: true, force: true });
  await unlink(sessionFile).catch(() => {});
  if (session.origin) {
    const still = await fetch(`${session.origin}/api/health`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
    if (still) throw new Error(`服务端口还在监听：${session.origin}`);
  }
  return { cleaned: true, evidenceDir };
}

export async function request(pathname, body = {}) {
  const session = await readSession();
  if (!session?.port) throw new Error('没有在跑的验证实例。先 `pnpm twh launch`。');
  const response = await fetch(`http://127.0.0.1:${session.port}${pathname}`, { method: 'POST', headers: { 'x-twh-token': session.token, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) }).catch(error => { throw new Error(`联系不上验证实例：${error.message}。先 \`pnpm twh doctor\`。`); });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `${pathname} 失败`);
  return value;
}

export async function doctor(session = null) {
  const target = session ?? await readSession();
  if (!target?.port) return { ok: false, problems: ['没有在跑的验证实例。先 `pnpm twh launch`。'] };
  const value = await request('/doctor');
  const dist = await buildStatus();
  const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;
  if (dist.stale) value.problems.push(`构建产物比源码旧，实跑看到的不是当前代码。`);
  if (value.head !== git('rev-parse', 'HEAD')) value.problems.push(`实例是从另一个提交启动的：${value.head.slice(0, 7)}，当前 ${git('rev-parse', 'HEAD').slice(0, 7)}。`);
  return { ...value, ok: value.ok && value.problems.length === 0, dirtyCount: dirty, builtAt: dist.builtAt };
}

export async function readSession() {
  if (!existsSync(sessionFile)) return null;
  try { return JSON.parse(await readFile(sessionFile, 'utf8')); } catch { return null; }
}

export async function buildStatus() {
  const built = ['apps/web/dist/index.html', 'apps/server/dist/index.js'];
  const times = await Promise.all(built.map(file => stat(path.join(studio, file)).then(s => s.mtimeMs, () => null)));
  const present = times.every(Boolean);
  const newest = Math.max(...(await Promise.all(['apps/web/src', 'apps/server/src', ...['wiki-core', 'life-views', 'run-manager', 'shared', 'codex-bridge'].map(name => `packages/${name}/src`)].map(dir => newestMtime(path.join(studio, dir))))));
  const builtAt = Math.min(...times.filter(Boolean));
  return { present, stale: present && newest > builtAt, builtAt: present ? new Date(builtAt).toISOString() : null };
}

async function newestMtime(dir) {
  let newest = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? await newestMtime(file) : (await stat(file)).mtimeMs);
  }
  return newest;
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function childExit(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 失败（${result.status}）。`);
}

function git(...args) {
  return spawnSync('git', args, { cwd: studio, encoding: 'utf8' }).stdout.trim();
}

export const paths = { studio, runtime, sessionFile };
export { writeFile };
