import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { stateRootForVault } from "@the-way-here/run-manager";
import { PredictionStore } from "./prediction-store.js";
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0)){await rm(root,{recursive:true,force:true});await rm(stateRootForVault(root),{recursive:true,force:true});}});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'prediction-store-'));roots.push(root);await writeFile(path.join(root,'the-way-here.config.yaml'),'version: 3\nknowledgeBases:\n  demo:\n    paths: {wiki: vault/demo/wiki, sources: vault/demo/sources}\n  personal:\n    paths: {wiki: vault/personal/wiki, sources: vault/personal/sources}\n');return {root,store:new PredictionStore(root)};}
it('migrates legacy state and evidence without overwriting new results',async()=>{
 const {root,store}=await fixture();const old=path.join(stateRootForVault(root),'predictions',createHash('sha256').update('demo').digest('hex'));
 await mkdir(old,{recursive:true});await writeFile(path.join(old,'state.json'),JSON.stringify({knowledgeBaseId:'demo',status:'ready',thoughts:'匿名演示',config:{root:'/local/private'},pages:[],ref:{sessionId:'local-session'}}));await writeFile(path.join(old,'evidence.json'),'{}');
 expect((await store.load('demo')).thoughts).toBe('匿名演示');
 const shared=JSON.parse(await readFile(path.join(root,'vault/demo/predictions/state.json'),'utf8'));
 for(const key of ['config','ref','pages'])expect(shared).not.toHaveProperty(key);
 expect(await readFile(path.join(root,'vault/demo/predictions/.runtime/evidence.json'),'utf8')).toBe('{}');
 await store.save({...shared,thoughts:'新的想法'});expect((await store.load('demo')).thoughts).toBe('新的想法');expect(await readFile(path.join(old,'state.json'),'utf8')).toContain('匿名演示');expect((await store.load('personal')).status).toBe('idle');
});
it('loads portable results in another checkout without runtime files',async()=>{
 const a=await fixture(),b=await fixture();await a.store.save({knowledgeBaseId:'demo',status:'ready',thoughts:'演示',report:{current:'匿名'},ref:{sessionId:'private'}});
 await mkdir(path.join(b.root,'vault/demo/predictions'),{recursive:true});await cp(path.join(a.root,'vault/demo/predictions/state.json'),path.join(b.root,'vault/demo/predictions/state.json'));
 expect(await b.store.load('demo')).toMatchObject({status:'ready',thoughts:'演示',report:{current:'匿名'}});expect(await b.store.load('demo')).not.toHaveProperty('ref');
});
it('rejects unknown libraries, mismatched ownership and symlink destinations',async()=>{
 const {root,store}=await fixture();await expect(store.load('../personal')).rejects.toThrow();await expect(store.load('unknown')).rejects.toThrow();
 await store.save({knowledgeBaseId:'demo',status:'idle'});await writeFile(path.join(root,'vault/demo/predictions/state.json'),JSON.stringify({knowledgeBaseId:'personal',status:'ready'}));await expect(store.load('demo')).rejects.toThrow('不匹配');
 await mkdir(path.join(root,'vault/personal'),{recursive:true});await symlink(path.join(root,'vault/demo/predictions'),path.join(root,'vault/personal/predictions'));await expect(store.save({knowledgeBaseId:'personal',status:'idle'})).rejects.toThrow('符号链接');
});
it('does not hide corrupt new data behind an older copy',async()=>{const {root,store}=await fixture();await store.save({knowledgeBaseId:'demo',status:'idle'});await writeFile(path.join(root,'vault/demo/predictions/state.json'),'broken');await expect(store.load('demo')).rejects.toThrow();});
it('isolates concurrent readers until a new state is committed',async()=>{
 const {store}=await fixture();await store.save({knowledgeBaseId:'demo',status:'running',report:{current:'before'}});
 const [a,b]=await Promise.all([store.load('demo'),store.load('demo')]);a.status='ready';a.report.current='after';
 expect(b).toMatchObject({status:'running',report:{current:'before'}});expect(await store.load('demo')).toMatchObject({status:'running',report:{current:'before'}});
});
it('keeps bounded retrieval diagnostics private and resets them for a new corpus',async()=>{
 const {root,store}=await fixture();
 await store.save({knowledgeBaseId:'demo',status:'running'});
 await store.recordRetrieval('demo','first',{request:'read frozen source',success:true});
 const file=path.join(root,'vault/demo/predictions/.runtime/retrieval.jsonl');
 expect(await readFile(file,'utf8')).toContain('read frozen source');
 expect(await readFile(path.join(root,'vault/demo/predictions/state.json'),'utf8')).not.toContain('read frozen source');
 await writeFile(file,'x'.repeat(1_600_000));await store.recordRetrieval('demo','first',{request:'over budget'});
 expect((await readFile(file,'utf8')).length).toBe(1_600_000);
 await store.resetRetrievalTrace('demo','second');expect(await readFile(file,'utf8')).not.toContain('first');
});
