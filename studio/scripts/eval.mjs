// 盲评：同一个任务交给几个变体，候选不知道自己在被评，裁判只看脱敏标签。
// 用法：pnpm eval --suite eval/<套件> [--judge codex|none] [--model <模型>] [--cases 1,2] [--dry-run]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const suiteDir = path.resolve(option('--suite', ''));
const judgeMode = option('--judge', 'codex');
const model = option('--model');
const only = option('--cases')?.split(',').map(Number);
const dryRun = args.includes('--dry-run');
const CODEWORDS = ['juniper', 'amber', 'cedar', 'marble', 'harbor', 'lantern', 'meadow', 'saffron', 'tundra', 'willow'];
const FORBIDDEN = /eval|test|judge|experiment|rubric|score|compare|benchmark|candidate|arena|盲评|评分|评测/i;

// 重新核对一次已经跑完的盲评：从运行记录重算候选读了什么，重写报告，不再调模型。
if (option('--reaudit')) {
  const runRoot = path.resolve(option('--reaudit'));
  const mapping = JSON.parse(await readFile(path.join(runRoot, 'mapping.private.json'), 'utf8'));
  const previous = Object.fromEntries((await readFile(path.join(runRoot, 'results.tsv'), 'utf8')).trim().split('\n').slice(1).map(line => line.split('\t')).map(row => [`${row[1]}/${row[0]}`, row]));
  const outputs = [];
  for (const label of Object.keys(mapping)) {
    for (const file of (await readdir(path.join(runRoot, 'out', label))).filter(name => /^case-\d+\.md$/.test(name))) {
      const n = Number(file.match(/\d+/)[0]);
      const letter = await readFile(path.join(runRoot, 'out', label, file), 'utf8');
      if (!letter.trim()) continue;
      const events = await readFile(path.join(runRoot, 'out', label, `case-${n}.events.jsonl`), 'utf8').catch(() => '');
      outputs.push({ case: n, label, variant: mapping[label], letter, read: readFiles(events), seconds: Number(previous[`${label}/${n}`]?.[4] ?? 0) });
    }
  }
  const { perCase, totals } = await readVerdicts(runRoot, outputs);
  await writeReport(runRoot, path.basename(runRoot), '重新核对', outputs, perCase, totals, mapping, '裁判与候选同厂商（沿用上次的裁决）。');
  console.log(`重新核对完成：${path.relative(studio, runRoot)}/report.md`);
  process.exit(0);
}

if (!suiteDir.split(path.sep).includes('eval') || !existsSync(path.join(suiteDir, 'suite.json'))) {
  console.error('用法：pnpm eval --suite eval/<套件> [--judge codex|none] [--model <模型>] [--cases 1,2] [--dry-run]');
  process.exit(2);
}

const read = file => readFile(path.join(suiteDir, file), 'utf8');
const suite = JSON.parse(await read('suite.json'));
const cases = (await read(suite.cases)).split('\n').filter(Boolean).map((line, i) => ({ ...JSON.parse(line), n: i + 1 })).filter(item => !only || only.includes(item.n));
const promptTemplate = await read(suite.prompt);
const rubric = await read(suite.rubric);
const judgeTemplate = await read(suite.judge);
const config = await read(suite.workspace.config);

// 盲化检查：候选看得到的东西里不许出现会暴露"在被评"的词。
const leaks = [...cases.map(item => item.prompt), promptTemplate].filter(text => FORBIDDEN.test(text));
const leakedEdits = Object.values(suite.variants).flat().filter(edit => FORBIDDEN.test(`${edit.file} ${edit.replace}`));
if (leaks.length || leakedEdits.length) {
  console.error(`盲化检查没过，候选会看出自己在被评：\n${[...leaks, ...leakedEdits.map(edit => `${edit.file}：${edit.replace}`)].map(text => `  ${text.slice(0, 100)}`).join('\n')}`);
  process.exit(1);
}

