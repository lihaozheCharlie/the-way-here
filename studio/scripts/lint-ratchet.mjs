// 棘轮：存量警告只准降不准升。基线在 lint-baseline.json。
// 下调基线：pnpm lint:ratchet --update-baseline。上调必须走裁判会签，见 check-gate-loosening.mjs。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const baselinePath = path.join(studio, 'lint-baseline.json');
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : { rules: {} };

const run = spawnSync('pnpm', ['exec', 'eslint', '.', '-f', 'json'], { cwd: studio, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
// eslint 自己没跑起来（配置错了、崩了）时必须红。否则空的输出会被当成"零警告"，变成假绿。
if (run.status === 2 || run.error || !run.stdout?.trim()) {
  console.error(`eslint 没有正常跑完，棘轮不能判断。\n${(run.stderr || run.error?.message || '').trim().slice(-1500)}`);
  process.exit(2);
}
let results;
try { results = JSON.parse(run.stdout); } catch {
  console.error('eslint 的输出不是 JSON，棘轮不能判断。');
  process.exit(2);
}
if (!Array.isArray(results)) {
  console.error('eslint 的输出结构不对，棘轮不能判断。');
  process.exit(2);
}

const counts = {};
const errors = {};
for (const file of results) {
  for (const message of file.messages) {
    const target = message.severity === 2 ? errors : counts;
    target[message.ruleId || 'parse'] = (target[message.ruleId || 'parse'] || 0) + 1;
  }
}

const errorTotal = Object.values(errors).reduce((sum, count) => sum + count, 0);
if (errorTotal) {
  console.error(`eslint 报了 ${errorTotal} 个 error，先修掉：`);
  for (const [rule, count] of Object.entries(errors).sort((a, b) => b[1] - a[1])) console.error(`  ${rule}: ${count}`);
  process.exit(1);
}

const increases = Object.entries(counts).filter(([rule, count]) => count > (baseline.rules[rule] ?? 0));
const decreases = Object.entries(baseline.rules).filter(([rule, count]) => (counts[rule] ?? 0) < count);

if (args.includes('--update-baseline')) {
  if (increases.length && !args.includes('--force')) {
    console.error('有规则的警告数比基线高，基线只准下调。确认要放宽就加 --force，并让裁判会签。');
    list(increases, baseline);
    process.exit(1);
  }
  const next = { rules: {} };
  for (const [rule, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) if (count) next.rules[rule] = count;
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`基线已更新：${Object.keys(next.rules).length} 条规则，共 ${Object.values(next.rules).reduce((a, b) => a + b, 0)} 个警告。`);
  process.exit(0);
}

if (increases.length) {
  console.error('这些规则的警告数比基线高，新代码不要再用这些写法：');
  list(increases, baseline);
  console.error('修掉新增的警告，或者用 `pnpm lint <文件>` 看具体位置。想放宽基线需要裁判会签。');
  process.exit(1);
}

const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
console.log(`棘轮通过：${total} 个存量警告，没有上升。`);
if (decreases.length) {
  console.log(`有 ${decreases.length} 条规则的警告数降了，可以下调基线：pnpm lint:ratchet --update-baseline`);
  for (const [rule] of decreases.sort((a, b) => b[1] - a[1])) console.log(`  ${rule}: ${baseline.rules[rule]} -> ${counts[rule]}`);
}
process.exit(0);

function list(pairs, base) {
  for (const [rule] of pairs.sort((a, b) => (counts[b[0]] ?? 0) - (counts[a[0]] ?? 0))) console.error(`  ${rule}: ${base.rules[rule] ?? 0} -> ${counts[rule] ?? 0}`);
}
