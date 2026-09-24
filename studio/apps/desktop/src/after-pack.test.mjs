import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import afterPack from '../../../scripts/after-pack.cjs';

test('packaged server dependencies keep relative links when copied into the app', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'twh-after-pack-'));
  try {
    const projectDir = path.join(root, 'project');
    const source = path.join(projectDir, '.runtime/package/server/node_modules');
    const packageDir = path.join(source, '.runtime-deps/package');
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, 'index.js'), 'export default true;');
    await symlink('.runtime-deps/package', path.join(source, 'sample'));
    const appOutDir = path.join(root, 'output');
    await afterPack({
      electronPlatformName: 'darwin',
      appOutDir,
      packager: { projectDir, appInfo: { productFilename: 'The Way Here' } },
    });
    const destination = path.join(appOutDir, 'The Way Here.app/Contents/Resources/server/node_modules/sample');
    assert.equal(await readlink(destination), '.runtime-deps/package');
    assert.equal(await realpath(destination), await realpath(path.join(appOutDir, 'The Way Here.app/Contents/Resources/server/node_modules/.runtime-deps/package')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
