import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { UserPreferences, preferenceScope } from './user-preferences.mjs';

// mulberry32: a fixed seed replays exactly the same sequence.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (next, items) => items[Math.floor(next() * items.length)];
const windows = ['main', 'reader', 'focus', 'settings', 'capture'];
const prefixes = ['photo-capture.folder.', 'capture.default-folder.', 'the-way-here.folder-tree.', 'the-way-here.source-folder.', 'the-way-here.closed-topics.'];
// Keys preferenceScope accepts: window keys are global, prefixed keys belong to one workspace.
const key = (next) => next() < 0.25
  ? { scope: 'global', key: `desktop.window.${pick(next, windows)}` }
  : { scope: 'workspace', key: pick(next, prefixes) + Array.from({ length: 1 + Math.floor(next() * 2) }, () => pick(next, 'aZ_0-')).join('') };
const text = (next, length) => Array.from({ length }, () => pick(next, '日记 az_-"\\\n')).join('');
const value = (next) => { const kind = next(); return kind < 0.25 ? pick(next, ['', 'false', 'true', '0']) : kind < 0.4 ? text(next, 120 + Math.floor(next() * 240)) : text(next, Math.floor(next() * 40)); };
const workspaces = ['/anonymous/workspace-1', '/anonymous/workspace-2'];
const json = (text, message) => { try { return JSON.parse(text); } catch { return assert.fail(message); } };

test('imports never replace an existing preference and the last user choice always wins', async t => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'twh-preferences-property-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const next = seeded(seed), preferences = new UserPreferences(root);
    // What the rules say each preference holds, independent of how the store lays it out.
    const expected = new Map(), kinds = { user: 0, imported: 0, seeded: 0 };
    const read = (suffix) => readFile(preferences.file + suffix, 'utf8').catch((error) => { if (error.code === 'ENOENT') return undefined; throw error; });
    for (let step = 0; step < 300; step++) {
      const { scope, key: name } = key(next), workspace = pick(next, workspaces), source = next() < 0.35 ? 'legacy-import' : 'user';
      assert.equal(preferenceScope(name), scope, `seed ${seed} step ${step}: generated a key preferenceScope classifies differently`);
      const id = scope === 'global' ? name : `${workspace}:${name}`;
      let choice = value(next);
      while (source === 'user' && choice === expected.get(id)?.value) choice = value(next); // A user choice always changes what is stored.
      const at = `seed ${seed} step ${step}: ${source} of ${name} in ${workspace}`;
      const imported = source === 'legacy-import' && expected.has(id);
      const before = await read('');
      if (!imported) expected.set(id, { workspace, name, value: choice });
      kinds[source === 'user' ? 'user' : imported ? 'imported' : 'seeded']++;
      assert.equal(preferences.set(workspace, name, choice, source), expected.get(id).value, `${at}: value in effect afterwards`);
      assert.equal(preferences.get(workspace, name), expected.get(id).value, `${at}: value read back`);
      const state = json(await read(''), `${at}: preference file is not valid JSON`);
      if (imported) assert.deepEqual(state.values, JSON.parse(before).values, `${at}: an import changed stored preferences`);
      else assert.equal(await read('.previous'), before, `${at}: .previous is not the file as it was before this write`);
    }
    assert.ok(Object.values(kinds).every((count) => count >= 10), `seed ${seed} did not exercise every kind of write: ${JSON.stringify(kinds)}`);
    const reopened = new UserPreferences(root);
    for (const { workspace, name, value: stored } of expected.values()) assert.equal(reopened.get(workspace, name), stored, `seed ${seed}: ${name} in ${workspace} after reopening`);
  }
});
