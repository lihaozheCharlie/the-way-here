import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hookEnv } from './hook-env.mjs';

// git 调 hook 时设置了 GIT_DIR（git 目录的绝对路径）但不设 GIT_WORK_TREE，git 就把当前目录当成工作树。
// 带着它切到 studio/ 再调 git，每个已跟踪文件都会变成"已删除"。
// 第一次推送落地分支时 gate 因此报了 1099 处未提交改动；提交说明检查在同样的环境下读不到暂存区。
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(studio, '..');
const gitDir = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const hookLike = { ...process.env, GIT_DIR: gitDir };

const status = (cwd, env) => spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', env }).stdout.split('\n').filter(Boolean);

test('复现问题：带着 hook 的 GIT_DIR 从 studio/ 跑 git，索引里的文件几乎全部显示为已删除或已修改', () => {
  const indexEntries = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', env: hookLike }).stdout.split('\n').filter(Boolean);
  const reported = status(studio, hookLike).filter(line => !line.startsWith('??'));
  // 工作树被当成了 studio/：绝大多数文件"已删除"，在 studio/ 下恰好有同名文件的显示为"已修改"或碰巧干净。
  assert.ok(reported.length > indexEntries.length * 0.9, `只报了 ${reported.length} / ${indexEntries.length}`);
  assert.ok(reported.every(line => line.startsWith(' D') || line.startsWith(' M')));
});

test('去掉 GIT_* 之后，从 studio/ 跑和从仓库根跑看到一样的状态', () => {
  assert.deepEqual(status(studio, hookEnv(hookLike)), status(root, hookLike));
});

test('hookEnv 只去掉 GIT_ 开头的变量', () => {
  const env = hookEnv({ ...hookLike, TWH_TEST_STATE_ROOT: '/tmp/x', PATH: '/usr/bin' });
  assert.deepEqual(Object.keys(env).filter(name => name.startsWith('GIT_')), []);
  assert.equal(env.TWH_TEST_STATE_ROOT, '/tmp/x');
  assert.equal(env.PATH, '/usr/bin');
});
