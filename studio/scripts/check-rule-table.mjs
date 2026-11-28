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
  // "结构：…"、"文字" 可以不带命令；带了命令，命令就必须真的存在。反引号里的标识符（类型名、函数名）不算命令。
  const tokens = [...how.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  const isCommand = token => /^(?:pnpm|node|python3?|bash|sh|git|codex|uvx|\.githooks\/\S+)$/.test(token.split(/\s+/)[0]);
  const commands = tokens.filter(isCommand);
  if (!commands.length && !how.startsWith('结构') && !how.startsWith('文字')) { problems.push(`${id} 的强制方式要写"结构：…"、"文字"，或一条放在反引号里的命令。`); continue; }
  for (const command of commands) {
    const [program, ...args] = command.split(/\s+/).filter(part => !part.startsWith('-'));
    let ok;
    if (program === 'pnpm' && args[0]?.startsWith('@the-way-here/')) {
      // pnpm --filter <包> <脚本>，或 pnpm --filter <包> exec <程序> … <文件>：包要在，脚本或文件也要在。
      const name = args.shift().slice('@the-way-here/'.length);
      const dir = ['apps', 'packages'].map(base => path.join(studio, base, name)).find(file => existsSync(path.join(file, 'package.json')));
      const scripts = dir ? JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts ?? {} : {};
      const file = dir ? args.find(arg => /\.[cm]?[jt]sx?$/.test(arg)) : null;
      ok = Boolean(dir) && (args[0] === 'exec' ? args.length >= 2 : Boolean(scripts[args[0]])) && (!file || existsSync(path.join(dir, file)));
    } else if (program === 'pnpm') ok = Boolean(pkg.scripts?.[args[0]]);
    else if (program.startsWith('.githooks/')) ok = existsSync(path.join(root, program));
    else ok = [program, args[0]].filter(Boolean).some(target => existsSync(path.join(root, target)) || existsSync(path.join(studio, target)));
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
