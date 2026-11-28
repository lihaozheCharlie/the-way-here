// pnpm install 时把 git hook 指到仓库里的 .githooks。幂等；每个 worktree 各自解析这个相对路径。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.CI) process.exit(0);

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...parts) => spawnSync('git', parts, { cwd: studio, encoding: 'utf8' }).stdout.trim();
const current = git('config', '--get', 'core.hooksPath');

if (current !== '.githooks') {
  const set = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: studio, encoding: 'utf8' });
  if (set.status !== 0) {
    console.error(`git hook 没装上：${set.stderr.trim()}`);
    process.exit(0);
  }
}
console.log('git hook 已启用：提交前隐私扫描和 lint，提交说明格式，推送前 gate 和裁判校验。');
