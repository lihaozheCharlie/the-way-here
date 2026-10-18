import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assetResponse } from './asset-response.mjs';

test('packaged assets support history navigation and reject escapes, missing assets and writes',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-assets-'));const outside=await mkdtemp(path.join(os.tmpdir(),'twh-outside-'));
  try {
    await writeFile(path.join(root,'index.html'),'anonymous UI');await writeFile(path.join(root,'app.js'),'anonymous JS');
    await writeFile(path.join(outside,'private.txt'),'must not read');await symlink(path.join(outside,'private.txt'),path.join(root,'escape.txt'));
    const read=async url=>new Response(url,{headers:{'content-type':'text/html'}});
    const load=(route,method='GET')=>assetResponse(new Request(`https://workspace-test.localhost${route}`,{method}),root,read);
    assert.match(await (await load('/timeline')).text(),/index.html$/);
    assert.match(await (await load('/app.js')).text(),/app.js$/);
    assert.equal((await load('/missing.js')).status,404);
    assert.equal((await load('/escape.txt')).status,403);
    assert.equal((await load('/..%2Foutside.txt')).status,403);
    assert.equal((await load('/app.js','POST')).status,405);
    assert.equal(await (await load('/app.js','HEAD')).text(),'');
  } finally {await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
