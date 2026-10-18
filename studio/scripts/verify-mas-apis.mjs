import { readFile, readdir, copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root=path.resolve(process.argv[2] || '');
if (!process.argv[2] || !root.endsWith('.app')) throw new Error('Pass the built MAS .app');
const failures=[];let binaries=0;
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
  }
}
try { await scan(root); } finally { await rm(temporary,{recursive:true,force:true}); }
const entitlements=command('/usr/bin/codesign',['-d','--entitlements',':-',root]);
if(entitlements.includes('com.apple.security.network.server')) failures.push('Unneeded inbound network entitlement');
console.log(JSON.stringify({binaries,failures},null,2));
if(failures.length) process.exitCode=1;
