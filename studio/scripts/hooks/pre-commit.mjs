// 提交前：隐私扫描、暂存文件的 lint、类型检查。几秒钟，不跑单测。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.env.TWH_SKIP_HOOKS === '1') process.exit(0);

const git = (...parts) => spawnSync('git', parts, { cwd: path.resolve(studio, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout;
const root = git('rev-parse', '--show-toplevel').trim();

const entries = git('diff', '--cached', '--name-status', '--no-renames').split('\n').filter(Boolean).map(line => {
  const [status, file] = line.split('\t');
  return { status, file };
});
const files = entries.map(entry => entry.file);
if (!files.length) process.exit(0);

const problems = [];

// 私人知识库和运行时状态不进公开仓库。.gitignore 已经挡住未跟踪文件，这里挡 git add -f。
for (const file of files) {
  if (file.startsWith('vault/') && !/^vault\/(demo\/|README\.md$)/.test(file)) problems.push(`${file}: 私人知识库不进公开仓库`);
  if (/(^|\/)\.runtime\//.test(file)) problems.push(`${file}: 运行时状态和本地产物不提交`);
}

const secret = /\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{24,}|\bghp_[A-Za-z0-9]{36}|\bAKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/;
const homePath = /\/Users\/(?!anonymous\/|example\/|test\/|you\/)[A-Za-z0-9._-]+\//;
const scannable = files.filter(file => !/pnpm-lock\.yaml$|\.(?:png|jpe?g|gif|ico|icns|woff2?|onnx|mp4|caf|zip)$/.test(file) && entries.find(entry => entry.file === file)?.status !== 'D');
const diff = git('diff', '--cached', '--unified=0', '--no-color', '--', ...scannable);
const allow = readFileSync(path.join(root, '.githooks/allow-privacy.txt'), 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => new RegExp(line));
let file = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
  if (line.startsWith('+') && !line.startsWith('+++')) {
    const kind = secret.test(line) ? '疑似密钥' : homePath.test(line) ? '本机绝对路径' : null;
    if (kind && !allow.some(pattern => pattern.test(line))) problems.push(`${file}: ${kind}: ${line.slice(1).trim().slice(0, 120)}`);
  }
}

if (problems.length) {
  console.error('提交被拦下，处理后再提交：');
  for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
  console.error('确认是误报就写进 .githooks/allow-privacy.txt，每行一条正则，并让裁判会签。');
  process.exit(1);
}

const lintable = files.filter(file => /\.(?:ts|tsx|mjs|cjs)$/.test(file) && file.startsWith('studio/'));
if (lintable.length) {
  const lint = spawnSync('pnpm', ['exec', 'eslint', ...lintable.map(file => path.relative(studio, path.join(root, file)))], { cwd: studio, encoding: 'utf8' });
    process.stderr.write(lint.stderr || '');
  if (lint.status !== 0) {
    console.error('暂存文件有 lint 问题。用 `pnpm lint <文件>` 看详情。');
    process.exit(1);
  }
}

const typechecks = files.some(file => /^(?:studio\/(?:apps|packages)\/.*\.(?:ts|tsx|json)|studio\/tsconfig[^/]*\.json)$/.test(file));
if (typechecks) {
  const check = spawnSync('pnpm', ['typecheck'], { cwd: studio, encoding: 'utf8' });
  if (check.status !== 0) {
    process.stdout.write(check.stdout || '');
    process.stderr.write(check.stderr || '');
    console.error('类型检查没过。');
    process.exit(1);
  }
}
