// 功能地图校验：每个功能文件结构固定，索引齐全，映射表和验证脚本对得上。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(studio, '..');
const features = path.join(root, '.agents/skills/verify-twh/features');
const H2 = ['Sub-features', 'How to get to it (user POV)', 'Driving it with twh', 'Gotchas'];
const problems = [];

if (!existsSync(features)) {
  console.error(`功能地图目录不存在：${features}`);
  process.exit(1);
}
const files = readdirSync(features).filter(name => name.endsWith('.md') && name !== 'README.md').sort();
const readme = existsSync(path.join(features, 'README.md')) ? readFileSync(path.join(features, 'README.md'), 'utf8') : '';
const map = JSON.parse(readFileSync(path.join(studio, 'verification/features.json'), 'utf8'));
const mapped = new Set(map.features.map(feature => feature.file));
const journeys = new Set(map.features.flatMap(feature => feature.journeys).concat(map.manual ?? [], map.helpers ?? []));

for (const name of files) {
  const text = readFileSync(path.join(features, name), 'utf8');
  const heads = [...text.matchAll(/^## (.+)$/gm)].map(match => match[1].trim());
  if (heads.join('|') !== H2.join('|')) problems.push(`${name}: 四个 H2 要按顺序是 ${H2.join('、')}，现在是 ${heads.join('、') || '没有'}`);
  if (!/^# .+$/m.test(text)) problems.push(`${name}: 缺 H1 标题`);
  const driving = text.split(/^## Driving it with twh$/m)[1]?.split(/^## /m)[0] ?? '';
  if (!driving.includes('Preconditions:')) problems.push(`${name}: Driving 一节要以 Preconditions: 开头`);
  for (const step of driving.split('\n').filter(row => /^- \*\*/.test(row))) if (!/pnpm twh /.test(step)) problems.push(`${name}: 这一步没有命令：${step.slice(0, 60)}`);
  if (!readme.includes(`./${name}`)) problems.push(`README.md 的索引里没有 ./${name}`);
  if (!mapped.has(name)) problems.push(`studio/verification/features.json 里没有 ${name}`);
}

for (const name of mapped) if (!files.includes(name)) problems.push(`映射表指向不存在的功能文件：${name}`);
for (const script of readdirSync(path.join(studio, 'scripts')).filter(name => /^verify-.*\.mjs$/.test(name)).map(name => name.replace(/\.mjs$/, ''))) {
  if (!journeys.has(script)) problems.push(`scripts/${script}.mjs 没有出现在任何功能的 journeys 里，也没有列在 release 里`);
}

if (problems.length) {
  console.error('功能地图没过：');
  for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`功能地图通过：${files.length} 个功能，${journeys.size} 条旅程。`);
