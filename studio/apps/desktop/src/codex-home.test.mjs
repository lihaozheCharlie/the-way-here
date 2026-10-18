import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareMasCodexHome} from './codex-home.mjs';

test('MAS Codex imports only ChatGPT login into a private home', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'twh-codex-home-'));
  try {
    const source=path.join(root,'source');await mkdir(source);
    const auth={auth_mode:'chatgpt',tokens:{access_token:'fictional-token',refresh_token:'fictional-refresh',id_token:'fictional-id'},last_refresh:'2026-10-12T00:00:00Z'};
    await writeFile(path.join(source,'auth.json'),JSON.stringify(auth));
    await writeFile(path.join(source,'config.toml'),'model_provider = "untrusted"\n');
    await mkdir(path.join(source,'sessions'));await mkdir(path.join(source,'plugins'));
    const result=await prepareMasCodexHome(path.join(root,'data'),source);
    assert.deepEqual(JSON.parse(await readFile(path.join(result.home,'auth.json'),'utf8')),auth);
    assert.match(await readFile(path.join(result.home,'config.toml'),'utf8'),/model_provider = "openai"/);
    assert.deepEqual((await readdir(result.home)).sort(),['auth.json','config.toml','working']);
    assert.equal((await stat(result.home)).mode & 0o777,0o700);
    assert.equal((await stat(path.join(result.home,'auth.json'))).mode & 0o777,0o600);
    assert.match(await readFile(path.join(source,'config.toml'),'utf8'),/untrusted/);
    await prepareMasCodexHome(path.join(root,'data'));
    assert.deepEqual(JSON.parse(await readFile(path.join(result.home,'auth.json'),'utf8')),auth);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('MAS Codex rejects non-ChatGPT login and malformed JSON without echoing it', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'twh-codex-home-'));
  try {
    const source=path.join(root,'source');await mkdir(source);
    await writeFile(path.join(source,'auth.json'),'{"OPENAI_API_KEY":"fictional-key"}');
    await assert.rejects(prepareMasCodexHome(path.join(root,'data'),source),/ChatGPT/);
    await writeFile(path.join(source,'auth.json'),'fictional-secret-invalid-json');
    await assert.rejects(prepareMasCodexHome(path.join(root,'data'),source),error=>error.message.includes('格式无效')&&!error.message.includes('fictional-secret'));
  } finally {await rm(root,{recursive:true,force:true});}
});
