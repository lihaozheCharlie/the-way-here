// twh：给 Agent 用的命令行。命令少而能干活，破坏性的带 --dry-run，报错写下一步怎么做。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { launch, cleanup, doctor, request, paths } from './twh/session.mjs';
import { select, run } from './twh/affected.mjs';
import { create, audit, prune } from './twh/worktree.mjs';
import { record, check } from './twh/judge.mjs';

const studio = paths.studio;
const [command, ...rest] = process.argv.slice(2);
const option = (name, fallback) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : fallback; };
const flag = name => rest.includes(name);
const out = value => console.log(JSON.stringify(value, null, 2));

try {
  switch (command) {
    case 'pstack-root': out({ root: pstackRoot() }); break;
    case 'help': case undefined: console.log(helpText().replace('${pstack}', pstackRoot() ?? '<未安装>')); break;
    case 'launch': {
      const { session, doctor: health, reused } = await launch({ build: flag('--build'), allowStale: flag('--allow-stale') });
      out({ origin: session.origin, evidenceDir: session.evidenceDir, head: session.head, workspace: session.workspace, reused: Boolean(reused), problems: health.problems, next: 'pnpm twh go <route>，或 pnpm twh drive --eval "<js>"。用完 pnpm twh cleanup。' });
      break;
    }
    case 'doctor': {
      const health = await doctor();
      out({ ...health, next: health.ok ? '实例可以驱动。' : '先解决 problems。构建旧了就 pnpm twh cleanup && pnpm twh launch --build。' });
      process.exitCode = health.ok ? 0 : 1;
      break;
    }
    case 'go': out(await request('/go', { route: rest[1] ?? '/' })); break;
    case 'drive': {
      const code = option('--eval');
      if (code) { out(await request('/eval', { code, timeout: Number(option('--timeout', 30)) })); break; }
      const script = option('--script');
      if (script) {
        const file = path.join(studio, 'scripts', `${script}.mjs`);
        if (!existsSync(file)) throw new Error(`没有 scripts/${script}.mjs。可用：${readdirSync(path.join(studio, 'scripts')).filter(name => name.startsWith('verify-') && name.endsWith('.mjs')).map(name => name.replace(/\.mjs$/, '')).join('、')}`);
        process.exitCode = spawnSync(process.execPath, [file], { cwd: studio, stdio: 'inherit' }).status ?? 1;
        break;
      }
      throw new Error('用法：pnpm twh drive --eval "<js>"，或 pnpm twh drive --script <verify-xxx>');
    }
    case 'evidence': {
      if (!['screenshot', 'aria'].includes(rest[0])) throw new Error('用法：pnpm twh evidence screenshot <名字>，或 pnpm twh evidence aria <名字>');
      out(await request('/evidence', { kind: rest[0], name: rest[1] ?? `evidence-${Date.now()}` }));
      break;
    }
    case 'cleanup': out(await cleanup()); break;
    case 'verify': {
      const range = option('--affected');
      if (!range) throw new Error('用法：pnpm twh verify --affected <base>..<head> [--dry-run] [--desktop]');
      const selection = select(range);
      out({ range, changed: selection.changed, journeys: selection.journeys, unmapped: selection.unmapped });
      const result = run(selection, { desktop: flag('--desktop'), dryRun: flag('--dry-run') });
      out(result);
      process.exitCode = result.passed ? 0 : 1;
      break;
    }
    case 'worktree': {
      if (rest[0] === 'new') out(await create(rest[1]));
      else if (rest[0] === 'audit') out(audit());
      else if (rest[0] === 'prune') out(prune(rest[1], { yes: flag('--yes') }));
      else throw new Error('用法：pnpm twh worktree new <名字> | audit | prune <路径> --yes');
      break;
    }
    case 'judge': {
      if (rest[0] === 'record') {
        const saved = record({ head: option('--head'), verdict: option('--verdict'), file: option('--file'), judge: option('--judge'), ...collect(rest) });
        out({ verdict: saved.verdict, head: saved.head, file: `.runtime/judge/${saved.head}.json`, evidence: saved.evidence.length });
      } else if (rest[0] === 'check') {
        const result = check({ head: option('--head') });
        if (result.ok) console.log(`VERDICT ${result.record.verdict} head=${result.record.head} judge=${result.record.judgedBy} at=${result.record.recordedAt}`);
        else { console.error(result.reasons.join('\n')); process.exitCode = 1; }
      } else throw new Error('用法：pnpm twh judge check [--head <sha>]，或 pnpm twh judge record --head <sha> --verdict <PASS|PASS+NOTES|FAIL> --file <说明> --judge "<谁>" [--countersign "<种类>: <理由>"] [--flag "<说明>"]');
      break;
    }
    case 'ci': out(await ciWatch(rest[1])); break;
    default: throw new Error(`不认识 ${command}。运行 pnpm twh help 看用法。`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function collect(items) {
  const result = { countersigns: [], flags: [] };
  items.forEach((item, i) => {
    if (item === '--countersign') result.countersigns.push(items[i + 1]);
    if (item === '--flag') result.flags.push(items[i + 1]);
  });
  return result;
}

function pstackRoot() {
  const candidates = [process.env.PSTACK_ROOT, path.join(process.env.HOME ?? '', '.zcode/cli/plugins/cache/cursor-plugins/pstack'), path.join(process.env.HOME ?? '', '.cursor/plugins')].filter(Boolean);
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    if (existsSync(path.join(base, 'skills/poteto-mode/SKILL.md'))) return base;
    const versions = readdirSync(base).filter(name => /^\d/.test(name)).sort().reverse();
    for (const version of versions) if (existsSync(path.join(base, version, 'skills/poteto-mode/SKILL.md'))) return path.join(base, version);
  }
  return null;
}

async function ciWatch(branch = 'HEAD') {
  const gh = args => JSON.parse(spawnSync('gh', args, { cwd: studio, encoding: 'utf8' }).stdout || 'null');
  const head = spawnSync('git', ['rev-parse', branch], { cwd: studio, encoding: 'utf8' }).stdout.trim();
  const name = branch === 'HEAD' ? spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: studio, encoding: 'utf8' }).stdout.trim() : branch;
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const run = gh(['run', 'list', '--branch', name, '--limit', '1', '--json', 'databaseId,status,conclusion,headSha']);
    if (run?.[0]?.headSha === head) {
      if (run[0].status === 'completed') return { ...run[0], branch: name };
      await new Promise(resolve => setTimeout(resolve, 20_000));
      continue;
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error(`30 分钟内没看到 ${name} 上 ${head.slice(0, 7)} 的 CI 结果。用 gh run list --branch ${name} 看。`);
}

function helpText() {
  return `twh：The Way Here 仓给 Agent 用的命令行。都在 studio/ 目录下运行。

  pnpm twh pstack-root                 打印 pstack 的安装位置
  pnpm twh launch [--build]            启动一个匿名的验证实例：临时工作区、服务、浏览器
  pnpm twh doctor                      这个实例值得驱动吗：服务、端口、构建新旧、所在提交
  pnpm twh go <route>                  打开一个路由，等主区域可见
  pnpm twh drive --eval "<js>"         做一步操作。js 是函数体，作用域里有 page、expect、origin，要 return
  pnpm twh drive --script <verify-xxx> 跑一段现成的旅程
  pnpm twh evidence screenshot <名字>  截图存进证据目录
  pnpm twh evidence aria <名字>        无障碍树快照存进证据目录
  pnpm twh cleanup                     关掉实例，删临时工作区，保留证据
  pnpm twh verify --affected <a>..<b>  按改动挑旅程并重跑。--dry-run 只列不跑，--desktop 连桌面端一起跑
  pnpm twh worktree new <名字>         从最新的 origin/main 建一个独立 worktree
  pnpm twh worktree audit              列出所有 worktree 和它的状态
  pnpm twh worktree prune <路径> --yes 删掉已合并且干净的 worktree
  pnpm twh judge check [--head <sha>]  这个 HEAD 有没有有效的 PASS 裁决书
  pnpm twh judge record …              裁判登记裁决书
  pnpm twh ci watch [分支]             等这个提交的 CI 跑完

规则：只驱动自己 launch 的实例；用完 cleanup；证据在 .runtime/evidence/<运行号>/。
pstack 在：\${pstack}
`;
}
