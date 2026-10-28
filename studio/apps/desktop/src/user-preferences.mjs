import { readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const globalKeys = new Set(['desktop.locale', 'desktop.notifications', 'the-way-here.agent-panel-width', 'the-way-here.record-outline-open', 'the-way-here.outline-pinned', 'the-way-here.import-route', 'the-way-here.import-provider', 'the-way-here.model-onboarding.dismissed', 'the-way-here.model-onboarding.confirmed']);
export function preferenceScope(key) {
  if (globalKeys.has(key) || /^desktop\.window\.(main|reader|focus|settings|capture)$/.test(key)) return 'global';
  if (typeof key === 'string' && /^(?:photo-capture\.folder\.|capture\.default-folder\.|the-way-here\.folder-tree\.)[a-zA-Z0-9_-]{1,100}$/.test(key)) return 'workspace';
  throw new Error('Unknown user preference');
}
// Only explicit user choices and one-time legacy imports enter this file.
// Defaults, drafts, content and credentials are never copied into it.
export class UserPreferences {
  constructor(userData) {
    this.file = path.join(userData, 'user-preferences.json');
    this.state = this.read(); // Corruption must block startup rather than silently seed defaults.
  }
  read() {
    let state;
    try { state = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, values: {} }; throw new Error('无法读取用户偏好设置，请保留现有配置及备份后重试。', { cause: error }); }
    if (state.version !== 1 || !state.values || typeof state.values !== 'object' || Array.isArray(state.values)) throw new Error('用户偏好设置格式无法读取，请保留原文件。');
    if (Object.values(state.values).some(entry => !entry || typeof entry.value !== 'string')) throw new Error('用户偏好设置内容无法读取，请保留原文件。');
    return state;
  }
  address(workspace, key) {
    return `${preferenceScope(key) === 'global' ? 'global' : createHash('sha256').update(path.resolve(workspace)).digest('hex')}:${key}`;
  }
  get(workspace, key) { return this.state.values[this.address(workspace, key)]?.value ?? null; }
  set(workspace, key, value, source = 'user') {
    if (typeof value !== 'string' || value.length > 32768 || !['user', 'legacy-import'].includes(source)) throw new Error('Invalid user preference');
    const address = this.address(workspace, key), state = this.read();
    // Import never overwrites an existing preference, including false/empty values.
    if (source === 'legacy-import' && Object.hasOwn(state.values, address)) return state.values[address].value;
    state.values[address] = { value, updatedAt: new Date().toISOString(), source };
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json) > 1024 * 1024) throw new Error('用户偏好设置存储空间不足');
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, json, { mode: 0o600 });
    try { copyFileSync(this.file, this.file + '.previous'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    renameSync(temporary, this.file);
    this.state = state;
    return value;
  }
}
