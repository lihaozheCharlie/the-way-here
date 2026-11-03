import { createMobileKeychain } from './mobile-keychain.mjs';
export function attachSecretService(worker, safeStorage, sharedKeychain = createMobileKeychain()) {
  worker.on('message', message => {
    if (message?.type !== 'desktop-secret' || typeof message.id !== 'string') return;
    if (typeof message.operation === 'string' && message.operation.startsWith('shared-')) {
      const action = message.operation.slice(7);
      if (!['status','read','write','remove'].includes(action) || action !== 'status' && !['deepseek','zhipu','qwen','kimi','openai'].includes(message.provider) || action !== 'write' && message.text !== undefined || action === 'write' && (typeof message.text !== 'string' || !message.text || Buffer.byteLength(message.text) > 8192)) { try { worker.postMessage({ type: 'desktop-secret-result', id: message.id, error: '共享钥匙串请求无效' }); } catch {} return; }
      void (async () => { const operation = message.operation.slice(7); if (operation === 'status') return sharedKeychain('status'); const capability = await sharedKeychain('status'); if (!capability.available) return { available: false, reason: capability.reason }; return sharedKeychain(operation, message.provider, message.text); })().then(result => { worker.postMessage({ type: 'desktop-secret-result', id: message.id, shared: result }); }).catch(() => { try { worker.postMessage({ type: 'desktop-secret-result', id: message.id, error: '共享钥匙串不可用，本机备份保留' }); } catch {} });
      return;
    }
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Keychain unavailable');
      if (typeof message.text !== 'string' || message.text.length > 256_000) throw new Error('Invalid secret payload');
      let result;
      if (message.operation === 'encrypt') result = safeStorage.encryptString(message.text).toString('base64');
      else if (message.operation === 'decrypt') result = safeStorage.decryptString(Buffer.from(message.text, 'base64'));
      else throw new Error('Invalid secret operation');
      worker.postMessage({ type: 'desktop-secret-result', id: message.id, result });
    } catch {
      try { worker.postMessage({ type: 'desktop-secret-result', id: message.id, error: 'Keychain operation failed' }); } catch { /* Worker has exited. */ }
    }
  });
}
