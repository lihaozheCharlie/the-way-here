import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Backport CPython's Mac/Resources/app-store-compliance.patch to our pinned
// 3.12 distribution. Remove unused protocol support, never obfuscate it.
// https://github.com/python/cpython/blob/v3.13.0/Mac/Resources/app-store-compliance.patch
export async function applyPythonAppStoreCompliance(pythonRoot) {
  const urllib = path.join(pythonRoot, 'lib/python3.12/urllib');
  const file = path.join(urllib, 'parse.py');
  const source = await readFile(file, 'utf8');
  const original = "'ws', 'wss', 'itms-services']";
  const replacement = "'ws', 'wss']";
  const patched = source.replace(original, replacement);
  if (patched.includes('itms-services') || !patched.includes(replacement)) {
    throw new Error('Unsupported Python URL parser: review the upstream App Store patch');
  }
  if (patched !== source) await writeFile(file, patched);
  // A cached code object can retain the removed protocol even after patching
  // source. Invalidate only parse bytecode, including optimized variants.
  await rm(path.join(urllib, 'parse.pyc'), { force: true });
  const cache = path.join(urllib, '__pycache__');
  for (const name of await readdir(cache).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    if (/^parse\..*\.pyc$/.test(name)) await rm(path.join(cache, name));
  }
  // Package installation is a build-time concern. The shipped knowledge
  // runtime only needs the already bundled standard library and PyYAML.
  await rm(path.join(pythonRoot, 'lib/python3.12/ensurepip'), { recursive:true, force:true });
  const packages = path.join(pythonRoot, 'lib/python3.12/site-packages');
  for (const name of await readdir(packages)) {
    if (name === 'pip' || /^pip-.*\.dist-info$/.test(name)) await rm(path.join(packages,name), { recursive:true, force:true });
  }
  for (const name of ['pip','pip3','pip3.12']) await rm(path.join(pythonRoot,'bin',name), { force:true });
  // uv relocates this dylib's ID to its build-machine installation. Keep the
  // shipped identity portable; dependent libraries continue using @rpath.
  if (process.platform === 'darwin') {
    const result=spawnSync('/usr/bin/install_name_tool',['-id','@rpath/libpython3.12.dylib',path.join(pythonRoot,'lib/libpython3.12.dylib')],{encoding:'utf8'});
    if (result.status !== 0) throw new Error(`Could not normalize bundled Python identity: ${result.stderr}`);
  }
}
