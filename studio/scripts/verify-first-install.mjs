import { _electron as electron, expect } from '@playwright/test';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';

const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-fresh-install-')));
const releaseDir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const sourceApp = process.env.TWH_DESKTOP_APP ? path.resolve(process.env.TWH_DESKTOP_APP) : path.resolve('.runtime/releases', releaseDir, 'The Way Here.app');
const movedApp = path.join(temp, 'Applications/The Way Here.app');
const userData = path.join(temp, 'new-user');
const env = { ...process.env, PATH: '/usr/bin:/bin' };
delete env.THE_WAY_HERE_VAULT;
delete env.THE_WAY_HERE_KNOWLEDGE_BASE;
let app, pid, stateRoot;

async function compareDemo(source, target) {
  for (const entry of await readdir(source, { withFileTypes:true })) {
    if (['.DS_Store', '__pycache__', '.runtime'].includes(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await compareDemo(from, to);
    else {
      const bundled = await readFile(from);
      const expected = /\.(md|json|ya?ml)$/i.test(entry.name) ? Buffer.from(bundled.toString('utf8').replaceAll('vault/demo/', 'app/demo/')) : bundled;
      expect((await readFile(to)).equals(expected), from).toBe(true);
    }
  }
}

async function launch() {
  return electron.launch({
    executablePath: path.join(movedApp, 'Contents/MacOS/The Way Here'),
    args: ['--diagnostics', `--user-data-dir=${userData}`],
    env,
    timeout: 60000,
  });
}

async function expectDemo(page) {
  await page.locator('main').waitFor({ timeout:30000 });
  await expect.poll(async () => {
    try {
      const result = await page.evaluate(() => fetch('/api/vault').then((response) => response.json()));
      return result.knowledgeBaseId === 'demo' && result.pageCount > 0 && result.sourceCount > 0;
    } catch { return false; }
  }, { timeout:30000 }).toBe(true);
  return page.evaluate(() => fetch('/api/vault').then((response) => response.json()));
}

try {
  await mkdir(path.dirname(movedApp), { recursive:true });
  await cp(sourceApp, movedApp, { recursive:true, verbatimSymlinks:true });
  app = await launch();
  pid = app.process().pid;
  const page = await app.firstWindow({ timeout:60000 });
  const demo = await expectDemo(page);
  const root = JSON.parse(await readFile(path.join(userData, 'workspace.json'), 'utf8')).root;
  expect(root).toBe(path.join(userData, 'workspace'));
  const policy = await page.evaluate(() => fetch('/api/storage/policy').then(response => response.json()));
  if (path.basename(policy.stateRoot) !== createHash('sha256').update(root).digest('hex').slice(0, 16) || path.basename(path.dirname(policy.stateRoot)) !== 'vaults') throw new Error('Unexpected test state location');
  stateRoot = policy.stateRoot;
  const configPath = path.join(root, 'the-way-here.config.yaml');
  const config = await readFile(configPath, 'utf8');
  const parsed = YAML.parse(config);
  expect(parsed.defaultKnowledgeBase).toBe('demo');
  expect(Object.keys(parsed.knowledgeBases)).toEqual(['demo']);
  await expect(access(path.join(root, 'app/personal'))).rejects.toThrow();
  const demoDirectory = path.resolve(root, path.dirname(parsed.knowledgeBases.demo.paths.wiki));
  if (!demoDirectory.startsWith(root + path.sep)) throw new Error('Unexpected demo directory');
  await compareDemo(path.join(movedApp, 'Contents/Resources/workspace-template/demo'), demoDirectory);

  const bundledPython = path.join(movedApp, 'Contents/Resources/python/bin/python3');
  for (const script of ['update_obsidian_tags.py', 'update_obsidian_tags.py', 'validate_wiki_links.py', 'validate_skill_system.py']) {
    const result = spawnSync(bundledPython, [path.join(root, 'knowledge-engine/tools', script)], {
      cwd: root,
      env: { PATH:'/usr/bin:/bin', THE_WAY_HERE_KNOWLEDGE_BASE:'demo' },
      encoding:'utf8',
    });
    expect(result.status, `${script}: ${result.stdout}\n${result.stderr}`).toBe(0);
  }

  await app.close();
  app = undefined;
  app = await launch();
  pid = app.process().pid;
  const reopened = await app.firstWindow({ timeout:60000 });
  await expectDemo(reopened);
  expect(await readFile(configPath, 'utf8')).toBe(config);
  console.log(`PASS: relocated first install opens demo (${demo.pageCount} pages, ${demo.sourceCount} sources), includes no empty personal library, and survives restart.`);
} finally {
  const pids = app ? await app.evaluate(({ app }) => app.getAppMetrics().map(item => item.pid)).catch(() => pid ? [pid] : []) : [];
  await app?.close();
  const alive = value => { try { process.kill(value, 0); return true; } catch { return false; } };
  const deadline = Date.now() + 5000;
  while (pids.some(alive) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  if (pids.some(alive)) throw new Error('Verification App or child process is still running');
  if (stateRoot) await rm(stateRoot, { recursive:true, force:true });
  await rm(temp, { recursive:true, force:true });
}
