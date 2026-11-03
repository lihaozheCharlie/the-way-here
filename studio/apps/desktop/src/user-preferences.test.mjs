import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { UserPreferences } from './user-preferences.mjs';
import { readWindowBounds } from './window-preferences.mjs';

test('explicit preferences survive restarts and new browser origins without default writes', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'twh-preferences-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const preferences = new UserPreferences(root), workspace = '/anonymous/workspace';
  assert.equal(preferences.get(workspace, 'desktop.notifications'), null);
  await assert.rejects(readFile(preferences.file), { code: 'ENOENT' });
  preferences.set(workspace, 'desktop.notifications', 'false');
  preferences.set(workspace, 'photo-capture.folder.demo', '旅行照片');
  preferences.set(workspace, 'the-way-here.agent-panel-width', '480');
  const recordPanels = new Map([
    ['the-way-here.record-folders-open', 'false'],
    ['the-way-here.record-files-open', 'true'],
    ['the-way-here.record-inspector-open', 'true'],
    ['the-way-here.record-outline-open', 'false'],
  ]);
  for (const [key, value] of recordPanels) preferences.set(workspace, key, value);
  const upgraded = new UserPreferences(root);
  for (const [key, value] of recordPanels) assert.equal(upgraded.get(workspace, key), value);
  assert.equal(upgraded.get(workspace, 'desktop.notifications'), 'false');
  assert.equal(upgraded.get('/another/workspace', 'desktop.notifications'), 'false');
  assert.equal(upgraded.get(workspace, 'photo-capture.folder.demo'), '旅行照片');
  assert.equal(upgraded.get(workspace, 'photo-capture.folder.other'), null);
  assert.equal(upgraded.get('/another/workspace', 'photo-capture.folder.demo'), null);
  assert.equal(upgraded.set(workspace, 'desktop.notifications', 'true', 'legacy-import'), 'false');
  assert.equal(new UserPreferences(root).get(workspace, 'the-way-here.agent-panel-width'), '480');
  assert.throws(() => upgraded.set(workspace, 'apiKey', 'secret'));
  const previous = JSON.parse(await readFile(preferences.file + '.previous', 'utf8'));
  assert.equal(previous.version, 1);
  await writeFile(preferences.file, 'broken');
  assert.throws(() => new UserPreferences(root), /无法读取用户偏好/);
  assert.equal(await readFile(preferences.file, 'utf8'), 'broken');
});
test('window dimensions persist and offscreen positions are not restored', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'twh-window-preferences-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const preferences = new UserPreferences(root);
  preferences.set('/anonymous', 'desktop.window.main', JSON.stringify({ x: 100, y: 50, width: 1200, height: 800 }));
  assert.deepEqual(readWindowBounds(new UserPreferences(root), '/anonymous', 'main', [{ x: 0, y: 0, width: 1440, height: 900 }]), { x: 100, y: 50, width: 1200, height: 800 });
  assert.deepEqual(readWindowBounds(preferences, '/anonymous', 'main', [{ x: 2000, y: 0, width: 1000, height: 700 }]), { width: 1000, height: 700 });
});
test('explicit iCloud workspace copying retains scoped choices without replacing destination preferences', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'twh-mobile-preferences-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const preferences = new UserPreferences(root);
  preferences.set('/anonymous-original', 'capture.default-folder.fixture', '原来选择的目录');
  preferences.set('/anonymous-original', 'photo-capture.folder.fixture', '照片目录');
  preferences.set('/anonymous-cloud', 'photo-capture.folder.fixture', '云端既有选择');
  preferences.copyWorkspacePreferences('/anonymous-original', '/anonymous-cloud');
  const reopened = new UserPreferences(root);
  assert.equal(reopened.get('/anonymous-cloud', 'capture.default-folder.fixture'), '原来选择的目录');
  assert.equal(reopened.get('/anonymous-cloud', 'photo-capture.folder.fixture'), '云端既有选择');
  assert.equal(reopened.get('/anonymous-original', 'capture.default-folder.fixture'), '原来选择的目录');
});

test('portable copies rekey only the selected library and preserve authored folders and existing target choices', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-anonymous-portable-preferences-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const preferences=new UserPreferences(root),source='/anonymous/source-workspace',target='/anonymous/personal-portable-copy',portable='6a9e6ca9-035a-4abc-9674-efdf88a2d57b';
  preferences.set(source,'capture.default-folder.personal','personal is an authored folder name');
  preferences.set(source,'photo-capture.folder.personal','');
  preferences.set(source,'the-way-here.folder-tree.personal','{"personal is an authored label":false}');
  preferences.set(source,'capture.default-folder.other','other library must not follow');
  preferences.set(target,'the-way-here.folder-tree.'+portable,'false');
  preferences.copyWorkspacePreferences(source,target,{knowledgeBaseIdMap:{personal:portable}});
  const reopened=new UserPreferences(root);
  assert.equal(reopened.get(target,'capture.default-folder.'+portable),'personal is an authored folder name');
  assert.equal(reopened.get(target,'photo-capture.folder.'+portable),'');
  assert.equal(reopened.get(target,'the-way-here.folder-tree.'+portable),'false');
  assert.equal(reopened.get(target,'capture.default-folder.personal'),null);
  assert.equal(reopened.get(target,'capture.default-folder.other'),null);
  assert.equal(reopened.get(source,'capture.default-folder.personal'),'personal is an authored folder name');
  assert.equal(reopened.get(source,'the-way-here.folder-tree.personal'),'{"personal is an authored label":false}');
  assert.throws(()=>reopened.copyWorkspacePreferences(source,target,{knowledgeBaseIdMap:{personal:'../invalid'}}),/mapping/);
});
