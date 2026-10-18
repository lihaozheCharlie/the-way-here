import { randomUUID } from 'node:crypto';

/** Private main ↔ utility-process channel. It never opens a network socket. */
export class DesktopRuntime {
  pending = new Map();
  streams = new Set();
  constructor(worker, { timeoutMs = 120_000, startupTimeoutMs = 60_000 } = {}) {
    this.worker = worker;
    this.timeoutMs = timeoutMs;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve; this.rejectReady = reject;
      this.startupTimer = setTimeout(() => { this.close(new Error('本机运行时启动超时')); worker.kill(); }, startupTimeoutMs);
    });
    this.onMessage = message => {
      if (message?.type === 'runtime-ready' && message.protocol === 1) {
        clearTimeout(this.startupTimer); this.resolveReady();
      } else if (message?.type === 'runtime-response') {
        this.pending.get(message.id)?.resolve(message);
      } else if (message?.type === 'runtime-event' && typeof message.event === 'string' && /^[a-zA-Z0-9_-]+$/.test(message.event)) {
        for (const stream of this.streams) stream.send(`event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`);
      }
    };
    this.onExit = () => this.close(new Error('本机运行时已停止'));
    worker.on('message', this.onMessage); worker.once('exit', this.onExit);
    worker.once('error', this.onExit);
  }

  async request(request) {
    await this.ready;
    if (this.closed) throw new Error('本机运行时已停止');
    if (this.pending.size >= 128) throw new Error('本机任务过多，请稍后重试');
    const body = await readRequestBody(request);
    if (this.closed) throw new Error('本机运行时已停止');
    if (request.signal.aborted) throw request.signal.reason;
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        clearTimeout(timer); request.signal.removeEventListener('abort', abort); this.pending.delete(id);
        if (error) reject(error); else {
          const headers = new Headers();
          for (const [key, value] of Object.entries(result.headers || {})) {
            if (!['connection', 'transfer-encoding', 'content-length'].includes(key.toLowerCase()) && value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
          }
          resolve(new Response([204,304].includes(result.status) || request.method === 'HEAD' ? null : result.body, { status: result.status, headers }));
        }
      };
      const abort = () => finish(request.signal.reason || new Error('请求已取消'));
      const timer = setTimeout(() => finish(new Error('本机任务响应超时')), this.timeoutMs);
      this.pending.set(id, { resolve: result => finish(undefined, result), reject: error => finish(error) });
      request.signal.addEventListener('abort', abort, { once: true });
      const url = new URL(request.url);
      try { this.worker.postMessage({ type:'runtime-request', id, method:request.method, url:url.pathname + url.search, headers:Object.fromEntries(request.headers), body }); }
      catch (error) { finish(error); }
    });
  }

  events(signal) {
    const encoder = new TextEncoder();
    let stream;
    const body = new ReadableStream({
      start: controller => {
        let ended = false;
        const stop = () => {
          if (ended) return;
          ended = true; clearInterval(timer); this.streams.delete(stream); signal.removeEventListener('abort', stop);
          try { controller.close(); } catch { /* Consumer already cancelled. */ }
        };
        stream = { stop, send: frame => {
          if (ended) return;
          if (Buffer.byteLength(frame)>1_048_576) return stop();
          if (controller.desiredSize !== null && controller.desiredSize < -64) return stop();
          try { controller.enqueue(encoder.encode(frame)); } catch { stop(); }
        } };
        const timer = setInterval(() => stream.send(': keep-alive\n\n'), 20_000); timer.unref?.();
        this.streams.add(stream); signal.addEventListener('abort', stop, { once:true });
        if (signal.aborted || this.closed) stop(); else stream.send('retry: 2000\n\n');
      },
      cancel: () => stream?.stop(),
    });
    return new Response(body, { headers:{ 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform' } });
  }

  close(error = new Error('本机运行时已停止')) {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.startupTimer); this.rejectReady(error);
    this.worker.off('message', this.onMessage); this.worker.off('exit', this.onExit); this.worker.off('error', this.onExit);
    for (const pending of [...this.pending.values()]) pending.reject(error);
    for (const stream of [...this.streams]) stream.stop();
  }
}

async function readRequestBody(request) {
  if (!request.body || ['GET','HEAD'].includes(request.method)) return undefined;
  const reader = request.body.getReader(); const chunks=[]; let size=0;
  try {
    while (true) {
      const {done,value}=await reader.read(); if (done) break;
      size+=value.byteLength;
      if (size>2*1024*1024) { await reader.cancel(); throw new Error('请求内容过大'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return new Uint8Array(Buffer.concat(chunks));
}
