import { randomUUID } from 'node:crypto';
export class UpdateReadiness {
  pending = new Map();
  constructor({ timeoutMs = 5000 } = {}) { this.timeoutMs = timeoutMs; }
  reply(sender, token, ready) {
    const request = this.pending.get(token);
    if (!request || request.sender !== sender) return false;
    request.resolve(ready === true); return true;
  }
  resume(windows) { for (const win of windows) if (!win.isDestroyed()) win.webContents.send('desktop:update-resume'); }
  async prepare(windows) {
    const snapshot = [...windows];
    if (!snapshot.length || snapshot.some(win => win.isDestroyed() || win.webContents.isLoadingMainFrame())) return false;
    const answers = await Promise.all(snapshot.map(win => new Promise(resolve => {
      const token = randomUUID();
      const finish = ready => { clearTimeout(timer); this.pending.delete(token); resolve(ready); };
      const timer = setTimeout(() => finish(false), this.timeoutMs);
      this.pending.set(token, { sender:win.webContents.id, resolve:finish });
      try { win.webContents.send('desktop:update-prepare', token); } catch { finish(false); }
    })));
    const ready = answers.every(Boolean) && snapshot.length === windows.size && snapshot.every(win => !win.isDestroyed() && !win.webContents.isLoadingMainFrame());
    if (!ready) this.resume(windows);
    return ready;
  }
  dispose() { for (const request of [...this.pending.values()]) request.resolve(false); }
}
