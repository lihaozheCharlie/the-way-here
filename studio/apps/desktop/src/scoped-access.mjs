import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class ScopedAccess {
  constructor(app, directory, enabled) {
    this.app = app; this.file = path.join(directory, 'scoped-access.json'); this.enabled = enabled;
    this.queue = Promise.resolve(); this.records = []; this.stops = new Map(); this.unavailable = [];
  }
  async restore() {
    if (!this.enabled) return;
    let records;
    try { records = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return; throw new Error('无法恢复文件夹授权，请保留现有资料并重新授权。', { cause: error }); }
    if (!Array.isArray(records) || records.length > 256 || records.some(record => !record || typeof record.path !== 'string' || !path.isAbsolute(record.path) || typeof record.bookmark !== 'string' || !['source','workspace','codex-bin','codex-home'].includes(record.kind))) throw new Error('保存的文件夹授权无效');
    this.records = records;
    for (const record of records) {
      try { this.stops.set(record.path, this.app.startAccessingSecurityScopedResource(record.bookmark)); }
      catch { this.unavailable.push(record.path); }
    }
  }
  grant(selected, bookmark, kind = 'source') {
    const task = this.queue.catch(() => undefined).then(() => this.persistGrant(selected, bookmark, kind));
    this.queue = task; return task;
  }
  async persistGrant(selected, bookmark, kind) {
    if (!this.enabled) return;
    if (!path.isAbsolute(selected) || !bookmark) throw new Error('未取得系统文件夹授权，请重新通过文件选择器打开。');
    const stop = this.app.startAccessingSecurityScopedResource(bookmark);
    const previous = this.records;
    const next = previous.filter(record => record.path !== selected && (kind === 'source' || record.kind !== kind));
    next.push({ path: selected, bookmark, kind });
    if (next.length > 256) { stop(); throw new Error('已保存的授权目录过多，请先清理不再使用的连接。'); }
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', JSON.stringify(next), { mode: 0o600 });
      await rename(this.file + '.tmp', this.file);
    } catch (error) { stop(); throw error; }
    for (const record of previous) if (!next.includes(record)) { this.stops.get(record.path)?.(); this.stops.delete(record.path); }
    this.records = next; this.stops.set(selected, stop);
    this.unavailable = this.unavailable.filter(value => value !== selected);
  }
  location(kind) { return this.records.find(record => record.kind === kind && this.stops.has(record.path))?.path; }
  close() { for (const stop of this.stops.values()) stop(); this.stops.clear(); }
}
