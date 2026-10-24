import { readFile, readdir, copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root=path.resolve(process.argv[2] || '');
if (!process.argv[2] || !root.endsWith('.app')) throw new Error('Pass the built MAS .app');
const failures=[];const reviewedMarkers=[];let binaries=0;let files=0;
const temporary=await mkdtemp(path.join(os.tmpdir(),'twh-mas-api-'));
function command(name,args) {
  const r=spawnSync(name,args,{encoding:'utf8',maxBuffer:16*1024*1024});
  if(r.status!==0) throw new Error(`${name} failed: ${r.stderr}`);
  return r.stdout;
}
async function scan(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isSymbolicLink()) continue;
    if(entry.isDirectory()) {await scan(file);continue;}
    const bytes=await readFile(file);
    files++;
    // App Store validation also inspects Python sources and cached bytecode,
    // not only native binaries. The product has no app installation feature.
    if (bytes.includes(Buffer.from('itms-services'))) failures.push(`${path.relative(root,file)}: unsupported app-install URL scheme`);
    const relativeFile=path.relative(root,file).split(path.sep).join('/');
    if (/Contents\/Resources\/python\/(?:bin\/pip(?:3(?:\.12)?)?$|lib\/python3\.12\/(?:ensurepip|site-packages\/pip)(?:\/|$))/.test(relativeFile)) failures.push(`${relativeFile}: unused Python package installer`);
    for (const match of bytes.toString('latin1').matchAll(/\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{24,}/g)) {
      // Verified byte-for-byte in the pinned, official Codex 0.162.1 vendor
      // binary: adjacent credential-format markers in compiled static data.
      // Restrict the exception to this exact marker and component; never log it.
      const upstreamMarker=relativeFile==='Contents/Resources/codex/bin/codex' && createHash('sha256').update(match[0]).digest('hex')==='af9758431b8978c5c611a9627c4e9f6bfa49cc1aaec6b75b8cf22a60a6febfac';
      if (upstreamMarker) reviewedMarkers.push(`${relativeFile}: verified upstream static format marker`);
      else failures.push(`${relativeFile}: possible embedded model credential (inspect privately)`);
    }
    if (!['cffaedfe','feedfacf','cafebabe','bebafeca'].includes(bytes.subarray(0,4).toString('hex'))) continue;
    binaries++;
    const relative=path.relative(root,file);
    if(bytes.includes(Buffer.from('NSWindowDidOrderOnScreenNotification'))) failures.push(`${relative}: private AppKit notification`);
    // otool interprets a trailing "(GPU)" as an archive member, even when
    // passed as a single argument. Inspect a byte-identical neutral filename.
    const inspection=file.endsWith(')') ? path.join(temporary,`${binaries}.bin`) : file;
    if(inspection!==file) await copyFile(file,inspection);
    const dependencies=command('/usr/bin/otool',['-L',inspection]);
    if(/\/usr\/lib\/(?:liblzma|libbz2)/.test(dependencies)) failures.push(`${relative}: non-public Apple compression library`);
    if(/libtcl.*tk|libtk\d/.test(dependencies)) failures.push(`${relative}: unused Tk dependency`);
    if(dependencies.includes('/System/Library/PrivateFrameworks/')) failures.push(`${relative}: non-public Apple framework`);
    for(const dependency of dependencies.split('\n').slice(1)) {
      const linked=dependency.trim().split(' (')[0];
      if(linked.startsWith('/') && !linked.startsWith('/usr/lib/') && !linked.startsWith('/System/Library/Frameworks/')) failures.push(`${relative}: non-portable or private dependency ${linked}`);
    }
  }
}
try { await scan(root); } finally { await rm(temporary,{recursive:true,force:true}); }
const entitlements=command('/usr/bin/codesign',['-d','--entitlements',':-',root]);
if(entitlements.includes('com.apple.security.network.server')) failures.push('Unneeded inbound network entitlement');
const info=JSON.parse(command('/usr/bin/plutil',['-convert','json','-o','-',path.join(root,'Contents/Info.plist')]));
for(const key of ['NSCameraUsageDescription','NSBluetoothAlwaysUsageDescription','NSBluetoothPeripheralUsageDescription','NSAudioCaptureUsageDescription']) if(key in info) failures.push(`Unused privacy description: ${key}`);
if(info.NSAppTransportSecurity?.NSAllowsArbitraryLoads) failures.push('Unneeded unrestricted App Transport Security exception');
console.log(JSON.stringify({files,binaries,reviewedMarkers,failures},null,2));
if(failures.length) process.exitCode=1;
