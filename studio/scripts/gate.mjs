// 一条门命令：退出码就是结论。本地和 CI 跑同一条命令。
// 结果写到 .runtime/gate/<HEAD>.json，裁判和 pre-push hook 读它，不听转述。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const full = args.includes('--full');
const only = args.filter(arg => !arg.startsWith('--'));
const pkg = JSON.parse(readFileSync(path.join(studio, 'package.json'), 'utf8'));
const hasScript = name => Boolean(pkg.scripts?.[name]);
const git = (...parts) => spawnSync('git', parts, { cwd: studio, encoding: 'utf8' }).stdout.trim();

const allSteps = [
  hasScript('lint') && ['lint', 'pnpm', ['lint']],
  hasScript('lint:ratchet') && ['lint-ratchet', 'node', ['scripts/lint-ratchet.mjs']],
  ['typecheck', 'pnpm', ['typecheck']],
  ['test', 'pnpm', ['test']],
  ['rule-table', 'node', ['scripts/check-rule-table.mjs']],
  ['feature-map', 'node', ['scripts/check-feature-map.mjs']],
  full && ['build', 'pnpm', ['build']],
].filter(Boolean);
const steps = only.length ? allSteps.filter(([, name]) => only.includes(name)) : allSteps;

if (!steps.length) {
  console.error(`没有名为 ${only.join('、')} 的检查。可用：${allSteps.map(([, name]) => name).join('、')}`);
  process.exit(2);
}

const head = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain').split('\n').filter(Boolean);
const gateRoot = path.join(studio, '.runtime/gate');
mkdirSync(path.join(gateRoot, 'logs'), { recursive: true });
const results = [];

for (const [name, command, parts] of steps) {
  const started = Date.now();
  const exitCode = await run(name, command, parts);
  const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  results.push({ name, command: [command, ...parts].join(' '), exitCode, seconds });
  console.log(`${exitCode === 0 ? 'PASS' : 'FAIL'} ${name} (${seconds}s)`);
  if (exitCode !== 0) break;
}

const report = {
  head,
  dirtyCount: dirty.length,
  dirtySample: dirty.slice(0, 20),
  full,
  finishedAt: new Date().toISOString(),
  steps: results,
  passed: results.length === steps.length && results.every(step => step.exitCode === 0),
};
const reportPath = path.join(gateRoot, `${head}.json`);
const previous = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
// 同一个 HEAD 留下最好的一次结果，但通过的那次必须是没有未提交改动时跑出来的。
if (!previous || previous.passed !== true || (report.passed && previous.dirtyCount > 0)) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(gateRoot, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`gate ${report.passed ? 'passed' : 'failed'}: ${results.filter(step => step.exitCode === 0).length}/${steps.length} 步，HEAD ${head.slice(0, 7)}，未提交改动 ${dirty.length} 处。结果：.runtime/gate/${head.slice(0, 7)}.json`);
process.exit(report.passed ? 0 : 1);

function run(name, command, parts) {
  return new Promise(resolve => {
    const chunks = [];
    const child = spawn(command, parts, { cwd: studio, env: { ...process.env, FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const forward = target => data => {
      chunks.push(data);
      target.write(data);
    };
    child.stdout.on('data', forward(process.stdout));
    child.stderr.on('data', forward(process.stderr));
    child.once('error', error => {
      process.stderr.write(`${name} 无法启动：${error.message}\n`);
      chunks.push(Buffer.from(`${error.message}\n`));
      resolve(127);
    });
    child.once('close', code => {
      writeFileSync(path.join(gateRoot, 'logs', `${head.slice(0, 7)}-${name}.log`), Buffer.concat(chunks));
      resolve(code ?? 1);
    });
  });
}
