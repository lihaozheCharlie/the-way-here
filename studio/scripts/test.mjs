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
  ['node', '--test', ...readdirSync(path.join(studio, 'scripts')).filter(file => file.endsWith('.test.mjs')).map(file => `scripts/${file}`), ...readdirSync(path.join(studio, 'scripts/hooks')).filter(file => file.endsWith('.test.mjs')).map(file => `scripts/hooks/${file}`)],
  ['pnpm', 'test:desktop'],
];

let status = 0;
for (const [command, ...args] of steps) {
  if (command === 'node') console.log(`\nstudio/scripts（工具自身的测试）:`);
  status = spawnSync(command, args, { cwd: studio, stdio: 'inherit', env: { ...process.env, TWH_TEST_STATE_ROOT: state } }).status ?? 1;
  if (status !== 0) break;
}
rmSync(state, { recursive: true, force: true });
process.exit(status);
