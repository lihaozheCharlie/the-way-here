/** Resolve one bounded startup handshake, releasing listeners on every outcome. */
export function waitForService(worker, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let buffer = '', settled = false;
    const finish = (error, address) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.stdout?.off('data', onData);
      worker.off('exit', onExit);
      worker.off('error', onError);
      if (error) { worker.kill(); reject(error); }
      else resolve(address);
    };
    const onError = (error) => finish(error);
    const onExit = (code) => finish(new Error(`本地服务未能启动（${code}）`));
    const onData = (data) => {
      buffer += String(data);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      if (buffer.length > 65_536) return finish(new Error('本地服务启动响应过长'));
      for (const line of lines) if (line.startsWith('TWH_READY ')) {
        const address = line.slice(10).trim();
        try {
          const url = new URL(address);
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
          return finish(undefined, url.origin);
        } catch { return finish(new Error('本地服务地址无效')); }
      }
    };
    const timer = setTimeout(() => finish(new Error('本地服务启动超时')), timeoutMs);
    worker.stdout?.on('data', onData);
    worker.once('exit', onExit);
    worker.once('error', onError);
  });
}
