// ZCode 的 PreToolUse hook：Agent 用 Bash 推 main 之前，必须有绑定该 HEAD 的 PASS 裁决书。
// 不靠 Agent 记得走流程；--no-verify 和跳过变量一并拦下。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try { guard(JSON.parse(raw)); }
  catch { /* 读不懂输入就不拦，宁可漏拦也不误拦 */ }
  process.exit(0);
});

function block(reason) {
  console.error(reason);
  process.exit(2);
}

function guard(input) {
  const toolInput = input.tool_input ?? input.toolInput ?? {};
  const command = typeof toolInput === 'string' ? toolInput : String(toolInput.command ?? toolInput.cmd ?? '');
  const pushIndex = command.search(/\bgit\s+(?:-C\s+\S+\s+)?push\b/);
  if (pushIndex < 0) return;
  const segment = command.slice(pushIndex).split(/&&|\|\||[;|\n]/)[0];

  if (/--no-verify/.test(segment)) block('push-guard: 不用 --no-verify。门没过就修，门本身错了单独一个提交改门并让裁判会签。');
  if (/TWH_JUDGE_BYPASS|TWH_SKIP_HOOKS/.test(command)) block('push-guard: 这两个变量是给操作者自己推提交用的，Agent 不用。缺裁决书就按 studio/agents/twh/judge.md 派裁判。');

  const tokens = segment.split(/\s+/).slice(1);
  const args = tokens.filter(token => !token.startsWith('-'));
  const namesMain = args.some(arg => /^main$/.test(arg));
  const target = namesMain ? 'main' : args.length === 0 ? undefined : 'other';
  if (target === 'other') return;

  const dir = resolveDir(command.slice(0, pushIndex), input.cwd ?? process.env.ZCODE_PROJECT_DIR ?? process.cwd());
  if (!dir) return;
  const git = (...parts) => spawnSync('git', ['-C', dir, ...parts], { encoding: 'utf8' }).stdout.trim();
  if (target === undefined && git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') return;

  const head = git('rev-parse', 'HEAD');
  const verdict = spawnSync('node', [path.resolve(here, '../twh.mjs'), 'judge', 'check', '--head', head], { cwd: dir, encoding: 'utf8' });
  if (verdict.status === 0) return;
  process.stderr.write(verdict.stderr || '');
  block(`push-guard: 推 main 需要 HEAD ${head.slice(0, 7)} 的 PASS 裁决书。按 studio/agents/twh/judge.md 派裁判；之后任何提交都会让裁决书失效。`);
}

function resolveDir(before, fallback) {
  const changes = [...before.matchAll(/\bcd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)];
  const target = changes.length ? changes.at(-1)[1] ?? changes.at(-1)[2] ?? changes.at(-1)[3] : fallback;
  if (!target) return null;
  const dir = path.resolve(fallback ?? process.cwd(), target.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
  const root = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  return root || null;
}
