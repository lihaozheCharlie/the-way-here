import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForService } from './service-process.mjs';
function worker() { const value=new EventEmitter(); value.stdout=new EventEmitter(); value.killed=false; value.kill=()=>{value.killed=true;}; return value; }
test('startup accepts split loopback handshake and releases listeners', async()=>{
  const child=worker(); const ready=waitForService(child);
  child.stdout.emit('data','log\nTWH_RE'); child.stdout.emit('data','ADY http://127.0.0.1:3456\n');
  assert.equal(await ready,'http://127.0.0.1:3456'); assert.equal(child.stdout.listenerCount('data'),0); assert.equal(child.listenerCount('exit'),0); assert.equal(child.killed,false);
});
test('startup kills timed out service and rejects remote addresses', async()=>{
  const child=worker(); await assert.rejects(waitForService(child,{timeoutMs:10}),/超时/); assert.equal(child.killed,true);
  const remote=worker(); const ready=waitForService(remote); remote.stdout.emit('data','TWH_READY https://example.com\n'); await assert.rejects(ready,/地址无效/); assert.equal(remote.killed,true);
});
test('startup rejects premature exit and unbounded output',async()=>{
  const child=worker(); const ready=waitForService(child); child.emit('exit',1); await assert.rejects(ready,/未能启动/);
  const noisy=worker(); const pending=waitForService(noisy); noisy.stdout.emit('data','x'.repeat(65537)); await assert.rejects(pending,/响应过长/);
});
