// 规则表校验：studio/AGENTS.md 里每条"必须/不得"都登记了谁在强制它，登记的检查必须真的存在。
// 没有机器检查的规则写"文字"，让它一眼可见。用法：node studio/scripts/check-rule-table.mjs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(studio, '..');
const file = path.join(studio, 'AGENTS.md');
const text = readFileSync(file, 'utf8');
const pkg = JSON.parse(readFileSync(path.join(studio, 'package.json'), 'utf8'));
const TRIGGER = /必须|不得|不能|禁止|严禁|不许|不要|不提交|不写入/;
const TAG = /〔(R-\d+)〕/g;
const ROW = /^\|\s*(R-\d+)\s*\|(.+?)\|(.+?)\|\s*$/;
const problems = [];
const tagged = new Map();

let fenced = false;
let line = 0;
for (const raw of text.split('\n')) {
  line += 1;
  if (raw.trim().startsWith('```')) { fenced = !fenced; continue; }
  if (fenced || ROW.test(raw.trim())) continue;
  const ids = [...raw.matchAll(TAG)].map(match => match[1]);
  for (const id of ids) tagged.set(id, line);
  if (TRIGGER.test(raw) && !ids.length) problems.push(`${line}: 这行有"必须/不得"，但没有规则编号。加〔R-xx〕并在规则表里登记：${raw.trim().slice(0, 60)}`);
}

if (!text.includes('## 规则表')) problems.push('缺少 ## 规则表 小节。');
const rows = text.split('\n').map(raw => raw.trim().match(ROW)).filter(Boolean);
for (const [, id, , by] of rows) {
  const how = by.trim();
  if (!tagged.has(id)) problems.push(`规则表里的 ${id} 在正文里找不到对应的〔${id}〕，要么补标记，要么删掉这一行。`);
  if (how.startsWith('结构') || how.startsWith('文字')) continue;
  const commands = [...how.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  if (!commands.length) { problems.push(`${id} 的强制方式要写"结构：…"、"文字"，或一条放在反引号里的命令。`); continue; }
  for (const command of commands) {
    const [program, ...args] = command.split(/\s+/).filter(part => !part.startsWith('-'));
    const workspace = args[0]?.startsWith('@the-way-here/') ? args.shift().slice('@the-way-here/'.length) : null;
    const candidates = program === 'pnpm' ? [] : program === '.githooks' ? [path.join(root, '.githooks', args[0])] : [program, args[0]].filter(Boolean).flatMap(target => [path.join(root, target), path.join(studio, target)]);
    const ok = program === 'pnpm'
      ? workspace ? ['apps', 'packages'].some(dir => existsSync(path.join(studio, dir, workspace, 'package.json'))) && (args[0] !== 'test' || Boolean(JSON.parse(readFileSync(path.join(studio, 'apps', workspace, 'package.json'), 'utf8').catch(() => readFileSync(path.join(studio, 'packages', workspace, 'package.json'), 'utf8'))).scripts?.test)) : Boolean(pkg.scripts?.[args[0]])
      : candidates.some(existsSync);
    if (!ok) problems.push(`${id} 登记的检查不存在：${command}`);
  }
}

if (problems.length) {
  console.error(`规则表没过（${file}）：`);
  for (const problem of problems) console.error(`  ${problem}`);
  const prose = rows.filter(([, , , by]) => by.trim().startsWith('文字')).length;
  console.error(`\n共 ${rows.length} 条规则，其中 ${prose} 条只有文字、没有机器检查。`);
  process.exit(1);
}
const prose = rows.filter(([, , , by]) => by.trim().startsWith('文字')).length;
console.log(`规则表通过：${rows.length} 条规则，${prose} 条只有文字。`);
