import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { isRevealAllowed } from './reveal-path.mjs';

test('reveal allows workspace, userData and app state roots but rejects everything else', () => {
  const workspace = '/anonymous/workspace', userData = '/anonymous/user-data';
  assert.equal(isRevealAllowed(workspace, workspace, userData), true);
  assert.equal(isRevealAllowed(path.join(workspace, 'vault/personal/wiki'), workspace, userData), true);
  assert.equal(isRevealAllowed(path.join(userData, 'cache/speech-recordings'), workspace, userData), true);
  const stateRoot = path.join(os.homedir(), 'Library', 'Application Support', 'the-way-here');
  assert.equal(isRevealAllowed(path.join(stateRoot, 'vaults/x/runs'), workspace, userData), process.platform === 'darwin');
  assert.equal(isRevealAllowed('/etc', workspace, userData), false);
  assert.equal(isRevealAllowed(path.join(workspace, '../escape'), workspace, userData), false);
  assert.equal(isRevealAllowed('', workspace, userData), false);
  assert.equal(isRevealAllowed(undefined, workspace, userData), false);
  assert.equal(isRevealAllowed('/anonymous/workspace\0/etc', workspace, userData), false);
});
