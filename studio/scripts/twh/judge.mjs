// 裁决书：绑定 HEAD 的 SHA，绑定同一 HEAD 上最后一次完整、干净的一轮 gate。
// 裁决之后同一个 HEAD 再有 gate 失败，裁决书就失效：后来的失败盖不住先前的绿，先前的绿也盖不住后来的失败。
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
  if (!existsSync(file)) throw new Error(`说明文件不存在：${file}`);
  const notes = readFileSync(file, 'utf8');
  const runs = runsFor(head);
  const gate = runs.at(-1);
  if (!gate?.complete) throw new Error(`HEAD ${head.slice(0, 7)} 没有完整一轮的 gate 结果（最后一次不是完整的，或者只跑了一部分）。先在已提交的 HEAD 上运行 pnpm gate。`);
  if (!gate.passed) throw new Error(`HEAD ${head.slice(0, 7)} 最后一次 gate（${gate.at}）没通过。修好重跑。`);
  if (gate.dirtyCount > 0) throw new Error(`最后一次 gate 是在带着 ${gate.dirtyCount} 处未提交改动的工作树里跑的，不能代表这个提交。提交或收走改动后重跑 pnpm gate。`);
  // 说明里的证据路径写不写 studio/ 前缀都认。
  const evidence = [...notes.matchAll(/(?:studio\/)?\.runtime\/[\w./\-\u3400-\u9fff]+/g)].map(match => match[0].replace(/^studio\//, ''));
  const missing = evidence.filter(item => !existsSync(path.join(studio, item)));
  if (missing.length) throw new Error(`说明里引用的证据不存在：${missing.join('、')}`);

  const record = {
    version: 2,
    head,
    base: git('merge-base', 'origin/main', head) || git('rev-parse', 'HEAD~1'),
    verdict,
    judgedBy: judge,
    recordedAt: new Date().toISOString(),
    gateAt: gate.at,
    gate: gate.steps.map(step => `${step.name}:${step.exitCode === 0 ? 'pass' : 'fail'}`),
    notes: path.relative(studio, path.resolve(studio, file)),
    evidence,
    flags,
    // 会签可以写到提交："<种类>@<sha>,<sha>: 理由"。不带 @ 的签整个种类，签之前确认这个种类的每一条都看过了。
    countersigns: countersigns.map(item => {
      const colon = item.indexOf(':');
      const [kind, commits] = item.slice(0, colon).trim().split('@');
      return { kind, commits: commits ? commits.split(',').map(commit => commit.trim()) : [], reason: item.slice(colon + 1).trim() };
    }),
  };
  mkdirSync(judgeRoot, { recursive: true });
  writeFileSync(path.join(judgeRoot, `${head}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function check({ head } = {}) {
  head = head ?? git('rev-parse', 'HEAD');
  const file = path.join(judgeRoot, `${head}.json`);
  const reasons = [];
  if (!existsSync(file)) return { ok: false, reasons: [`HEAD ${head.slice(0, 7)} 没有裁决书。按 studio/agents/twh/judge.md 派裁判，然后用 pnpm twh judge record 登记。`], flags: loosening(git('merge-base', 'origin/main', head), head) };
  const record = JSON.parse(readFileSync(file, 'utf8'));
  if (record.verdict === 'FAIL') reasons.push('裁决是 FAIL。');
  if (!VERDICTS.includes(record.verdict)) reasons.push(`裁决书的 verdict 不是受支持的值：${record.verdict}`);
  const runs = runsFor(head);
  const base = runs.find(run => run.at === record.gateAt);
  if (!base) reasons.push('裁决书依据的那次完整 gate 结果不在了（裁决书的格式过旧，或者结果文件被删）。重新跑 pnpm gate 并重新判。');
  else if (!base.passed || base.dirtyCount > 0) reasons.push('裁决书依据的那次 gate 没通过，或者是带着未提交改动跑的。');
  const failedLater = runs.filter(run => run.at > record.gateAt && !run.passed);
  if (failedLater.length) reasons.push(`裁决之后同一个 HEAD 又有 ${failedLater.length} 次 gate 失败（最近一次 ${failedLater.at(-1).at}），裁决书失效。`);
  for (const item of record.evidence ?? []) if (!existsSync(path.join(studio, item))) reasons.push(`证据不存在了：${item}`);
  const flags = loosening(record.base, head);
  const signed = (flag, sign) => sign.kind === flag.kind && (!(sign.commits ?? []).length || sign.commits.some(commit => flag.commit.startsWith(commit)));
  const unsigned = flags.filter(flag => !(record.countersigns ?? []).some(sign => signed(flag, sign)));
  for (const flag of unsigned) reasons.push(`未会签的放宽：${flag.kind}（${flag.commit.slice(0, 7)}）${flag.detail}`);
  return { ok: reasons.length === 0, reasons, record, flags: unsigned };
}

// 只算完整的一轮。只跑了部分步骤的运行不进结果文件。
function runsFor(head) {
  const file = path.join(gateRoot, `${head}.json`);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed.runs) ? parsed.runs.filter(run => run.complete === true) : [];
  } catch {
    return [];
  }
}

function loosening(base, head) {
  if (!base) return [];
  const run = spawnSync(process.execPath, [path.join(studio, 'scripts/check-gate-loosening.mjs'), `${base}..${head}`, '--json'], { cwd: studio, encoding: 'utf8' });
  try { return JSON.parse(run.stdout).flags ?? []; } catch { return []; }
}

export const paths = { judgeRoot, gateRoot, studio };
