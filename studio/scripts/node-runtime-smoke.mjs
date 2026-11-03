import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareNodeRuntime } from './node-runtime.mjs';
import afterPack from './after-pack.cjs';
import { bundledNodeEnvironment } from '../apps/desktop/src/node-runtime-layout.mjs';

// Exercises the same afterPack entrypoint against a disposable anonymous app.
// No Electron, signing credentials, server, Keychain, cloud, or user library access.
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'twh-node-package-smoke-'));
try {
  const prepared = await prepareNodeRuntime({studio});
  const projectDir = path.join(root, 'anonymous-project');
  const cache = path.join(projectDir, prepared.plan.cacheRelativePath);
  await mkdir(cache, {recursive:true});
  for (const name of ['SHASUMS256.txt',prepared.plan.filename]) await copyFile(path.join(studio,prepared.plan.cacheRelativePath,name),path.join(cache,name));
  await mkdir(path.join(projectDir,'.runtime/package/server/node_modules'),{recursive:true});
  await writeFile(path.join(projectDir,'.runtime/package/server/node_modules/anonymous.js'),'module.exports = true;');
  await afterPack({ arch: process.arch, electronPlatformName: 'darwin', appOutDir: root, packager: { projectDir, appInfo: { productFilename: 'Anonymous Runtime Check' } } },{mobileKeychain:{env:{}}});
  const resources = path.join(root,'Anonymous Runtime Check.app/Contents/Resources');
  const workerEnvironment = {PATH:'/usr/bin:/bin',HOME:root,TMPDIR:root,...bundledNodeEnvironment({packaged:true,resources})};
  const executable = workerEnvironment.TWH_BUNDLED_NODE;
  assert.equal(await readFile(path.join(resources,'server/node_modules/anonymous.js'),'utf8'),'module.exports = true;');
  const runtime = path.resolve(executable, '../..');
  assert.deepEqual((await readdir(runtime)).sort(), ['LICENSE', 'bin', 'runtime.json']);
  assert.deepEqual(await readdir(path.join(runtime, 'bin')), ['node']);
  const metadata = JSON.parse(await readFile(path.join(runtime, 'runtime.json'), 'utf8'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(await readFile(executable)), metadata.unsignedExecutableSHA256);
  assert.equal(hash(await readFile(path.join(runtime, 'LICENSE'))), metadata.licenseSHA256);
  const sample = path.join(root, 'anonymous-input.txt'); await writeFile(sample, 'Fictional standalone search text.');
  const result = spawnSync(executable, ['-e', "const fs=require('node:fs'); const crypto=require('node:crypto'); const text=fs.readFileSync(process.argv[1],'utf8'); process.stdout.write(JSON.stringify({node:process.versions.node,arch:process.arch,electron:!!process.versions.electron,found:text.includes('standalone search'),hash:crypto.createHash('sha256').update(text).digest('hex')}));", sample], { encoding: 'utf8', timeout: 10000, env: workerEnvironment });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const output = JSON.parse(result.stdout);
  assert.equal(output.node, metadata.version); assert.equal(output.arch, metadata.arch); assert.equal(output.electron, false); assert.equal(output.found, true); assert.equal(output.hash, hash(await readFile(sample)));
  const macho = spawnSync('/usr/bin/otool', ['-l', executable], { encoding: 'utf8' });
  assert.equal(macho.status, 0); const minOS = macho.stdout.match(/\bminos\s+(\d+\.\d+)/)?.[1];
  assert.equal(minOS, metadata.minimumMacOS, 'The actual Node binary must preserve the declared minimum macOS.');
  console.log(JSON.stringify({ passed: true, version: output.node, arch: output.arch, minimumMacOS: minOS, files: metadata.files, standaloneSearch: output.found, afterPack: true, workerEnvironment: true }));
} finally { await rm(root, { recursive: true, force: true }); }
