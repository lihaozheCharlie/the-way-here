import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyMasApp } from '../../../scripts/verify-mas-apis.mjs';
import { applyPythonAppStoreCompliance } from '../../../scripts/python-app-store-compliance.mjs';

async function fixture(t) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'twh-mas-regression-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'The Way Here.app');
  const info={CFBundleIdentifier:'com.thewayhere.desktop',CFBundleShortVersionString:'0.1.2',CFBundleVersion:'14',LSMinimumSystemVersion:'15.0'};
  const settings={entitlements:'<plist><dict><key>com.apple.security.app-sandbox</key><true/></dict></plist>',dependencies:'fixture:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n'};
  const put=async (relative,bytes)=>{const file=path.join(root,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);return file;};
  await put('Contents/Info.plist','fixture');
  const command=(name,args)=>{
    if(name==='/usr/bin/plutil')return JSON.stringify(info);
    if(name==='/usr/bin/codesign')return args.at(-1)===root ? settings.entitlements : settings.helperEntitlements ?? '';
    if(name==='/usr/bin/otool')return settings.dependencies;
    throw new Error('Unexpected command');
  };
  const audit=(options={})=>verifyMasApp(root,{command,...options});
  return {root,info,settings,put,audit};
}
const macho=body=>Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from(body)]);

test('MAS audit identifies the exact build and rejects a stale artifact',async t=>{
  const f=await fixture(t);
  const good=await f.audit({expectedVersion:'0.1.2',expectedBuildNumber:'14'});
  assert.deepEqual(good.failures,[]);
  assert.deepEqual(good.bundle,{id:'com.thewayhere.desktop',version:'0.1.2',build:'14',minimumSystemVersion:'15.0'});
  const stale=await f.audit({expectedVersion:'0.1.10',expectedBuildNumber:'15'});
  assert.equal(stale.failures.length,2);
});

test('MAS audit detects installation protocols in source and cached bytecode',async t=>{
  const f=await fixture(t);
  for(const name of ['parse.py','__pycache__/parse.cpython-312.pyc'])await f.put('Contents/Resources/python/lib/python3.12/urllib/'+name,Buffer.from('\0itms-services\0'));
  const report=await f.audit();
  assert.equal(report.failures.filter(item=>item.includes('app-install URL scheme')).length,2);
});

test('MAS audit rejects package installers, including changed Python versions and metadata remnants',async t=>{
  const f=await fixture(t);
  for(const name of ['bin/pip3.13','lib/python3.13/ensurepip/__init__.py','lib/python3.13/site-packages/pip/__main__.py','lib/python3.13/site-packages/pip-25.0.dist-info/METADATA'])await f.put('Contents/Resources/python/'+name,'installer');
  await f.put('Contents/Resources/python/lib/python3.13/site-packages/yaml/__init__.py','required bundled dependency');
  assert.equal((await f.audit()).failures.length,4);
});

test('MAS audit rejects private AppKit and system compression dependencies, retaining public bundled implementations',async t=>{
  const f=await fixture(t);
  await f.put('Contents/Resources/codex/bin/codex',macho('_lzma_code _lzma_end _lzma_stream_decoder'));
  f.settings.dependencies='fixture:\n\t@executable_path/../lib/liblzma.5.dylib (compatibility version 5.0)\n';
  assert.deepEqual((await f.audit()).failures,[]);
  await f.put('Contents/Resources/native/helper',macho('NSWindowDidOrderOnScreenNotification'));
  f.settings.dependencies='fixture:\n\t/usr/lib/liblzma.5.dylib (compatibility version 5.0)\n\t/System/Library/PrivateFrameworks/Example.framework/Example (compatibility version 1.0)\n';
  const report=await f.audit();
  assert.equal(report.binaries,2);
  for(const text of ['private AppKit notification','non-public Apple compression library','non-public Apple framework'])assert.ok(report.failures.some(item=>item.includes(text)));
});

