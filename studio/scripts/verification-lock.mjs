import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('./verification-lock.py', import.meta.url));
const lockFile = studio => path.join(studio, '.runtime/ios/verification.lock');
export async function verificationWorkerOwnsLock(studio) {
  const token = process.env.TWH_IOS_VERIFICATION_LOCK_TOKEN;
  if (!token || process.env.TWH_IOS_VERIFICATION_LOCK_PATH !== lockFile(studio)) return false;
  // The launcher publishes the worker PID immediately after spawning it.
  for (let attempt = 0; attempt < 100; attempt++) {
    let owner;
    try { owner = JSON.parse(await readFile(lockFile(studio), 'utf8')); } catch {}
    if (owner?.token === token && owner.workerPid === process.pid && owner.launcherPid === process.ppid && owner.processGroup === process.pid) return true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('The iOS verification worker does not own its workspace lock.');
}
export async function runLockedVerification({ studio, command, args = [], env = process.env, stdio = 'inherit' }) {
  await mkdir(path.dirname(lockFile(studio)), { recursive: true });
  const token = randomUUID();
  return await new Promise((resolve, reject) => {
    const child = spawn('python3', [launcher, lockFile(studio), token, JSON.stringify([command, ...args])], { env, stdio });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 143)));
  });
}
