import test from 'node:test';
import assert from 'node:assert/strict';
import {captureMobilePreparationScope,prepareCapturedMobileWorkspace} from './mobile-prepare-scope.mjs';

test('the action captures its original root, client and KB before confirmation and picker delays',async()=>{
  const calls=[];let release;const gate=new Promise(resolve=>{release=resolve;});
  const original={request:async request=>{calls.push({url:request.url,body:request.method==='POST'?await request.json():undefined});if(request.url.endsWith('/api/vault')){await gate;return Response.json({knowledgeBaseId:'library-a',name:'Anonymous A'});}return Response.json({root:'/anonymous/copy'});}};
  const later={request:async()=>{throw new Error('The later client must never be used.');}};
  const live={root:'/anonymous/original-a',client:original,origin:'https://anonymous-a.localhost'};
  const capturing=captureMobilePreparationScope({...live});
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/api/vault'));
  live.root='/anonymous/later-b';live.client=later;live.origin='https://anonymous-b.localhost';release();
  const scope=await capturing;assert.ok(Object.isFrozen(scope));assert.equal(scope.root,'/anonymous/original-a');assert.equal(scope.knowledgeBaseId,'library-a');assert.equal(scope.name,'Anonymous A');
  await Promise.resolve(); // Anonymous confirmation/picker completion after another window switches.
  await prepareCapturedMobileWorkspace(scope,'/anonymous/Spaces');
  assert.deepEqual(calls.map(c=>c.url),['https://anonymous-a.localhost/api/vault','https://anonymous-a.localhost/api/mobile-sync/prepare']);
  assert.deepEqual(calls[1].body,{knowledgeBaseId:'library-a',destination:'/anonymous/Spaces',confirmed:true});
});
test('an unavailable initial scope fails without fetching or adopting a later knowledge base',async()=>{
  let calls=0;const client={request:async()=>{calls++;return new Response('unavailable',{status:503});}};
  await assert.rejects(captureMobilePreparationScope({root:'/anonymous/a',client,origin:'https://anonymous.localhost'}),/could not be read/);
  assert.equal(calls,1);
});
