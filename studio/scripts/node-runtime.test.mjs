import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NODE_RUNTIME, nodeRuntimeBuildPlan, verifyNodeArchive, prepareNodeRuntime } from './node-runtime.mjs';

test('pins a published official macOS LTS runtime and both package architectures', () => {
  assert.equal(NODE_RUNTIME.version, '22.23.4');
  assert.equal(NODE_RUNTIME.releaseDate, '2026-10-20');
  assert.equal(NODE_RUNTIME.lts, 'Jod');
  assert.equal(NODE_RUNTIME.minimumMacOS, '11.0');
  for (const arch of ['arm64', 'x64']) {
    const plan = nodeRuntimeBuildPlan({ arch, platform: 'darwin' });
    assert.equal(new URL(plan.url).origin, 'https://nodejs.org');
    assert.equal(plan.url, `https://nodejs.org/dist/v22.23.4/node-v22.23.4-darwin-${arch}.tar.gz`);
    assert.match(plan.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(plan.files, ['bin/node', 'LICENSE', 'runtime.json']);
    assert.equal(plan.packagedRelativePath, 'node/bin/node');
    assert.equal(plan.outputRelativePath, `.runtime/package/node/${arch}`);
    assert.equal(plan.cacheRelativePath, `.runtime/cache/node/22.23.4/${arch}`);
    assert.ok(!JSON.stringify(plan).includes(process.cwd()));
    assert.ok(!plan.files.some(file => /npm|npx|include|node_modules/.test(file)));
  }
});
test('maps electron-builder arch enums and rejects unknown target plans', () => {
  assert.equal(nodeRuntimeBuildPlan({ arch: 3, platform: 'mas' }).arch, 'arm64');
  assert.equal(nodeRuntimeBuildPlan({ arch: 1, platform: 'darwin' }).arch, 'x64');
  assert.equal(nodeRuntimeBuildPlan({ arch: 'x86_64', platform: 'darwin' }).arch, 'x64');
  for (const arch of ['universal', 'ia32', '../x64', '__proto__', 'constructor', 0]) {
    assert.throws(() => nodeRuntimeBuildPlan({ arch, platform: 'darwin' }), /explicit/);
  }
  assert.throws(() => nodeRuntimeBuildPlan({ arch: 'arm64', platform: 'linux' }), /macOS/);
});
test('fails closed on missing, changed, duplicate or mismatched official checksums', () => {
  const plan = nodeRuntimeBuildPlan({ arch: 'arm64', platform: 'darwin' });
  const line = `${plan.sha256}  ${plan.filename}\n`;
  assert.throws(() => verifyNodeArchive(Buffer.from('anonymous fake payload'), '', plan), /entry/);
  assert.throws(() => verifyNodeArchive(Buffer.from('anonymous fake payload'), line.replace(plan.sha256, '0'.repeat(64)), plan), /entry/);
  assert.throws(() => verifyNodeArchive(Buffer.from('anonymous fake payload'), line + line, plan), /entry/);
  assert.throws(() => verifyNodeArchive(Buffer.from('anonymous fake payload'), line, plan), /mismatch/);
});
test('refuses linked cache ancestors before any download or package write', async () => {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'twh-node-anonymous-'));
  try {
    await mkdir(path.join(root, 'outside'));
    await symlink(path.join(root, 'outside'), path.join(root, '.runtime'));
    await assert.rejects(prepareNodeRuntime({ studio: root, arch: 'arm64', platform: 'darwin' }), /symbolic links/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a corrupted cached archive cannot replace a previously prepared runtime', async () => {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'twh-node-corrupt-cache-'));
  try {
    const plan = nodeRuntimeBuildPlan({ arch: 'arm64', platform: 'darwin' });
    const cache = path.join(root, plan.cacheRelativePath), output = path.join(root, plan.outputRelativePath);
    await mkdir(cache, { recursive: true }); await mkdir(output, { recursive: true });
    await writeFile(path.join(cache, 'SHASUMS256.txt'), `${plan.sha256}  ${plan.filename}\n`);
    await writeFile(path.join(cache, plan.filename), 'Anonymous corrupted archive');
    await writeFile(path.join(output, 'existing-runtime-marker'), 'preserved');
    await assert.rejects(prepareNodeRuntime({ studio: root, arch: 'arm64', platform: 'darwin' }), /checksum mismatch/);
    assert.equal(await readFile(path.join(output, 'existing-runtime-marker'), 'utf8'), 'preserved');
  } finally { await rm(root, { recursive: true, force: true }); }
});
