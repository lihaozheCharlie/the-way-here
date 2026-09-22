import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let executable = require('electron');
if (process.platform === 'darwin') {
  // macOS reads the Dock label from the bundle, not Electron's app.setName().
  // Use a private copy so the installed Electron dependency remains untouched.
  const destination = path.join(studio, '.runtime/desktop-dev');
  const bundle = path.join(destination, 'The Way Here.app');
  const stamp = path.join(destination, 'electron-version');
  const version = require('electron/package.json').version;
  const prepared = await readFile(stamp, 'utf8').catch(() => '');
  if (prepared !== version) {
    await mkdir(destination, { recursive: true });
    await rm(bundle, { recursive: true, force: true });
    execFileSync('/usr/bin/ditto', [path.resolve(executable, '../../..'), bundle]);
  }
  const plist = path.join(bundle, 'Contents/Info.plist');
  for (const [key, value] of Object.entries({
    CFBundleName: 'The Way Here',
    CFBundleDisplayName: 'The Way Here',
    CFBundleIdentifier: 'com.thewayhere.desktop.dev',
    NSMicrophoneUsageDescription: '将你主动录制的生活片段转成文字，确认后才保存。',
    NSSpeechRecognitionUsageDescription: '将你说的话转成可编辑的原话。',
  })) {
    execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
  }
  await copyFile(path.join(studio, 'apps/desktop/dist/app.icns'), path.join(bundle, 'Contents/Resources/electron.icns'));
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'pipe' });
  await writeFile(stamp, version);
  executable = path.join(bundle, 'Contents/MacOS/Electron');
}
if (process.argv.includes('--prepare-only')) {
  console.log(executable);
} else {
  const child = spawn(executable, [path.join(studio, 'apps/desktop'), ...process.argv.slice(2)], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
