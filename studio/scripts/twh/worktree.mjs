// worktree：并行 Agent 各用各的，别在一个工作树里互相覆盖。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(studio, '..');
const git = (cwd, ...parts) => spawnSync('git', parts, { cwd, encoding: 'utf8' }).stdout.trim();

export function create(name) {
  if (!/^[a-z0-9][a-z0-9/_-]{1,60}$/.test(name)) throw new Error(`worktree 名字只能用小写字母、数字、斜杠、连字符：${name}`);
  const target = path.join(studio, '.runtime/worktrees', name);
  if (existsSync(target)) throw new Error(`${target} 已经存在。换个名字，或先 pnpm twh worktree prune。`);
  spawnSync('git', ['fetch', 'origin'], { cwd: root, stdio: 'ignore' });
  const add = spawnSync('git', ['worktree', 'add', target, '-b', name, 'origin/main'], { cwd: root, stdio: 'inherit' });
  if (add.status !== 0) throw new Error(`建 worktree 失败。分支名可能已存在：git branch -D ${name}`);
  const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: path.join(target, 'studio'), stdio: 'inherit' });
  if (install.status !== 0) throw new Error('依赖没装上。');
  return { path: target, branch: name, studio: path.join(target, 'studio') };
}

export function audit() {
  const text = git(root, 'worktree', 'list', '--porcelain');
  const entries = [];
  for (const block of text.split('\n\n').filter(Boolean)) {
    const fields = Object.fromEntries(block.split('\n').map(line => { const i = line.indexOf(' '); return i < 0 ? [line, true] : [line.slice(0, i), line.slice(i + 1)]; }));
    const location = fields.worktree;
    if (!location || !existsSync(location)) continue;
    const head = (fields.Head ?? '').slice(0, 7);
    const branch = (fields.branch ?? 'detached').replace('refs/heads/', '');
    const dirty = git(location, 'status', '--porcelain').split('\n').filter(Boolean).length;
    const merged = spawnSync('git', ['merge-base', '--is-ancestor', fields.Head, 'origin/main'], { cwd: root }).status === 0;
    const age = Math.round((Date.now() - Date.parse(git(location, 'log', '-1', '--format=%cI') + 'Z')) / 86_400_000);
    entries.push({ path: location.replace(root + '/', ''), branch, head, dirty, merged, ageDays: age, bucket: dirty ? `wip:${dirty}` : merged ? 'safe' : 'unmerged' });
  }
  return entries;
}

export function prune(target, { yes = false } = {}) {
  const location = path.resolve(root, target);
  const entry = audit().find(item => path.resolve(root, item.path) === location);
  if (!entry) throw new Error(`不是这个仓库的 worktree：${target}`);
  if (entry.dirty) throw new Error(`${target} 有 ${entry.dirty} 处未提交改动，删了就没了。先提交或收走。`);
  if (!entry.merged) throw new Error(`${target} 的分支还没并进 main，删了分支还在，但先确认不需要了。确认就先 git branch -D。`);
  if (!yes) throw new Error(`确认要删 ${target} 就加 --yes。`);
  const remove = spawnSync('git', ['worktree', 'remove', location], { cwd: root, encoding: 'utf8' });
  if (remove.status !== 0) throw new Error(remove.stderr.trim());
  spawnSync('git', ['worktree', 'prune'], { cwd: root });
  return { pruned: target };
}
