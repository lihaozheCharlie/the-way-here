export function attachSecretService(worker, safeStorage) {
  worker.on('message', message => {
    if (message?.type !== 'desktop-secret' || typeof message.id !== 'string') return;
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
