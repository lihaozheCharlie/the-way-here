import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedWorkspaceArgument, workspaceRelaunchArguments } from './mobile-workspace.mjs';

test('an explicit relaunch argument wins stale launch roots and is preserved across restarts', () => {
  const source='/anonymous/old-root', copy='/anonymous/new-root';
  const args=workspaceRelaunchArguments(['desktop-entry.mjs','--diagnostics','--twh-selected-workspace='+source],copy);
  assert.equal(selectedWorkspaceArgument(args),copy);
  assert.deepEqual(args,['desktop-entry.mjs','--diagnostics','--twh-selected-workspace='+copy]);
  assert.equal(selectedWorkspaceArgument(['desktop-entry.mjs']),undefined);
});

test('invalid selected workspace arguments are rejected', () => {
  assert.throws(()=>selectedWorkspaceArgument(['--twh-selected-workspace=relative']),/invalid/);
  assert.throws(()=>selectedWorkspaceArgument(['--twh-selected-workspace=/a','--twh-selected-workspace=/b']),/invalid/);
  assert.throws(()=>workspaceRelaunchArguments([], 'relative/path'),/absolute/);
});