const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
// 先核对每个变体要替换的话还在不在，免得跑了一半才发现套件过期，白烧模型的调用。
for (const [variant, edits] of Object.entries(suite.variants)) {
  for (const edit of edits) {
    const source = await readFile(path.resolve(studio, '..', edit.file), 'utf8').catch(() => '');
    if (!source.includes(edit.find)) {
      console.error(`套件过期：变体 ${variant} 要替换的那段话在 ${edit.file} 里找不到了：\n  ${edit.find}\n上游改过这段话。更新 ${path.relative(studio, suiteDir)}/suite.json 里对应的 find，再跑。`);
      process.exit(1);
    }
  }
}
const runRoot = path.join(studio, '.runtime/eval', runId);
await mkdir(runRoot, { recursive: true });
const labels = shuffle(CODEWORDS).slice(0, Object.keys(suite.variants).length);
const mapping = Object.fromEntries(Object.keys(suite.variants).map((variant, i) => [labels[i], variant]));
await writeFile(path.join(runRoot, 'mapping.private.json'), `${JSON.stringify(mapping, null, 2)}\n`);
console.log(`盲评：${suite.description}。${cases.length} 个案例，${labels.length} 个变体，标签 ${labels.join('、')}。运行目录 .runtime/eval/${runId}`);

