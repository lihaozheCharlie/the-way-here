// 提交说明：type(scope): subject，说清改了什么。动产品代码的还要带 Why 和 Verification。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const messageFile = process.argv[2];
const text = readFileSync(messageFile, 'utf8');
const subject = text.split('\n')[0].trim();

if (/^(?:Merge |Revert ")|^wip(?:\([^)]*\))?: /.test(subject)) process.exit(0);

const match = subject.match(/^(feat|fix|refactor|perf|test|docs|build|ci|chore|revert|style)(\([^)\s]{1,40}\))?!?: (.+)$/);
if (!match) {
  console.error(`提交说明不符合 type(scope): subject：\n  ${subject}\n可用类型：feat fix refactor perf test docs build ci chore revert style。例：fix(capture): 保存后保留草稿直到记录落盘`);
  process.exit(1);
}
const [, , , rest] = match;
const summary = rest.trim();

const vague = [/各类/, /体验(?:优化|更新)\d*$/, /(?:更新|优化|修改|调整)\d+$/, /^(?:更新|修改|优化|调整|修复|改动|fix|update|test|changes?)$/i];
const hit = vague.find(pattern => pattern.test(summary));
if (hit || summary.replace(/\s/g, '').length < 6) {
  console.error(`提交说明没有信息量，写出改了哪个功能或符号、行为有什么变化：\n  ${subject}\n反例：各类小bug修复和体验优化111。正例：fix(letters): 回信切到历史版本后保留滚动位置`);
  process.exit(1);
}

const staged = spawnSync('git', ['diff', '--cached', '--name-only', '--no-renames'], { cwd: studio, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
const touchesProduct = staged.some(file => /^studio\/(?:apps|packages)\/.*\/src\/.*\.(?:ts|tsx|mjs|cjs)$/.test(file) && !/\.test\.[^.]+$/.test(file));
// 只要暂存里有产品源码，不管类型写的是什么都要带 Why 和 Verification。只按类型判断的话，把 fix 写成 chore 就绕过去了。
if (touchesProduct) {
  const heading = name => new RegExp(`^(?:## ${name}|${name}:)\\s*$`, 'm').test(text);
  if (!heading('Why') || !heading('Verification')) {
    console.error(`这个提交动了产品代码（${staged.filter(file => /^studio\/(?:apps|packages)\/.*\/src\//.test(file)).slice(0, 3).join('、')}），说明正文需要两节：\n\n## Why\n\n<为什么改，引用出问题的行为>\n\n## Verification\n\n<跑了什么，看到了什么；没跑的明说>\n\n只改文档、测试、配置，或 wip 提交不需要。类型写 chore、docs、test 也一样要。`);
    process.exit(1);
  }
}
