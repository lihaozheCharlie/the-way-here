// ZCode 的 PreToolUse hook：Agent 用 Bash 推 main 之前，必须有绑定该 HEAD 的 PASS 裁决书。
// 不靠 Agent 记得走流程；--no-verify、改 hooksPath、跳过变量一并拦下。目标解析在 push-targets.mjs，有测试。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushTargets } from './push-targets.mjs';

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
  const fallback = input.cwd ?? process.env.ZCODE_PROJECT_DIR ?? process.cwd();
  const dirs = new Set();
  for (const match of command.matchAll(/\bgit\s+(?:-C\s+(\S+)\s+)?(?:-c\s+\S+\s+)*push\b/g)) {
    const before = command.slice(0, match.index);
    dirs.add(resolveDir(before, match[1] ? [match[1]] : [], fallback));
  }
  for (const dir of dirs) {
    if (!dir) continue;
    const git = (...parts) => spawnSync('git', ['-C', dir, ...parts], { encoding: 'utf8' }).stdout.trim();
    const result = pushTargets(command, { remotes: git('remote').split('\n').filter(Boolean), branch: git('rev-parse', '--abbrev-ref', 'HEAD') || 'HEAD' });
    if (!result.count) continue;
    if (result.bypass) {
      block('push-guard: 不绕过门。--no-verify、改 hooksPath、跳过变量都不行。门没过就修；门本身错了单独一个提交改门并让裁判会签；缺裁决书就按 studio/agents/twh/judge.md 派裁判。');
    }
    if (!result.main.length) continue;
    const head = git('rev-parse', 'HEAD');
    const verdict = spawnSync('node', [path.resolve(here, '../twh.mjs'), 'judge', 'check', '--head', head], { cwd: dir, encoding: 'utf8' });
    if (verdict.status !== 0) {
      process.stderr.write(verdict.stderr || '');
      block(`push-guard: 推 main 需要 HEAD ${head.slice(0, 7)} 的 PASS 裁决书。按 studio/agents/twh/judge.md 派裁判；之后任何提交都会让裁决书失效。`);
    }
  }
}

function resolveDir(before, explicit, fallback) {
  const changes = [...before.matchAll(/\bcd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)];
  const lastChange = changes.at(-1);
  const target = explicit[0] ?? (lastChange ? lastChange[1] ?? lastChange[2] ?? lastChange[3] : fallback);
  if (!target) return null;
  const dir = path.resolve(fallback ?? process.cwd(), target.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
  return spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || null;
}
