import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
// A commented-out registration must not satisfy the contract.
const withoutComments = (text) => text.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match) => match.startsWith('/') ? match.replace(/[^\n]/g, ' ') : match);
const channel = String.raw`\s*['"\x60](desktop:[^'"\x60]+)['"\x60]`;
const calls = (text, object) => [...text.matchAll(new RegExp(String.raw`\b${object}\.(\w+)\(${channel}`, 'g'))].map(([, method, name]) => [method, name]);

/** Handlers and listeners main.mjs registers. Handlers go through a local `function wrap(name…) { ipcMain.handle(name…` wrapper, so those are followed too. */
function registrations(text) {
  const handled = new Set(), listened = new Set(), unreadable = [];
  const wrappers = [...text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\b[^)]*\)\s*\{\s*ipcMain\.handle\(\s*\2\b/g)];
  const wrapped = new Set(wrappers.map((match) => text.indexOf('ipcMain.handle(', match.index)));
  for (const match of text.matchAll(/\bipcMain\.(\w+)\(/g)) {
    const name = new RegExp(`^${channel}`).exec(text.slice(match.index + match[0].length))?.[1];
    if (name) (['on', 'once'].includes(match[1]) ? listened : handled).add(name);
    else if (!wrapped.has(match.index)) unreadable.push(`main.mjs: ipcMain.${match[1]}() does not name a literal desktop: channel`);
  }
  for (const [, wrapper] of wrappers) for (const [, name] of text.matchAll(new RegExp(String.raw`(?<![\w$.])${wrapper}\(${channel}`, 'g'))) handled.add(name);
  return { handled, listened, unreadable };
}

/** Run the preload against a stand-in Electron and return what it hands to the page. */
function exposedToPage(source) {
  const exposed = {};
  const refuse = (what) => () => { throw new Error(`preload used ${what} while loading`); };
  const electron = {
    contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } },
    ipcRenderer: new Proxy({}, { get: (_, method) => refuse(`ipcRenderer.${String(method)}`) }),
  };
  runInNewContext(source, { require(name) { if (name !== 'electron') throw new Error(`preload required ${name}`); return electron; }, process: { platform: process.platform, argv: [] } }, { filename: 'preload.cjs' });
  return exposed;
}

const modifiers = new Set(['readonly', 'static', 'async', 'get', 'set', 'declare', 'abstract', 'public', 'private', 'protected', 'override']);
/** Names of the top-level members of the `{ … }` block opening at `open`. Strings and nested groups are skipped; a member it cannot read throws. */
function members(text, open) {
  const names = []; let depth = 0, position = true;
  for (let index = open + 1; index < text.length; index++) {
    const character = text[index];
    if ("'\"\x60".includes(character)) {
      let end = index + 1;
      while ((end = text.indexOf(character, end)) > 0 && text[end - 1] === '\\') end++;
      assert.ok(!position && end > text.lastIndexOf('\n', index), `cannot read the string starting at ${JSON.stringify(text.slice(index, index + 30))}`);
      index = end; continue;
    }
    if (depth) { if ('([{'.includes(character)) depth++; else if (')]}'.includes(character)) depth--; continue; }
    if (character === '}') return names;
    if (/\s/.test(character)) { if (character === '\n') position = true; continue; }
    if (',;'.includes(character)) { position = true; continue; }
    if (character === '*') continue;
    const [identifier] = /^[A-Za-z_$][\w$]*/.exec(text.slice(index)) ?? [];
    if (identifier) {
      index += identifier.length - 1;
      // A member is named at the start of a line or after a separator; other identifiers belong to the previous type.
      if (position && /^\??[ \t]*[:<(]/.test(text.slice(index + 1))) names.push(identifier);
      if (!(position && modifiers.has(identifier))) position = false;
      continue;
    }
    assert.ok(!position || !".[{'\"\x60".includes(character), `cannot read the member starting at ${JSON.stringify(text.slice(index, index + 30))}`);
    position = false;
    if ('([{'.includes(character)) depth++;
  }
  return names;
}

// Every module the main process runs; pushes to a window can come from any of them.
const sources = Object.fromEntries(await Promise.all((await readdir(new URL('.', import.meta.url))).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map(async (name) => [name, withoutComments(await read(name))])));
const preload = withoutComments(await read('preload.cjs'));

test('every channel the preload uses has a main-process counterpart', () => {
  const renderer = calls(preload, 'ipcRenderer');
  assert.ok(renderer.length, 'no ipcRenderer call was found in preload.cjs');
  assert.equal(renderer.length, preload.match(/\bipcRenderer\.\w+\(/g).length, 'preload.cjs calls ipcRenderer with something other than a literal desktop: channel');
  const { handled, listened, unreadable } = registrations(sources['main.mjs']);
  const pushed = new Set(Object.values(sources).flatMap((source) => calls(source, String.raw`[\w$]+`)).filter(([method]) => method === 'send').map(([, name]) => name));
  const counterpart = { invoke: handled, send: listened, sendSync: listened, on: pushed, once: pushed };
  const missing = { invoke: 'registers no ipcMain.handle', send: 'registers no ipcMain.on listener', sendSync: 'registers no ipcMain.on listener', on: 'never sends it', once: 'never sends it' };
  assert.deepEqual([...unreadable, ...renderer.filter(([method, name]) => counterpart[method] && !counterpart[method].has(name)).map(([method, name]) => `preload.cjs uses ipcRenderer.${method}('${name}') but the main process ${missing[method]}`)], []);
});

test('bridge.ts and the preload expose the same desktop surface', async () => {
  const exposed = Object.keys(exposedToPage(await read('preload.cjs')).desktop ?? {});
  const text = withoutComments(await read('../../web/src/features/desktop/bridge.ts'));
  const declaration = /\binterface\s+DesktopBridge\s*\{/.exec(text);
  assert.ok(declaration, 'bridge.ts no longer declares interface DesktopBridge');
  const declared = members(text, declaration.index + declaration[0].length - 1);
  assert.ok(exposed.length && declared.length, 'nothing was exposed or declared');
  assert.deepEqual([
    ...declared.filter((name) => !exposed.includes(name)).map((name) => `bridge.ts declares ${name} but preload.cjs does not expose it`),
    ...exposed.filter((name) => !declared.includes(name)).map((name) => `preload.cjs exposes ${name} but bridge.ts does not declare it`),
  ], []);
});