test('MAS audit rejects missing sandbox, excess privileges, and unused privacy/ATS defaults',async t=>{
  const f=await fixture(t);
  f.settings.entitlements='<dict><key>com.apple.security.app-sandbox</key><false/><key>com.apple.security.network.server</key><true/></dict>';
  for(const key of ['NSCameraUsageDescription','NSBluetoothAlwaysUsageDescription','NSBluetoothPeripheralUsageDescription','NSAudioCaptureUsageDescription'])f.info[key]='unused';
  f.info.NSAppTransportSecurity={NSAllowsArbitraryLoads:true};
  const report=await f.audit();
  assert.equal(report.failures.length,7);
  assert.ok(report.failures.includes('Missing App Sandbox entitlement'));
});

test('MAS audit rejects a different app identity and inbound network access in a helper',async t=>{
  const f=await fixture(t);
  f.info.CFBundleIdentifier='com.thewayhere.desktop.dev';
  f.settings.helperEntitlements='<dict><key>com.apple.security.network.server</key><true/></dict>';
  await f.put('Contents/Resources/native/helper',macho('fixture'));
  assert.deepEqual((await f.audit()).failures,[
    'Unexpected Mac App Store bundle identifier',
    'Contents/Resources/native/helper: unneeded inbound network entitlement',
  ]);
});

test('MAS audit reports possible credentials without echoing their contents',async t=>{
  const f=await fixture(t);
  const fakeCredential='sk-'+ 'anonymousfixture'.repeat(3);
  await f.put('Contents/Resources/settings.json',fakeCredential);
  const report=await f.audit();
  assert.equal(report.failures.length,1);
  assert.ok(report.failures[0].includes('possible embedded model credential'));
  assert.ok(!JSON.stringify(report).includes(fakeCredential));
});

test('MAS audit cannot pass when codesign returns success without readable entitlements',async t=>{
  const f=await fixture(t);
  f.settings.entitlements='';
  assert.deepEqual((await f.audit()).failures,['Signed entitlements could not be read; final signature verification is required']);
});

test('Python store preparation removes protocols, all parser caches and installers idempotently',async t=>{
  const f=await fixture(t),python=path.join(f.root,'Contents/Resources/python');
  const prefix='Contents/Resources/python/';
  await f.put(prefix+'lib/python3.12/urllib/parse.py',"uses_relative = ['ws', 'wss', 'itms-services']\n");
  for(const name of ['parse.pyc','__pycache__/parse.cpython-312.pyc','__pycache__/parse.cpython-312.opt-1.pyc'])await f.put(prefix+'lib/python3.12/urllib/'+name,'stale parser');
  await f.put(prefix+'lib/python3.12/urllib/__pycache__/request.cpython-312.pyc','unrelated module');
  for(const name of ['bin/pip','bin/pip3','bin/pip3.12','lib/python3.12/ensurepip/__init__.py','lib/python3.12/site-packages/pip/__main__.py','lib/python3.12/site-packages/pip-25.0.dist-info/METADATA'])await f.put(prefix+name,'installer');
  await f.put(prefix+'lib/python3.12/site-packages/yaml/__init__.py','required yaml');
  const calls=[];const run=(name,args)=>{calls.push([name,...args]);return {status:0};};
  await applyPythonAppStoreCompliance(python,{run});
  await applyPythonAppStoreCompliance(python,{run});
  assert.equal(await readFile(path.join(python,'lib/python3.12/urllib/parse.py'),'utf8'),"uses_relative = ['ws', 'wss']\n");
  assert.deepEqual((await f.audit()).failures,[]);
  await assert.rejects(access(path.join(python,'lib/python3.12/urllib/__pycache__/parse.cpython-312.opt-1.pyc')),{code:'ENOENT'});
  assert.equal(await readFile(path.join(python,'lib/python3.12/urllib/__pycache__/request.cpython-312.pyc'),'utf8'),'unrelated module');
  assert.equal(await readFile(path.join(python,'lib/python3.12/site-packages/yaml/__init__.py'),'utf8'),'required yaml');
  if(process.platform==='darwin')assert.equal(calls.length,2);
});

test('Python store preparation fails closed if the upstream parser shape changes',async t=>{
  const f=await fixture(t);
  const parser=await f.put('Contents/Resources/python/lib/python3.12/urllib/parse.py','changed upstream parser');
  await assert.rejects(applyPythonAppStoreCompliance(path.join(f.root,'Contents/Resources/python')),/Unsupported Python URL parser/);
  assert.equal(await readFile(parser,'utf8'),'changed upstream parser');
});
