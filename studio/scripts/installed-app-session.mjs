import { chromium, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function launchInstalledApp(executablePath, profile, env) {
  // The signed app disables Node inspection. Use only the isolated renderer.
  const portFile = path.join(profile, 'DevToolsActivePort');
  await rm(portFile, { force: true });
  const child = spawn(executablePath, [
    '--diagnostics', `--user-data-dir=${profile}`,
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  ], { env, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  let browser, launchError, stderr = '';
  child.on('error', error => { launchError = error; });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });

  function processes() {
    if (!child.pid) return [];
    const result = spawnSync('/bin/ps', ['-Ao', 'pid=,pgid=,args='], { encoding: 'utf8' });
    if (result.status !== 0) throw Error('Could not inspect test processes');
    return result.stdout.split('\n').flatMap(line => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) return [];
      const [, pid, group, args] = match;
      return Number(group) === child.pid || args.includes(`--user-data-dir=${profile}`) ? [Number(pid)] : [];
    });
  }

  async function close() {
    await browser?.close().catch(() => {});
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      for (const pid of processes()) {
        try { process.kill(pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      const deadline = Date.now() + 5000;
      while (processes().length && Date.now() < deadline) await delay(100);
      if (!processes().length) return;
    }
    throw Error('Installed app verification processes remain');
  }

  try {
    let endpoint;
    const deadline = Date.now() + 45000;
    while (!endpoint && Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null || child.signalCode !== null) throw Error(`Installed app exited during startup: ${stderr}`);
      try {
        const [port, route] = (await readFile(portFile, 'utf8')).trim().split('\n');
        if (!/^\d+$/.test(port) || !route?.startsWith('/devtools/browser/')) throw Error('Invalid renderer endpoint');
        endpoint = `ws://127.0.0.1:${port}${route}`;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await delay(100);
      }
    }
    if (!endpoint) throw Error(`Installed app did not start its renderer: ${stderr}`);
    browser = await chromium.connectOverCDP(endpoint);
    let page;
    await expect.poll(() => {
      page = browser.contexts()[0]?.pages().find(candidate => candidate.url().startsWith('https://workspace-'));
      return Boolean(page);
    }, { timeout: 30000 }).toBe(true);
    return { page, close };
  } catch (error) {
    await close();
    throw error;
  }
}
