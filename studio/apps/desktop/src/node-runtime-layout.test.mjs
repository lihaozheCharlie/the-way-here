import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bundledNodeEnvironment } from './node-runtime-layout.mjs';

test('packaged workers override inherited runtime paths with their own ordinary Node executable', () => {
  const resources = '/anonymous/The Way Here.app/Contents/Resources';
  const env = { TWH_BUNDLED_NODE: '/anonymous/untrusted/node', ...bundledNodeEnvironment({ packaged: true, resources }) };
  assert.equal(env.TWH_BUNDLED_NODE, path.join(resources, 'node/bin/node'));
  assert.deepEqual(Object.keys(env), ['TWH_BUNDLED_NODE']);
  assert.doesNotMatch(env.TWH_BUNDLED_NODE, /keychain|MacOS/);
});
test('development remains independent of bundled runtime preparation and relative package paths fail', () => {
  assert.deepEqual(bundledNodeEnvironment({ packaged: false }), {});
  assert.throws(() => bundledNodeEnvironment({ packaged: true, resources: 'relative/Resources' }), /absolute/);
});