const outputs = [];
for (const item of cases) {
  for (const label of labels) {
    const work = path.join(runRoot, 'work', label, `case-${item.n}`);
    const out = path.join(runRoot, 'out', label, `case-${item.n}.md`);
    await mkdir(path.dirname(out), { recursive: true });
    await rm(work, { recursive: true, force: true });
    for (const source of suite.workspace.copy) await cp(path.resolve(studio, source), path.join(work, source.replace(/^\.\.\//, '')), { recursive: true, filter: file => !['.runtime', '__pycache__', '.DS_Store', 'node_modules'].includes(path.basename(file)) });
    await writeFile(path.join(work, 'AGENTS.md'), '# 匿名工作区\n');
    await writeFile(path.join(work, 'the-way-here.config.yaml'), config);
    for (const edit of suite.variants[mapping[label]]) {
      const file = path.join(work, edit.file);
      const before = await readFile(file, 'utf8');
      if (!before.includes(edit.find)) throw new Error(`变体 ${mapping[label]} 要替换的那段话在 ${edit.file} 里找不到了，上游改过。更新套件再跑。`);
      await writeFile(file, before.replace(edit.find, edit.replace));
    }
    const prompt = promptTemplate.replace('{case}', item.prompt).replaceAll('{work}', work);
    await writeFile(path.join(runRoot, 'out', label, `case-${item.n}.prompt.md`), prompt);
    if (dryRun) { console.log(`  [dry-run] ${label} case-${item.n} → ${out}`); continue; }
    const started = Date.now();
    const run = spawnSync(suite.runner.program, [...suite.runner.args.map(arg => arg.replace('{work}', work).replace('{out}', out)), ...(model ? ['--model', model] : [])], { input: prompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
    await writeFile(path.join(runRoot, 'out', label, `case-${item.n}.events.jsonl`), run.stdout ?? '');
    await writeFile(path.join(runRoot, 'out', label, `case-${item.n}.stderr.log`), run.stderr ?? '');
    const letter = await readFile(out, 'utf8').catch(() => '');
    if (run.status !== 0 || !letter.trim()) { console.error(`  ${label} case-${item.n} 没有产出（退出码 ${run.status}）。看 out/${label}/case-${item.n}.stderr.log`); continue; }
    const record = { case: item.n, label, variant: mapping[label], letter, read: readFiles(run.stdout ?? ''), seconds: Math.round((Date.now() - started) / 1000) };
    outputs.push(record);
    console.log(`  ${label} case-${item.n}: ${letter.length} 字，读了 ${record.read.length} 个文件，${record.seconds} 秒`);
  }
}
if (dryRun) process.exit(0);

if (judgeMode === 'codex') {
  for (const n of [...new Set(outputs.map(item => item.case))]) {
    const order = shuffle(outputs.filter(item => item.case === n).map(item => item.label));
    const packet = judgeTemplate.replace('{rubric}', rubric).replace('{letters}', order.map(label => `---\n【${label}】\n${outputs.find(item => item.case === n && item.label === label).letter}`).join('\n\n'));
    const judgeDir = path.join(runRoot, 'judge', `case-${n}`);
    const verdictPath = path.join(judgeDir, 'verdict.md');
    await mkdir(judgeDir, { recursive: true });
    await writeFile(path.join(judgeDir, 'packet.md'), packet);
    const judge = spawnSync(suite.runner.program, [...suite.runner.args.map(arg => arg.replace('{work}', judgeDir).replace('{out}', verdictPath)), ...(model ? ['--model', model] : [])], { input: packet, encoding: 'utf8', timeout: 15 * 60 * 1000 });
    if (judge.status !== 0) console.error(`  案例 ${n} 的裁判没跑完（退出码 ${judge.status}）：${(judge.stderr ?? '').slice(-300)}`);
  }
} else console.log('  没跑裁判。裁判包在 judge/case-<n>/packet.md，派另一家模型的 Agent 读它评分。');

const { perCase, totals } = await readVerdicts(runRoot, outputs);
await writeReport(runRoot, runId, suite.description, outputs, perCase, totals, mapping, judgeMode === 'codex' ? '裁判与候选用的是同一家模型，结论当参考，跨厂商复核另派。' : '裁判没有自动运行。');
console.log(`\n盲评完成：.runtime/eval/${runId}/report.md`);

// 裁决只从 judge/case-<n>/verdict.md 读。没有裁判就返回空结果，报告照写。
async function readVerdicts(runRoot, outputs) {
  const perCase = [];
  const totals = {};
  for (const n of [...new Set(outputs.map(item => item.case))]) {
    const verdict = await readFile(path.join(runRoot, 'judge', `case-${n}`, 'verdict.md'), 'utf8').catch(() => '');
    const json = verdict.match(/\{[\s\S]*\}/);
    if (!json) continue;
    const parsed = JSON.parse(json[0]);
    if (!parsed.scores) continue;
    perCase.push({ case: n, scores: parsed.scores, best: parsed.best });
    for (const [label, score] of Object.entries(parsed.scores)) totals[label] = (totals[label] ?? 0) + (Number(score) || 0);
  }
  return { perCase, totals };
}

async function writeReport(runRoot, runId, description, outputs, perCase, totals, mapping, note) {
  const rows = outputs.map(item => [item.case, item.label, item.variant, perCase.find(entry => entry.case === item.case)?.scores?.[item.label] ?? '', item.seconds, item.read.length]);
  await writeFile(path.join(runRoot, 'results.tsv'), `${['case', 'label', 'variant', 'score', 'seconds', 'files_read'].join('\t')}\n${rows.map(row => row.join('\t')).join('\n')}\n`);
  const labels = Object.keys(mapping);
  const best = labels.slice().sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))[0];
  const report = [
    `# 盲评报告：${description}`, '',
    `运行号 ${runId}。标签和变体的对应只在 mapping.private.json 里，裁判看不到。`, note, '',
    '| 案例 | 标签 | 变体 | 得分 | 用时（秒） | 读过的文件数 |', '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.join(' | ')} |`), '',
    perCase.length ? `合计最高：${best}（变体 ${mapping[best]}，${totals[best] ?? 0} 分）。各案例裁判选的最佳：${perCase.map(entry => `案例 ${entry.case} → ${entry.best}（${Object.entries(entry.scores).map(([label, score]) => `${label} ${score}`).join('、')}）`).join('；')}` : '没有裁判打分。', '',
    '## 候选实际读了什么（从运行记录核对，不听自述）', '',
    ...outputs.map(item => `- ${item.label} case-${item.case}：${item.read.slice(0, 8).map(file => `\`${file}\``).join('、') || '没有记录到读文件'}`), '',
    '逐份原文在 out/<标签>/，裁判的理由在 judge/case-<n>/verdict.md。自己把每一份读完再下结论；和裁判不一致时先怀疑评分标准。',
  ].join('\n');
  await writeFile(path.join(runRoot, 'report.md'), `${report}\n`);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function readFiles(events) {
  const files = new Set();
  for (const line of events.split('\n')) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const command = event?.item?.command;
    if (typeof command !== 'string') continue;
    for (const match of command.matchAll(/[\w./\-\u3400-\u9fff]*(?:knowledge-engine|vault)\/[\w./\-\u3400-\u9fff]+/g)) files.add(match[0].slice(match[0].search(/(?:knowledge-engine|vault)\//)));
  }
  return [...files].sort();
}
