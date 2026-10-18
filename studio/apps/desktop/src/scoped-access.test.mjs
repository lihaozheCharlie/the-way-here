import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ScopedAccess } from './scoped-access.mjs';
test('bookmarks survive relaunch and inaccessible resources require new authorization',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'twh-bookmarks-'));let stopped=0;
  const app={startAccessingSecurityScopedResource:bookmark=>{if(bookmark==='denied')throw new Error('denied');return ()=>stopped++;}};
  try {
    const scopes=new ScopedAccess(app,dir,true);
    await Promise.all([scopes.grant('/anonymous/a','a'),scopes.grant('/anonymous/b','b')]);
    assert.equal(JSON.parse(await readFile(scopes.file,'utf8')).length,2);
    await assert.rejects(scopes.grant('/anonymous/c','denied'));
    scopes.close();assert.equal(stopped,2);
    const reopened=new ScopedAccess(app,dir,true);await reopened.restore();assert.equal(reopened.records.length,2);reopened.close();
    const inaccessible=new ScopedAccess({startAccessingSecurityScopedResource(){throw new Error('revoked');}},dir,true);await inaccessible.restore();assert.equal(inaccessible.unavailable.length,2);assert.equal(inaccessible.location('source'),undefined);
  } finally {await rm(dir,{recursive:true,force:true});}
});
