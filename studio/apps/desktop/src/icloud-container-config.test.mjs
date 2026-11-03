import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const studio = new URL('../../../', import.meta.url);
const containerID = 'iCloud.com.thewayhere.shared';
const expected = {
  NSUbiquitousContainerIsDocumentScopePublic: true,
  NSUbiquitousContainerSupportedFolderLevels: 'Any',
  NSUbiquitousContainerName: 'The Way Here',
};
function plist(relative) {
  return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', fileURLToPath(new URL(relative, studio))], { encoding: 'utf8' }));
}

test('desktop package declares the exact public document container and arbitrary folder depth', async () => {
  const config = YAML.parse(await readFile(new URL('electron-builder.yml', studio), 'utf8'));
  assert.deepEqual(config.mac.extendInfo.NSUbiquitousContainers, { [containerID]: expected });
  // Keep the parent process restrictions when updating the surrounding package config.
  assert.deepEqual(config.electronFuses, {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  });
});

test('desktop public metadata matches the iPhone container without adding signing access', { skip: process.platform !== 'darwin' }, async () => {
  const config = YAML.parse(await readFile(new URL('electron-builder.yml', studio), 'utf8'));
  const mobileInfo = plist('apps/ios/Configuration/App-Info.plist');
  const mobileEntitlements = plist('apps/ios/Configuration/Mobile.entitlements');
  assert.deepEqual(config.mac.extendInfo.NSUbiquitousContainers, mobileInfo.NSUbiquitousContainers);
  assert.deepEqual(mobileEntitlements['com.apple.developer.ubiquity-container-identifiers'], [containerID]);
  assert.equal(mobileEntitlements['com.apple.developer.icloud-container-environment'], 'Production', 'Phone documents must use the same environment as the public Mac Drive; test data is isolated by UUID');
  const desktopEntitlements = plist('apps/desktop/build/entitlements.direct.plist');
  assert.ok(!Object.keys(desktopEntitlements).some(key => /^com\.apple\.developer\.(?:icloud|ubiquity)/.test(key)), 'Public document metadata must not add iCloud signing access to the desktop parent');
});
