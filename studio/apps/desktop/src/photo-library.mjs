import { spawn } from 'node:child_process';
import { photoQuery } from './photo-query.mjs';

/** A bounded, app-owned native process. No filesystem or executable paths from the renderer. */
export class PhotoLibrary {
  constructor(binary, spawnProcess = spawn) { this.binary = binary; this.spawnProcess = spawnProcess; this.pending = new Map(); this.sequence = 0; }
  request(message) {
    if (this.pending.size >= 48) return Promise.reject(new Error('照片加载较多，请稍后重试'));
    if (!this.child) this.start();
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close('照片读取超时，请重试。云端照片需要网络连接。'), message.command === 'authorize' ? 120_000 : 60_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...message, id }) + '\n');
    });
  }
  start() {
    const child = this.spawnProcess(this.binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
      if (this.child !== child) return;
      buffer += data;
      if (buffer.length > 12_000_000) { this.close('照片响应过大，请重试'); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let value;
        try { value = JSON.parse(line); } catch { this.close('照片服务响应无效，请重试'); return; }
        if (!value || typeof value !== 'object' || typeof value.id !== 'string') { this.close('照片服务响应无效，请重试'); return; }
        const pending = this.pending.get(value.id);
        if (!pending) continue;
        clearTimeout(pending.timer); this.pending.delete(value.id);
        if (value.error) pending.reject(new Error(value.error)); else pending.resolve(value.result);
      }
    });
    child.stdin.on('error', () => { if (this.child === child) this.close('照片服务已停止，请重试'); });
    // Never forward native diagnostics containing private photo metadata to logs.
    child.stderr.resume();
    child.once('error', () => { if (this.child === child) this.close('照片组件未就绪，请重新构建或安装桌面应用'); });
    child.once('exit', () => { if (this.child === child) this.close('照片服务已停止，请重试'); });
  }
  status() { return this.request({ command: 'status' }); }
  filters() { return this.request({ command: 'filters' }); }
  authorize() { return this.request({ command: 'authorize' }); }
  search(input) { return this.request(photoQuery(input)); }
  image(input) {
    if (!input || typeof input.assetId !== 'string' || input.assetId.length > 256 || !['thumbnail', 'preview'].includes(input.size) || typeof input.network !== 'boolean') throw new Error('照片预览条件无效');
    return this.request({ command: 'image', assetId: input.assetId, size: input.size, network: input.network });
  }
  close(message = '照片服务已关闭') {
    const child = this.child; this.child = undefined;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear(); child?.kill();
  }
}
