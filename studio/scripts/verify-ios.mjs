import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLockedVerification, verificationWorkerOwnsLock } from './verification-lock.mjs';

const studio = fileURLToPath(new URL('../', import.meta.url));
if (await verificationWorkerOwnsLock(studio)) await verify();
else process.exitCode = await runLockedVerification({studio,command:process.execPath,args:[fileURLToPath(import.meta.url),...process.argv.slice(2)]});

async function verify() {
const ios = path.join(studio, 'apps/ios');
const requireIOS = process.argv.includes('--require-ios');
const simulator = process.argv.includes('--simulator');
const derivedData = path.resolve(studio, process.env.TWH_IOS_DERIVED_DATA_PATH ?? '.runtime/ios-derived');
const derivedRelative = path.relative(path.join(studio, '.runtime'), derivedData);
if (derivedRelative.startsWith('..') || path.isAbsolute(derivedRelative)) throw new Error('iOS derived data must stay in this workspace runtime directory.');
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: studio, env: process.env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed${capture ? ': ' + result.stderr : ''}`);
  return result.stdout;
}
const record = { coreVerified: false, coreXCTestVerified: false, swiftSyntaxVerified: false, iosBuildVerified: false, simulatorVerified: false, checkedAt: new Date().toISOString() };
await mkdir(path.join(studio, '.runtime/ios'), { recursive: true });
const saveRecord = () => writeFile(path.join(studio, '.runtime/ios/verification.json'), JSON.stringify(record, null, 2));
await saveRecord();
// A newly installed Xcode need not replace the user's system developer setting.
if (!process.env.DEVELOPER_DIR) {
  try { await access('/Applications/Xcode.app/Contents/Developer'); process.env.DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer'; } catch {}
}
const appInfo = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', path.join(ios, 'Configuration/App-Info.plist')], true));
if (Object.hasOwn(appInfo, 'UIApplicationShortcutItems')) throw new Error('Static UIApplicationShortcutItems would displace dynamic unread shortcuts; remove them from App-Info.plist.');
run(process.execPath, ['--import', './apps/server/node_modules/tsx/dist/loader.mjs', 'scripts/prepare-ios-resources.ts']);
run('python3', ['scripts/generate-ios-project.py']);
run('plutil', ['-lint', path.join(ios, 'TheWayHere.xcodeproj/project.pbxproj')]);
const swiftFiles = async directory => (await readdir(path.join(ios, directory))).filter(name => name.endsWith('.swift')).map(name => path.join(ios, directory, name));
for (const directory of ['App', 'Extensions/Shared', 'Extensions/Share', 'Extensions/Widgets', 'UITests']) run('xcrun', ['swiftc', '-frontend', '-parse', ...await swiftFiles(directory)]);
async function sourceDigest() {
  const hash = createHash('sha256');
  async function visit(directory) {
    for (const item of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = path.join(directory,item.name);
      if (item.isDirectory()) await visit(file);
      else if (/\.(swift|json|plist|entitlements|strings)$/.test(item.name)) { hash.update(path.relative(ios,file)); hash.update(await readFile(file)); }
    }
  }
  for (const folder of ['App','Extensions','Sources','UITests','Configuration','Resources']) await visit(path.join(ios,folder));
  return hash.digest('hex');
}
record.sourceDigest = await sourceDigest();
record.swiftSyntaxVerified = true; await saveRecord();
run('swift', ['run', '--package-path', ios, '--scratch-path', path.join(studio, '.runtime/ios-core-build'), 'verify-mobile-core']);
run('swift', ['test', '--package-path', ios, '--scratch-path', path.join(studio, '.runtime/ios-core-build')]);
record.coreVerified = true; record.coreXCTestVerified = true; await saveRecord();
const check = spawnSync('xcodebuild', ['-version'], { encoding: 'utf8', env: process.env });
if (check.status !== 0) {
  await writeFile(path.join(studio, '.runtime/ios/verification.json'), JSON.stringify(record, null, 2));
  console.log('Core and syntax checks passed. iOS build and native UI remain UNVERIFIED: full Xcode is required.');
  if (requireIOS || simulator) process.exitCode = 1;
} else {
  const args = ['-project', path.join(ios, 'TheWayHere.xcodeproj'), '-scheme', 'TheWayHere', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-derivedDataPath', derivedData, 'CODE_SIGNING_ALLOWED=NO'];
  run('xcodebuild', [...args, '-destination', 'generic/platform=iOS Simulator', 'build']); record.iosBuildVerified = true; await saveRecord();
  if (simulator) {
    const devices = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], true));
    const choices = Object.values(devices.devices).flat().filter(device => device.isAvailable && (device.deviceTypeIdentifier ? device.deviceTypeIdentifier.startsWith('com.apple.CoreSimulator.SimDeviceType.iPhone') : /^iPhone/.test(device.name)));
    const requestedDevice = process.env.TWH_IOS_SIMULATOR_UDID;
    const device = requestedDevice ? choices.find(device => device.udid === requestedDevice) : choices.find(device => device.state === 'Booted') || choices[0];
    if (requestedDevice && !device) throw new Error('The explicitly selected iPhone simulator is unavailable.');
    if (!device) throw new Error('No installed iPhone simulator. Install an iOS runtime in Xcode first.');
    const alreadyBooted = device.state === 'Booted';
    try {
      if (!alreadyBooted) { run('xcrun', ['simctl', 'boot', device.udid]); const boot = run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], true); if (/Data Migration Failed|Status=3, isTerminal=YES/.test(boot)) throw new Error('The simulator failed system data migration. Choose a healthy simulator; its data was preserved.'); }
      const resultBundle = path.join(studio, '.runtime/ios/UI-' + Date.now() + '.xcresult');
      run('xcodebuild' , [...args, '-destination', `id=${device.udid}`, '-parallel-testing-enabled', 'NO', '-collect-test-diagnostics', 'never', '-test-timeouts-enabled', 'YES', '-maximum-test-execution-time-allowance', '600', '-resultBundlePath', resultBundle, 'test']);
      const expectedTests = (await Promise.all((await swiftFiles('UITests')).map(async file => [...(await readFile(file, 'utf8')).matchAll(/^\s*func\s+(test\w+)\s*\(/gm)].length))).reduce((sum, count) => sum + count, 0);
      const summary = JSON.parse(run('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', resultBundle], true));
      record.nativeTestsExpected = expectedTests; record.nativeTestsPassed = summary.passedTests; record.nativeTestsSkipped = summary.skippedTests; record.resultBundle = resultBundle;
      if (summary.totalTestCount !== expectedTests || summary.passedTests !== expectedTests || summary.skippedTests !== 0) { await saveRecord(); throw new Error('The native runner did not execute every current test method successfully.'); }
      record.simulatorVerified = true;
    } finally { if (!alreadyBooted) { const state = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], true)); const owned = Object.values(state.devices).flat().find(item => item.udid === device.udid); if (owned?.state === 'Booted') run('xcrun', ['simctl', 'shutdown', device.udid]); } }
  }
  if (await sourceDigest() !== record.sourceDigest) { record.simulatorVerified = false; record.sourceChangedDuringVerification = true; await saveRecord(); throw new Error('Native sources changed during verification; rerun against the final source.'); }
  await writeFile(path.join(studio, '.runtime/ios/verification.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
}

}
