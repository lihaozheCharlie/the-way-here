import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assetResponse } from './asset-response.mjs';

test('packaged assets support history navigation and reject escapes, missing assets and writes',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-assets-'));const outside=await mkdtemp(path.join(os.tmpdir(),'twh-outside-'));
  try {
    await writeFile(path.join(root,'index.html'),'anonymous UI');await writeFile(path.join(root,'app.js'),'anonymous JS');
    await mkdir(path.join(root,'assets'));
    await writeFile(path.join(root,'assets/photo-face.worker-sample.js'),'anonymous worker');
    await writeFile(path.join(outside,'private.txt'),'must not read');await symlink(path.join(outside,'private.txt'),path.join(root,'escape.txt'));
    const read=async url=>new Response(url,{headers:{'content-type':'text/html'}});
    const load=(route,method='GET')=>assetResponse(new Request(`https://workspace-test.localhost${route}`,{method}),root,read);
    const page=await load('/timeline');
    assert.match(await page.text(),/index.html$/);
    assert.match(page.headers.get('content-security-policy'),/img-src 'self' data: blob:/);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self';/);
    assert.match(page.headers.get('content-security-policy'),/connect-src 'self';/);
    const script = await load('/app.js');
    assert.match(await script.text(),/app.js$/);
    assert.match(script.headers.get('content-security-policy'),/script-src 'self';/);
    const worker = await load('/assets/photo-face.worker-sample.js');
    assert.match(worker.headers.get('content-security-policy'),/script-src 'self' 'wasm-unsafe-eval';/);
    assert.match(worker.headers.get('content-security-policy'),/connect-src 'self';/);
    assert.equal((await load('/missing.js')).status,404);
    assert.equal((await load('/escape.txt')).status,403);
    assert.equal((await load('/..%2Foutside.txt')).status,403);
    assert.equal((await load('/app.js','POST')).status,405);
    assert.equal(await (await load('/app.js','HEAD')).text(),'');
  } finally {await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
