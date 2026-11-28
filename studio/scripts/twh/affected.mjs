// 按改动路径挑出要重跑的旅程。映射表在 studio/verification/features.json。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesAny } from './globs.mjs';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST = /\.test\.[^.]+$/;
const PRODUCT = /^(?:studio\/)?(?:apps|packages)\//;

export function select(range) {
  const map = JSON.parse(readFileSync(path.join(studio, 'verification/features.json'), 'utf8'));
  const changed = spawnSync('git', ['diff', '--name-only', range], { cwd: studio, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const chosen = new Map();
  const add = (journey, reason) => {
    const tier = launchesElectron(journey) ? 'desktop' : 'web';
    const entry = chosen.get(journey) ?? { journey, tier, reasons: [] };
    entry.reasons.push(reason);
    chosen.set(journey, entry);
  };
  const hits = globs => changed.find(file => matchesAny(file, globs.map(toRepo)));

  for (const feature of map.features) {
    const hit = hits([...feature.sources, `.agents/skills/verify-twh/features/${feature.file}`, ...feature.journeys.map(name => `studio/scripts/${name}.mjs`)]);
    if (hit) feature.journeys.forEach(journey => add(journey, `${feature.id}（改了 ${hit}）`));
  }

  const sources = map.features.flatMap(feature => feature.sources.map(toRepo));
  const product = changed.filter(file => PRODUCT.test(file) && !TEST.test(file));
  const unmapped = product.filter(file => !matchesAny(file, sources));
  const shared = changed.find(file => !TEST.test(file) && matchesAny(file, map.sharedSources.map(toRepo)));
  if (shared || unmapped.length) {
    add(map.baseline.web, shared ? `共享代码（改了 ${shared}），兜底跑基线` : `这些改动没有映射到任何功能，兜底跑基线：${unmapped.slice(0, 5).join('、')}`);
  }
  return { range, changed: changed.length, journeys: [...chosen.values()].sort((a, b) => a.journey.localeCompare(b.journey)), unmapped };
}

export function run(selection, { desktop = false, dryRun = false } = {}) {
  const runnable = selection.journeys.filter(entry => entry.tier === 'web' || desktop);
  const skipped = selection.journeys.filter(entry => entry.tier === 'desktop' && !desktop);
  console.log(`受影响的旅程 ${runnable.length} 条${skipped.length ? `，跳过桌面层 ${skipped.length} 条（脚本自己启动 Electron，加 --desktop 才跑）` : ''}。`);
  for (const entry of selection.journeys) console.log(`  ${entry.tier.padEnd(7)} ${entry.journey}  ${[...new Set(entry.reasons)].join('；')}`);
  if (dryRun || !runnable.length) return { ran: [], skipped: skipped.map(entry => entry.journey), passed: true };

  const results = [];
  for (const entry of runnable) {
    const script = path.join(studio, 'scripts', `${entry.journey}.mjs`);
    if (!existsSync(script)) {
      results.push({ journey: entry.journey, exitCode: null, note: `脚本不存在：scripts/${entry.journey}.mjs，功能地图漂了。按 nightly 巡检修地图。` });
      console.log(`FAIL ${entry.journey}：脚本不存在`);
      continue;
    }
    console.log(`\n── 跑 ${entry.journey}`);
    const code = spawnSync(process.execPath, [script], { cwd: studio, stdio: 'inherit' }).status ?? 1;
    results.push({ journey: entry.journey, exitCode: code });
    console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${entry.journey}`);
  }
  const passed = results.every(result => result.exitCode === 0);
  console.log(`\nverify ${passed ? 'passed' : 'failed'}: ${results.filter(result => result.exitCode === 0).length}/${results.length} 条通过。旅程红了先分诊：产品回归，还是脚本过时（看对应功能的 Gotchas）。`);
  return { ran: results, skipped: skipped.map(entry => entry.journey), passed };
}

function toRepo(glob) {
  if (glob.startsWith('../')) return glob.slice(3);
  return glob.startsWith('studio/') || glob.startsWith('.agents/') ? glob : `studio/${glob}`;
}

function launchesElectron(journey) {
  const file = path.join(studio, 'scripts', `${journey}.mjs`);
  return existsSync(file) && /_electron|from ['"]electron['"]|require\(['"]electron['"]\)/.test(readFileSync(file, 'utf8'));
}
