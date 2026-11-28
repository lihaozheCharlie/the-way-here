// 推送前：每个推送都跑门；推 main 还要有绑定该 HEAD 的 PASS 裁决书。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookEnv, hookRoot } from './hook-env.mjs';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.env.TWH_SKIP_HOOKS === '1') process.exit(0);

// git 命令一律在仓库根下跑：路径规格相对根解析，git 给 hook 的 GIT_DIR 也是相对根的。
const root = hookRoot();
// 子工具（裁决校验、gate、知识引擎的门）用自己的 git 命令，不能带着 hook 的 GIT_* 环境。
const env = hookEnv();
const git = (...parts) => spawnSync('git', parts, { cwd: root, encoding: 'utf8' }).stdout.trim();
const pushes = readFileSync(0, 'utf8').split('\n').filter(Boolean).map(line => line.trim().split(/\s+/));
const toMain = pushes.find(([, localSha, remoteRef]) => localSha !== '0'.repeat(40) && /(?:^|\/|[.:])main$/.test(remoteRef));

if (toMain) {
  const [, tip] = toMain;
  if (process.env.TWH_JUDGE_BYPASS === '1') {
    console.error(`pre-push: 跳过裁判校验（TWH_JUDGE_BYPASS=1），HEAD ${tip.slice(0, 7)}，操作者自己推的提交。`);
  } else {
    const verdict = spawnSync('node', [path.join(studio, 'scripts/twh.mjs'), 'judge', 'check', '--head', tip], { cwd: studio, encoding: 'utf8', env });
    process.stderr.write(verdict.stderr || '');
    process.stdout.write(verdict.stdout || '');
    if (verdict.status !== 0) {
      console.error('\n推 main 需要这个 HEAD 的 PASS 裁决书。按 studio/agents/twh/judge.md 派裁判，或用 TWH_JUDGE_BYPASS=1 推自己写的提交。');
      process.exit(1);
    }
  }
}

const gate = spawnSync('pnpm', ['gate'], { cwd: studio, stdio: 'inherit', env });
if (gate.status !== 0) {
  console.error('\ngate 没过，修好再推。');
  process.exit(1);
}

const remoteMain = git('rev-parse', '--verify', '-q', 'origin/main');
const wikiScope = remoteMain ? git('diff', '--name-only', `${remoteMain}..HEAD`, '--', 'knowledge-engine', 'vault/demo') : '';
if (wikiScope) {
  const wiki = spawnSync('python3', [path.resolve(studio, '../knowledge-engine/tools/gate.py')], { cwd: path.resolve(studio, '..'), stdio: 'inherit', env });
  if (wiki.status !== 0) {
    console.error('\n知识引擎的门没过，修好再推。');
    process.exit(1);
  }
}
