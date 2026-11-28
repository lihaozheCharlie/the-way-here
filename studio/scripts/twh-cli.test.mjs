import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// 用一个假的驾驭进程记下命令行实际发出去的请求，不启动应用。
// 第一轮裁判实测 pnpm twh go <路由> 读错了参数，一直打开首页。
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sessionFile = path.join(studio, '.runtime/verify/session.json');
const cli = path.join(studio, 'scripts/twh.mjs');

test('twh 命令行把参数原样发给驾驭进程', { skip: existsSync(sessionFile) && '已有在跑的验证实例，不动它的会话文件' }, async () => {
  const received = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      received.push({ path: request.url, body: JSON.parse(body || '{}'), token: request.headers['x-twh-token'] });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ path: request.url, ok: true, head: 'deadbeef', problems: [], errors: [], apiFailures: [] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  writeFileSync(sessionFile, JSON.stringify({ pid: process.pid, port: server.address().port, token: 'test-token', evidenceDir: '.runtime/evidence/test', workspace: '/nonexistent' }));
  // 必须异步起子进程：它要请求的假服务就在本进程里，同步等待会互相卡住。
  const run = (...args) => new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: studio });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.once('close', code => { clearTimeout(timer); resolve(code); });
  });
  try {
    await run('go', '/letters');
    await run('go', '/preferences?tab=ai');
    await run('evidence', 'screenshot', '回信列表');
    await run('evidence', 'aria', '回信列表');
    await run('drive', '--eval', 'return 1;');
    await run('doctor');
    await run('evidence', 'bogus', 'x');
  } finally {
    server.close();
    if (existsSync(sessionFile)) unlinkSync(sessionFile);
  }
  const paths = received.map(item => item.path);
  assert.deepEqual(paths, ['/go', '/go', '/evidence', '/evidence', '/eval', '/doctor']);
  assert.equal(received[0].body.route, '/letters');
  assert.equal(received[1].body.route, '/preferences?tab=ai');
  assert.deepEqual([received[2].body.kind, received[2].body.name], ['screenshot', '回信列表']);
  assert.deepEqual([received[3].body.kind, received[3].body.name], ['aria', '回信列表']);
  assert.equal(received[4].body.code, 'return 1;');
  assert.ok(received.every(item => item.token === 'test-token'), '每个请求都带令牌');
});
