// 放宽检测：找出让门变松的改动，交给裁判逐条会签。只报告，不拦截。
// 用法：node studio/scripts/check-gate-loosening.mjs <base>..<head> [--json]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const range = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (!range?.includes('..')) {
  console.error('用法：node studio/scripts/check-gate-loosening.mjs <base>..<head> [--json]');
  process.exit(2);
}
const git = (...parts) => spawnSync('git', parts, { cwd: studio, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout;

const GATE_FILES = /^(\.githooks\/|\.zcode\/config\.json$|\.github\/workflows\/|studio\/eslint\.config\.|studio\/lint-baseline\.json$|knowledge-engine\/ruff\.toml$|knowledge-engine\/tools\/gate\.py$|studio\/scripts\/(?:gate|lint-ratchet|check-[^/]+|hooks\/[^/]+|twh(?:\/[^/]+)?)\.mjs$|studio\/agents\/|\.agents\/(?:skills|commands)\/|studio\/AGENTS\.md$)/;
const PRODUCT = /^studio\/(?:apps|packages)\/.*\/src\/.*\.(?:ts|tsx|mjs|cjs|swift)$/;
const TEST = /\.test\.[^.]+$/;
const CONTRACT = /^studio\/packages\/shared\/src\/.*\.(?:ts|tsx)$/;
const CODE = /\.(?:ts|tsx|mjs|cjs|py|json|ya?ml|sh)$/;
const SUPPRESSION = /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|--no-verify|TWH_SKIP_HOOKS|TWH_JUDGE_BYPASS|# noqa/;
const SUPPRESSION_HOME = /^(?:studio\/scripts\/hooks\/|studio\/scripts\/twh|studio\/scripts\/check-|\.githooks\/)/;
const RULE_ROW = /^\|\s*(R-\d+)\s*\|/gm;
const TEST_CALL = /^\s*(?:it|test|describe)(?:\.\w+)?\(/;
const SKIPPED = /\.(?:skip|only)\(|\b(?:xit|xdescribe|xtest)\(|#\[ignore\]/;
const STEP_REMOVED = /^-\s+\*\*|^##\s/;

const commits = git('rev-list', '--reverse', '--no-merges', range).split('\n').filter(Boolean);
const flags = [];
const note = (kind, commit, files, detail) => flags.push({ kind, commit, files, detail });

for (const commit of commits) {
  const status = git('diff-tree', '--no-commit-id', '--name-status', '-r', commit).split('\n').filter(Boolean).map(line => {
    const [change, ...rest] = line.split('\t');
    return { change: change[0], file: rest.at(-1) };
  });
  const names = status.map(entry => entry.file);
  const gateFiles = names.filter(file => GATE_FILES.test(file));
  const productFiles = names.filter(file => PRODUCT.test(file) && !TEST.test(file));
  if (gateFiles.length && productFiles.length) note('mixed-commit', commit, [...gateFiles, ...productFiles], '同一个提交既改门禁又改产品代码，拆成两个提交。');
  if (gateFiles.length) note('gate-file', commit, gateFiles, '改了门、hook、CI 或 Agent 规则。');
  if (names.some(file => CONTRACT.test(file) && !TEST.test(file)) && !names.some(file => TEST.test(file))) note('contract-change-without-test', commit, names.filter(file => CONTRACT.test(file)), '改了 packages/shared 的契约，但没有改任何测试。');

  if (names.includes('studio/lint-baseline.json')) {
    const before = rulesAt(`${commit}^`, 'studio/lint-baseline.json');
    const after = rulesAt(commit, 'studio/lint-baseline.json');
    const raised = Object.entries(after).filter(([rule, count]) => count > (before[rule] ?? 0));
    if (raised.length) note('ratchet-raised', commit, ['studio/lint-baseline.json'], raised.map(([rule, count]) => `${rule}: ${before[rule] ?? 0} -> ${count}`).join('，'));
  }
  if (names.includes('studio/AGENTS.md')) {
    const before = [...git('show', `${commit}^:studio/AGENTS.md`).matchAll(RULE_ROW)].map(match => match[1]);
    const after = [...git('show', `${commit}:studio/AGENTS.md`).matchAll(RULE_ROW)].map(match => match[1]);
    const removed = before.filter(id => !after.includes(id));
    if (removed.length) note('rule-removed', commit, ['studio/AGENTS.md'], `删了规则 ${removed.join('、')}。确认对应的错误已经不可能发生。`);
  }

  const diff = git('show', '--format=', '--unified=0', commit);
  let file = '';
  let testDelta = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
    if (!line.startsWith('+') && !line.startsWith('-')) continue;
    const added = line.startsWith('+');
    const body = line.slice(1);
    if (/^\.agents\/skills\/verify-twh\/features\/.*\.md$/.test(file) && !added && STEP_REMOVED.test(body)) note('journey-step-removed', commit, [file], `删了一步：${body.trim().slice(0, 80)}`);
    if (TEST.test(file)) {
      if (TEST_CALL.test(body)) testDelta += added ? 1 : -1;
      if (added && SKIPPED.test(body)) note('test-skipped', commit, [file], body.trim().slice(0, 80));
    }
    if (added && CODE.test(file) && !SUPPRESSION_HOME.test(file) && !TEST.test(file) && SUPPRESSION.test(body)) note('suppression-added', commit, [file], body.trim().slice(0, 80));
  }
  if (testDelta < 0) note('test-removed', commit, [...new Set(status.filter(entry => TEST.test(entry.file)).map(entry => entry.file))], `少了 ${-testDelta} 个测试。`);
}

if (process.argv.includes('--json')) console.log(JSON.stringify({ range, commits: commits.length, flags }));
else {
  console.log(`放宽检测 ${range}：${commits.length} 个提交，${flags.length} 条标记。`);
  for (const flag of flags) console.log(`  ${flag.kind.padEnd(30)} ${flag.commit.slice(0, 7)}  ${flag.detail}\n${''.padEnd(42)}${flag.files.slice(0, 6).join('、')}${flag.files.length > 6 ? ` 等 ${flag.files.length} 个文件` : ''}`);
  if (flags.length) console.log('裁判规程要求每一条都有会签（--countersign "<种类>: <理由>"），没有的就是 FAIL。');
}
process.exit(0);

function rulesAt(commit, file) {
  try { return JSON.parse(git('show', `${commit}:${file}`)).rules ?? {}; } catch { return {}; }
}
