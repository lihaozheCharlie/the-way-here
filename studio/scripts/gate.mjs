// 一条门命令：退出码就是结论。本地和 CI 跑同一条命令。
// 每个 HEAD 的每一次运行都追加到 .runtime/gate/<HEAD>.json 的 runs 里：后来的失败盖不住先前的绿。
// 只跑部分步骤的运行不进这个文件，免得被当成完整的一轮。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 按名字挑步骤。没给名字就全跑；给的名字都不认识就返回空数组，由调用方报错。
export function selectSteps(allSteps, only) {
  return only.length ? allSteps.filter(([name]) => only.includes(name)) : allSteps;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

async function main() {
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
    (full || only.includes('build')) && ['build', 'pnpm', ['build']],
  ].filter(Boolean);
  const steps = selectSteps(allSteps, only);
  if (!steps.length) {
    console.error(`没有名为 ${only.join('、')} 的检查。可用：${allSteps.map(([name]) => name).join('、')}`);
    process.exit(2);
  }
  const complete = allSteps.every(([name]) => steps.some(([other]) => other === name));

  const head = git('rev-parse', 'HEAD');
  const dirty = git('status', '--porcelain').split('\n').filter(Boolean);
  const gateRoot = path.join(studio, '.runtime/gate');
  const runId = `${head.slice(0, 7)}-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}-${process.pid}`;
  const logDir = path.join(gateRoot, 'logs', runId);
  mkdirSync(logDir, { recursive: true });
  // 单测会创建运行状态。给它一个临时目录，别写进用户真实的应用状态目录。
  const testState = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'twh-test-state-'));
  const results = [];

  for (const [name, command, parts] of steps) {
    const started = Date.now();
    const exitCode = await runStep(name, command, parts, logDir, testState);
    const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
    results.push({ name, command: [command, ...parts].join(' '), exitCode, seconds });
    console.log(`${exitCode === 0 ? 'PASS' : 'FAIL'} ${name} (${seconds}s)`);
    if (exitCode !== 0) break;
  }
  rmSync(testState, { recursive: true, force: true });

  const report = {
    version: 2,
    at: new Date().toISOString(),
    complete,
    scope: steps.map(([name]) => name),
    full,
    head,
    dirtyCount: dirty.length,
    dirtySample: dirty.slice(0, 20),
    steps: results,
    passed: results.length === steps.length && results.every(step => step.exitCode === 0),
    logs: path.relative(studio, logDir),
  };
  const done = results.filter(step => step.exitCode === 0).length;
  if (complete) {
    const file = path.join(gateRoot, `${head}.json`);
    const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const runs = Array.isArray(previous?.runs) ? previous.runs : previous?.steps ? [previous] : [];
    runs.push(report);
    writeFileSync(file, `${JSON.stringify({ version: 2, head, runs }, null, 2)}\n`);
  }
  writeFileSync(path.join(gateRoot, complete ? 'latest.json' : 'latest-partial.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`gate ${report.passed ? 'passed' : 'failed'}: ${done}/${steps.length} 步${complete ? '' : '（只跑了一部分，不算完整的一轮）'}，HEAD ${head.slice(0, 7)}，未提交改动 ${dirty.length} 处。日志：${report.logs}`);
  process.exit(report.passed ? 0 : 1);
}

function runStep(name, command, parts, logDir, testState) {
  return new Promise(resolve => {
    const chunks = [];
    const child = spawn(command, parts, { cwd: studio, env: { ...process.env, FORCE_COLOR: '0', TWH_TEST_STATE_ROOT: testState }, stdio: ['ignore', 'pipe', 'pipe'] });
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
      writeFileSync(path.join(logDir, `${name}.log`), Buffer.concat(chunks));
      resolve(code ?? 1);
    });
  });
}
