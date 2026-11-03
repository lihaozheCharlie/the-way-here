import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
if (process.platform !== 'darwin') throw new Error('Native code-signing authorization verification requires macOS.');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'twh-anonymous-keychain-auth-'));
try {
  const source = fileURLToPath(new URL('../apps/desktop/native/MobileKeychain.swift', import.meta.url));
  const compile = (output, flags = []) => {
    const result = spawnSync('xcrun', ['swiftc', '-module-cache-path', path.join(temporary, 'modules'), ...flags, source, '-o', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  const tests = path.join(temporary, 'authorization-tests'); compile(tests, ['-D', 'TWH_MOBILE_KEYCHAIN_AUTH_TESTS']);
  const checked = spawnSync(tests, [], { encoding: 'utf8' }); assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /16 anonymous authorization and request-policy checks passed/);
  const helper = path.join(temporary, 'unsigned-helper'); compile(helper);
  // An unsigned test-launcher may obtain only a denial. No real provider or signed QA wrapper is used.
  const denied = spawnSync(helper, [], { input: JSON.stringify({ operation: 'status' }), encoding: 'utf8', env: { ...process.env, TWH_PARENT_PID: '1' } });
  assert.equal(denied.status, 0); const response = JSON.parse(denied.stdout);
  assert.equal(response.available, false); assert.match(response.reason, /同 Team 签名的桌面主程序/); assert.equal(response.token, undefined);
  const invalid = spawnSync(helper, [], { input: JSON.stringify({ operation: 'read', provider: 'anonymous-phone', acceptanceRun: 'invalid' }), encoding: 'utf8' });
  assert.equal(JSON.parse(invalid.stdout).available, false);
  console.log('Native helper: 16 anonymous authorization checks, production caller denial and invalid anonymous request passed. No SecItem operation or real Key access.');
} finally { await rm(temporary, { recursive: true, force: true }); }
