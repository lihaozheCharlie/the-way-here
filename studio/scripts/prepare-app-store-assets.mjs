import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(new URL('../apps/server/package.json', import.meta.url))('sharp');
const output = path.join(studio, '.runtime/app-store-preparation');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-store-assets-')));
// This path belongs only to the disposable workspace, never the user's active library.
const state = path.join(os.homedir(), 'Library/Application Support/the-way-here/vaults', createHash('sha256').update(root).digest('hex').slice(0, 16));
let application;
let stopped = false;
let ownedPids = [];
function captureProcesses(pid) {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
    .trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const owned = new Set([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [child, parent] of rows) if (owned.has(parent) && !owned.has(child)) { owned.add(child); changed = true; }
  }
  return [...owned];
}
async function verifyStopped() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const alive = ownedPids.filter(pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } });
    if (!alive.length) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('A screenshot application process has not exited; check the recorded process IDs before completing.');
}
try {
  if (process.platform !== 'darwin') throw new Error('Screenshot preparation requires macOS.');
  await mkdir(output, { recursive: true });
  await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true });
  await cp(path.join(studio, '../knowledge-engine'), path.join(root, 'knowledge-engine'), { recursive: true });
  await writeFile(path.join(root, 'AGENTS.md'), 'Anonymous store screenshot workspace.');
  await writeFile(path.join(root, 'the-way-here.config.yaml'), `version: 3
defaultKnowledgeBase: demo
paths:
  skills: knowledge-engine/skills
  tools: knowledge-engine/tools
  agentInstructions: AGENTS.md
knowledgeBases:
  demo:
    name: The Way Here 演示 Wiki
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
agents:
  runtimes:
    codex:
      enabled: false
    pi:
      enabled: false
validation:
  commands: []
`);
  // Brand master only; do not regenerate or overwrite the project's tracked artwork.
  await sharp(await readFile(path.join(studio, 'apps/desktop/assets/app-icon.svg')))
    .resize(1024, 1024).png().toFile(path.join(output, 'app-icon-1024.png'));
  application = await electron.launch({
    args: [path.join(studio, 'apps/desktop'), '--diagnostics', `--user-data-dir=${path.join(root, 'electron-profile')}`],
    env: { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo' },
    timeout: 60_000,
  });
  const child = application.process();
  const exited = new Promise(resolve => child.once('exit', resolve));
  const page = await application.firstWindow({ timeout: 60_000 });
  ownedPids = captureProcesses(child.pid);
  await page.waitForLoadState('domcontentloaded');
  const origin = new URL(page.url()).origin;
  if (!/^https:\/\/workspace-[a-f0-9]+\.localhost$/.test(origin)) throw new Error('Unexpected screenshot origin');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  await page.evaluate(() => localStorage.setItem('desktop.inspector', 'false'));
  const routes = [
    ['01-today', '/'],
    ['02-records', '/sources'],
    ['03-understanding', '/knowledge'],
    ['04-timeline', '/timeline'],
    ['05-letters', '/letters'],
  ];
  const assets = [];
  for (const [name, route] of routes) {
    await page.goto(origin + route);
    await expect(page.locator('.desktop-sidebar')).toBeVisible();
    await expect(page.locator('h1').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const filename = `${name}.png`;
    await page.screenshot({ path: path.join(output, filename), scale: 'css', animations: 'disabled' });
    const metadata = await sharp(path.join(output, filename)).metadata();
    if (metadata.width !== 1440 || metadata.height !== 900) throw new Error(`Invalid screenshot dimensions: ${filename}`);
    assets.push({ filename, route, width: metadata.width, height: metadata.height, sha256: createHash('sha256').update(await readFile(path.join(output, filename))).digest('hex') });
  }
  // Product verification only; these images are not store marketing screenshots.
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(700, 820));
  await page.goto(origin + '/preferences?tab=ai');
  const consent = page.getByRole('checkbox', {name:'我已了解并允许向上述服务发送任务所需资料，包括我启用的自动更新'});
  await expect(consent).toBeEnabled();
  await expect(consent).not.toBeChecked();
  const acceptedResponse = page.waitForResponse(response => response.url().endsWith('/api/agent-settings') && response.request().method() === 'PUT');
  await consent.click();
  const accepted = await acceptedResponse;
  if (!accepted.ok()) throw new Error(`Consent save failed: ${accepted.status()} ${await accepted.text()}`);
  await expect(consent).toBeChecked(); await expect(consent).toBeEnabled();
  await consent.click(); await expect(consent).not.toBeChecked(); await expect(consent).toBeEnabled();
  await page.screenshot({path:path.join(output,'qa-ai-settings-700.png'),fullPage:true});
  await page.goto(origin + '/privacy');
  await expect(page.getByRole('heading',{name:'隐私与数据使用',exact:true})).toBeVisible();
  await page.screenshot({path:path.join(output,'qa-privacy-700.png'),fullPage:true});
  await application.close();
  await exited;
  stopped = true;
  await verifyStopped();
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: 'preparation-only; recapture and review against the final MAS build before submission',
    knowledgeBaseId: 'demo', aiEnabled: false,
    version: JSON.parse(await readFile(path.join(studio, 'apps/desktop/package.json'), 'utf8')).version,
    cleanup: { ownedPids, allExited: true },
    assets,
  }, null, 2) + '\n');
  console.log(`Prepared ${assets.length} anonymous screenshots and icon: ${output}`);
} finally {
  if (application && !stopped) {
    ownedPids = captureProcesses(application.process().pid);
    await application.close();
    await verifyStopped();
  }
  await rm(root, { recursive: true, force: true });
  if (process.platform === 'darwin') await rm(state, { recursive: true, force: true });
}
