// 裁决书：绑定 HEAD 的 SHA，绑定同一 HEAD 上干净工作树跑出的 gate 结果。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const judgeRoot = path.join(studio, '.runtime/judge');
const gateRoot = path.join(studio, '.runtime/gate');
const VERDICTS = ['PASS', 'PASS+NOTES', 'FAIL'];
const git = (...parts) => spawnSync('git', parts, { cwd: studio, encoding: 'utf8' }).stdout.trim();

export function record({ head, verdict, file, judge, countersigns = [], flags = [] }) {
  head = head ?? git('rev-parse', 'HEAD');
  if (!VERDICTS.includes(verdict)) throw new Error(`裁决只能是 ${VERDICTS.join('、')}，收到：${verdict}`);
  if (!judge) throw new Error('用 --judge 写明你是谁，例：--judge "ZCode 子 Agent / GLM-5.4"');
  const notes = existsSync(file) ? readFileSync(file, 'utf8') : (() => { throw new Error(`说明文件不存在：${file}`); })();
  const gate = gateFor(head);
  if (!gate?.passed) throw new Error(`HEAD ${head.slice(0, 7)} 没有通过的 gate 结果。先在已提交的 HEAD 上运行 pnpm gate。`);
  if (gate.dirtyCount > 0) throw new Error(`那次 gate 是在带着 ${gate.dirtyCount} 处未提交改动的工作树里跑的，不能代表这个提交。提交或收走改动后重跑 pnpm gate。`);
  const evidence = [...notes.matchAll(/(?:studio\/)?\.runtime\/[\w./-]+/g)].map(match => match[0]);
  const missing = evidence.filter(item => !existsSync(path.join(studio, item)));
  if (missing.length) throw new Error(`说明里引用的证据不存在：${missing.join('、')}`);

  const record = {
    version: 1,
    head,
    base: git('merge-base', 'origin/main', head) || git('rev-parse', 'HEAD~1'),
    verdict,
    judgedBy: judge,
    recordedAt: new Date().toISOString(),
    gate: { finishedAt: gate.finishedAt, steps: gate.steps.map(step => `${step.name}:${step.exitCode === 0 ? 'pass' : 'fail'}`) },
    notes: path.relative(studio, path.resolve(studio, file)),
    evidence,
    flags,
    countersigns: countersigns.map(item => ({ kind: item.split(':')[0].trim(), reason: item.slice(item.indexOf(':') + 1).trim() })),
  };
  mkdirSync(judgeRoot, { recursive: true });
  writeFileSync(path.join(judgeRoot, `${head}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function check({ head } = {}) {
  head = head ?? git('rev-parse', 'HEAD');
  const file = path.join(judgeRoot, `${head}.json`);
  const reasons = [];
  if (!existsSync(file)) return { ok: false, reasons: [`HEAD ${head.slice(0, 7)} 没有裁决书。按 studio/agents/twh/judge.md 派裁判，然后用 pnpm twh judge record 登记。`] };
  const record = JSON.parse(readFileSync(file, 'utf8'));
  if (record.verdict === 'FAIL') reasons.push(`裁决是 FAIL。`);
  if (!VERDICTS.includes(record.verdict)) reasons.push(`裁决书的 verdict 不是受支持的值：${record.verdict}`);
  const gate = gateFor(head);
  if (!gate?.passed) reasons.push(`这个 HEAD 的 gate 结果不存在或没通过。`);
  else if (gate.dirtyCount > 0) reasons.push(`gate 是带着未提交改动跑的。`);
  for (const item of record.evidence ?? []) if (!existsSync(path.join(studio, item))) reasons.push(`证据不存在了：${item}`);
  const flags = loosening(record.base, head);
  const unsigned = flags.filter(flag => !(record.countersigns ?? []).some(sign => sign.kind === flag.kind));
  for (const flag of unsigned) reasons.push(`未会签的放宽：${flag.kind}（${flag.commit.slice(0, 7)}）${flag.detail}`);
  return { ok: reasons.length === 0, reasons, record, flags: unsigned };
}

function gateFor(head) {
  const file = path.join(gateRoot, `${head}.json`);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function loosening(base, head) {
  if (!base) return [];
  const run = spawnSync(process.execPath, [path.join(studio, 'scripts/check-gate-loosening.mjs'), `${base}..${head}`, '--json'], { cwd: studio, encoding: 'utf8' });
  try { return JSON.parse(run.stdout).flags ?? []; } catch { return []; }
}

export const paths = { judgeRoot, gateRoot, studio };
