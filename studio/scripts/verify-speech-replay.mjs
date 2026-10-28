// Explicit opt-in local audio validation. Never copies private audio into the repo.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const pauseResume = process.argv.includes('--pause-resume');
const audioPaths = process.argv.slice(2).filter(value => value !== '--pause-resume').map(value => path.resolve(value));
if (process.platform !== 'darwin' || !audioPaths.length) throw new Error('Usage on macOS: node scripts/verify-speech-replay.mjs <local audio paths...>');
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(path.join(os.tmpdir(), 'twh-speech-validation-'));
const app = path.join(root, 'Speech Replay.app');
await mkdir(path.join(app, 'Contents/MacOS'), { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, SWIFT_MODULECACHE_PATH: path.join(root, 'swift-cache'), CLANG_MODULE_CACHE_PATH: path.join(root, 'clang-cache') } });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
  return result.stdout;
};
const info = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.thewayhere.speech-replay</string>
<key>CFBundleName</key><string>Speech Replay</string><key>CFBundleExecutable</key><string>replay</string>
<key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/>
<key>NSSpeechRecognitionUsageDescription</key><string>在本机重放历史录音，验证长语音修复。</string>
</dict></plist>`;
await writeFile(path.join(app, 'Contents/Info.plist'), info);
run('xcrun', ['swiftc', path.join(studio, 'apps/desktop/native/SpeechCapture.swift'), '-o', path.join(app, 'Contents/MacOS/replay')]);
run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
const frames = file => {
  const output = run('/usr/bin/afinfo', [file]);
  const match = output.match(/audio (\d+) valid frames/);
  assert.ok(match, 'audio frame count available');
  return Number(match[1]);
};
let child;
let helperPid;
const terminate = () => {
  // LaunchServices owns the helper; terminate only the PID reported by this run.
  if (helperPid) { try { process.kill(helperPid, 'SIGTERM'); } catch {} }
  child?.kill('SIGTERM');
};
const interrupted = () => { terminate(); process.exitCode = 130; };
process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted);
const summaries = [];
try {
  for (let index = 0; index < audioPaths.length; index++) {
    const output = path.join(root, `replay-${index}.jsonl`);
    const stderr = path.join(root, `replay-${index}.stderr`);
    const commandsPath = path.join(root, `commands-${index}`);
    if (pauseResume) run('/usr/bin/mkfifo', [commandsPath]);
    const commands = pauseResume ? await open(commandsPath, 'r+') : undefined;
    const inputArgs = pauseResume ? ['--stdin', commandsPath] : [];
    child = spawn('/usr/bin/open', ['-n', '-W', ...inputArgs, '--stdout', output, '--stderr', stderr, app, '--args', root, '--replay', audioPaths[index], ...(pauseResume ? ['--replay-commands'] : [])], { stdio: 'ignore' });
    // Keep a bounded watch for cleanup and report progress without private text.
    let lastSegment = 0;
    let pauseTimer, resumeTimer;
    let controlsScheduled = false;
    const watch = setInterval(async () => {
      try {
        const events = (await readFile(output, 'utf8')).split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
        helperPid = events.find(event => event.event === 'replay-start')?.pid;
        if (pauseResume && !controlsScheduled && events.some(event => event.event === 'ready')) {
          controlsScheduled = true;
          pauseTimer = setTimeout(() => { commands.write('pause\n').catch(() => {}); }, 5000);
          resumeTimer = setTimeout(() => { commands.write('resume\n').catch(() => {}); }, 7000);
        }
        const segments = events.filter(event => event.event === 'replay-segment');
        if (segments.length > lastSegment) { lastSegment = segments.length; console.log(`Recording ${index + 1}: recognition segment ${lastSegment}`); }
      } catch {}
    }, 1000);
    const timeout = setTimeout(terminate, 25 * 60 * 1000);
    let status;
    try { status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); }
    finally { clearInterval(watch); clearTimeout(timeout); clearTimeout(pauseTimer); clearTimeout(resumeTimer); await commands?.close(); }
    child = undefined;
    helperPid = undefined;
    assert.equal(status, 0, 'replay helper exited');
    const events = (await readFile(output, 'utf8')).trim().split('\n').map(JSON.parse);
    if (pauseResume) assert.deepEqual(events.filter(event => event.event === 'paused').map(event => event.paused), [true, false]);
    const final = events.at(-1);
    assert.equal(final.error, '', 'recognition succeeded');
    assert.equal(final.warning, '', 'no incomplete recognition warning');
    assert.ok(final.text.trim(), 'nonempty final transcript (use speech recordings, not silent fixtures)');
    assert.equal(frames(final.recordingPath), frames(audioPaths[index]), 'every input audio frame retained');
    assert.equal(events.filter(event => event.event === 'progress').at(-1)?.percent, 100);
    const preview = events.filter(event => event.event === 'transcript').at(-2)?.text ?? '';
    const summary = { index: index + 1, finalCharacters: final.text.length, previewCharacters: preview.length, recognitionSegments: events.filter(event => event.event === 'replay-segment').length, frames: frames(final.recordingPath), transcriptPath: path.join(path.dirname(final.recordingPath), 'transcript-final.txt') };
    summaries.push(summary);
    console.log(JSON.stringify(summary));
  }
  await writeFile(path.join(root, 'verification.json'), JSON.stringify(summaries, null, 2));
  console.log(`Local evidence: ${root}`);
} finally {
  terminate();
  await rm(app, { recursive: true, force: true });
  process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted);
}
