import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DesktopRuntime } from './runtime-process.mjs';

function fixture(options) {
  const worker=new EventEmitter(); worker.messages=[];
  worker.postMessage=value=>worker.messages.push(value); worker.kill=()=>{worker.killed=true;};
  const runtime=new DesktopRuntime(worker,options);
  worker.emit('message',{type:'runtime-ready',protocol:1});
  return {worker,runtime};
}
test('private transport preserves binary bodies, query, mutation context and status without a listener',async()=>{
  const {worker,runtime}=fixture();
  try {
    const pending=runtime.request(new Request('https://workspace-test.localhost/api/example?q=1',{method:'POST',headers:{'x-twh-knowledge-base':'demo','content-type':'application/json'},body:'{"value":1}'}));
    await new Promise(resolve=>setImmediate(resolve));
    const sent=worker.messages[0];
    assert.equal(sent.url,'/api/example?q=1'); assert.equal(sent.headers['x-twh-knowledge-base'],'demo');
    assert.equal(Buffer.from(sent.body).toString(),'{"value":1}');
    worker.emit('message',{type:'runtime-response',id:'another-id',status:200,headers:{},body:new Uint8Array()});
    worker.emit('message',{type:'runtime-response',id:sent.id,status:409,headers:{'content-type':'application/octet-stream'},body:new Uint8Array([0,255,10])});
    const result=await pending;
    assert.equal(result.status,409); assert.deepEqual(new Uint8Array(await result.arrayBuffer()),new Uint8Array([0,255,10]));
    assert.equal(runtime.pending.size,0);
  } finally {runtime.close();}
});
test('events stay live until cancellation, then release their stream',async()=>{
  const {worker,runtime}=fixture();const controller=new AbortController();
  const response=runtime.events(controller.signal);const reader=response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value),/retry: 2000/);
  worker.emit('message',{type:'runtime-event',event:'run',data:{id:'anonymous',status:'completed'}});
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: run\ndata:.*completed/);
  controller.abort();assert.equal((await reader.read()).done,true);assert.equal(runtime.streams.size,0);runtime.close();
});
test('worker exit rejects pending calls and closes streams; startup timeout kills worker',async()=>{
  const {worker,runtime}=fixture();const reader=runtime.events(new AbortController().signal).body.getReader();await reader.read();
  const pending=runtime.request(new Request('https://workspace-test.localhost/api/vault'));
  await new Promise(resolve=>setImmediate(resolve));worker.emit('exit',1);
  await assert.rejects(pending,/已停止/);assert.equal((await reader.read()).done,true);
  assert.equal(worker.listenerCount('message'),0);assert.equal(runtime.pending.size,0);
  const startup=new EventEmitter();startup.kill=()=>{startup.killed=true;};
  const waiting=new DesktopRuntime(startup,{startupTimeoutMs:5});await assert.rejects(waiting.ready,/超时/);assert.equal(startup.killed,true);
});
test('oversized bodies never enter the runtime and aborted calls release correlation state',async()=>{
  const {worker,runtime}=fixture();
  try {
    await assert.rejects(runtime.request(new Request('https://workspace-test.localhost/api/example',{method:'POST',body:'x'.repeat(2*1024*1024+1)})),/过大/);
    assert.equal(worker.messages.length,0);
    const abort=new AbortController();const pending=runtime.request(new Request('https://workspace-test.localhost/api/example',{signal:abort.signal}));
    await new Promise(resolve=>setImmediate(resolve));abort.abort();await assert.rejects(pending);assert.equal(runtime.pending.size,0);
  } finally {runtime.close();}
});
