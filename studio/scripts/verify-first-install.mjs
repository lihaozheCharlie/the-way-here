import { _electron as electron, expect } from '@playwright/test';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';

const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-fresh-install-')));
const releaseDir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const sourceApp = path.resolve('.runtime/releases', releaseDir, 'The Way Here.app');
const movedApp = path.join(temp, 'Applications/The Way Here.app');
const userData = path.join(temp, 'new-user');
const env = { ...process.env, PATH: '/usr/bin:/bin' };
delete env.THE_WAY_HERE_VAULT;
delete env.THE_WAY_HERE_KNOWLEDGE_BASE;
let app;

async function compareDemo(source, target) {
  for (const entry of await readdir(source, { withFileTypes:true })) {
    if (['.DS_Store', '__pycache__', '.runtime'].includes(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await compareDemo(from, to);
    else expect((await readFile(to)).equals(await readFile(from)), from).toBe(true);
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
  const page = await app.firstWindow({ timeout:60000 });
  const demo = await expectDemo(page);
  const root = JSON.parse(await readFile(path.join(userData, 'workspace.json'), 'utf8')).root;
  expect(root).toBe(path.join(userData, 'workspace'));
  const configPath = path.join(root, 'the-way-here.config.yaml');
  const config = await readFile(configPath, 'utf8');
  const parsed = YAML.parse(config);
  expect(parsed.defaultKnowledgeBase).toBe('demo');
  expect(Object.keys(parsed.knowledgeBases)).toEqual(['demo']);
  await expect(access(path.join(root, 'app/personal'))).rejects.toThrow();
  await compareDemo(path.resolve('../vault/demo'), path.join(root, 'vault/demo'));

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
  const reopened = await app.firstWindow({ timeout:60000 });
  await expectDemo(reopened);
  expect(await readFile(configPath, 'utf8')).toBe(config);
  console.log(`PASS: relocated first install opens demo (${demo.pageCount} pages, ${demo.sourceCount} sources), includes no empty personal library, and survives restart.`);
} finally {
  await app?.close();
  await rm(temp, { recursive:true, force:true });
}
