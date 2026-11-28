// 单测入口：依次跑各包的单测、工具自身的测试、桌面端测试，第一个失败就停。
// 应用状态目录指到一个临时目录：run-manager 默认把状态写在 ~/Library/Application Support 下，
// 不指走的话每跑一次单测就在用户的真实目录里留一个文件夹。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'twh-test-state-'));
const steps = [
  ...['wiki-core', 'life-views', 'run-manager', 'server', 'web'].map(name => ['pnpm', '--filter', `@the-way-here/${name}`, 'test']),
  ['node', '--test', '--test-concurrency=1', '--test-timeout=120000', ...readdirSync(path.join(studio, 'scripts')).filter(file => file.endsWith('.test.mjs')).map(file => `scripts/${file}`), ...readdirSync(path.join(studio, 'scripts/hooks')).filter(file => file.endsWith('.test.mjs')).map(file => `scripts/hooks/${file}`)],
  ['pnpm', 'test:desktop'],
];

// 每步限时：CI 上曾有一个测试在 Linux 上静默挂死，烧掉整个 job 的超时。
// 挂起要变成带名字的红失败，而不是没有输出的等待。
let status = 0;
for (const [command, ...args] of steps) {
  if (command === 'node') console.log(`\nstudio/scripts（工具自身的测试）:`);
  const label = `${command} ${args.join(' ')}`;
  const run = spawnSync(command, args, { cwd: studio, stdio: 'inherit', env: { ...process.env, TWH_TEST_STATE_ROOT: state }, timeout: 600_000 });
  if (run.error?.code === 'ETIMEDOUT' || run.signal === 'SIGTERM') {
    console.error(`\n这一步 10 分钟没有结束，按挂起处理：${label}`);
    status = 1;
    break;
  }
  status = run.status ?? 1;
  if (status !== 0) break;
}
rmSync(state, { recursive: true, force: true });
process.exit(status);
