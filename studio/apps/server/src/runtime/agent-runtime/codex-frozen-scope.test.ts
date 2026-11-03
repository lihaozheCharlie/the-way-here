import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer, codexSandboxPolicy } from "@the-way-here/codex-bridge";
import { CodexRuntimeAdapter } from "./codex-runtime-adapter.js";
import { prepareCodexFrozenScope, verifyCodexRestrictedReads, codexFrozenPermissionProfile } from "./codex-frozen-scope.js";
import type { StartAgentExecution } from "./types.js";

const roots: string[]=[];const adapters: CodexRuntimeAdapter[]=[];
afterEach(async()=>{for(const adapter of adapters.splice(0))adapter.close();vi.restoreAllMocks();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"twh-anonymous-codex-scope-")));roots.push(root);
 const file=path.join(root,"evidence.json"),reader=fileURLToPath(new URL("../../../../../../knowledge-engine/skills/common/retrieval/scripts/evidence_reader.py",import.meta.url));
 const inputHash="1".repeat(64);await writeFile(file,JSON.stringify({knowledgeBaseId:"demo",inputHash,pages:[{pageId:"source",markdown:"Anonymous original"}],catalogue:[{pageId:"source",title:"Anonymous source"}]}));
 const input={cwd:root,prompt:"Anonymous frozen question",config:{knowledgeBaseId:"demo",paths:{wiki:"demo/wiki",sources:"demo/sources"}},knowledgeEvidence:{file,reader,knowledgeBaseId:"demo",inputHash},model:"anonymous-model",effort:"low",mode:"read",strictReadOnly:true} as StartAgentExecution;
 return {root,input};
}
function protocol(options:{ignoreAccess?:boolean;missingFeatures?:boolean;mcp?:boolean}={}){
 const calls:Array<{method:string;params:any}>=[];
 vi.spyOn(CodexAppServer.prototype,"request").mockImplementation(async function(this:CodexAppServer,method:string,params:any){
  calls.push({method,params});
  if(method==="config/read"){
   const args=(this as any).options.args as string[];const features=Object.fromEntries(args.filter(value=>value.startsWith("features.")).map(value=>{const [key,value2]=value.split("=");return[key!.slice(9),value2==="true"];}));
   return {config:{features:options.missingFeatures?{}:features,mcp_servers:options.mcp?{foreign:{enabled:true}}:{}}};
  }
  if(method==="permissionProfile/list"){
   const args=(this as any).options.args as string[];const setting=args.find(value=>value.startsWith("default_permissions="))!;
   return {data:[{id:JSON.parse(setting.split("=").slice(1).join("=")),allowed:true}]};
  }
  if(method==="command/exec"){
   const args=(this as any).options.args as string[];
   const rules=args.find(value=>value.startsWith("permissions.")&&value.includes(".filesystem="))!;
   const readableRoots=[...rules.matchAll(/"([^"]+)"="read"/g)].map(match=>match[1]!).filter(root=>root.startsWith("/"));
   const target=params.command[1],allowed=readableRoots.some((root:string)=>target.startsWith(root+path.sep));
   return allowed || options.ignoreAccess ? {exitCode:0,stdout:await readFile(target,"utf8")} : {exitCode:1,stdout:"",stderr:"anonymous denied"};
  }
  if(method==="thread/start")return {thread:{id:"anonymous-frozen-thread"}};
  if(method==="thread/resume")return {};
  if(method==="turn/start")return {turn:{id:"anonymous-turn"}};
  if(method==="turn/interrupt")return {};
  throw new Error("Unexpected anonymous protocol method: "+method);
 } as any);
 return calls;
}
describe("frozen Codex boundary",()=>{
 it("grants only a fresh single-corpus clone and only the evidence dynamic tool",async()=>{
  const f=await fixture(),calls=protocol();const adapter=new CodexRuntimeAdapter("unused");adapters.push(adapter);
  const ref=await adapter.start(f.input);const thread=calls.find(call=>call.method==="thread/start")!.params,turn=calls.find(call=>call.method==="turn/start")!.params;
  expect(([...(adapter as any).frozenServers][0] as any).options.experimentalApi).toBe(true);
  expect(thread.cwd).not.toBe(f.root);expect(path.dirname(thread.cwd)).toBe(f.root);
  expect(await readdir(thread.cwd)).toEqual(["evidence.json","evidence_reader.py"]);
  expect(thread.dynamicTools.map((tool:any)=>tool.name)).toEqual(["read_knowledge_evidence"]);
  expect(turn.cwd).toBe(thread.cwd);expect(turn.permissions).toBe(thread.permissions);expect(turn.permissions).toMatch(/^twh-frozen-[a-f0-9]+$/);expect(turn).not.toHaveProperty("sandboxPolicy");expect(thread).not.toHaveProperty("sandbox");
  expect(turn.approvalPolicy).toBe("never");expect(turn.input).toHaveLength(1);
  await expect(adapter.decide(ref,1,"allow-once")).rejects.toThrow("扩大权限");
  await expect(adapter.start({...f.input,knowledgeEvidence:undefined,sessionId:ref.sessionId})).rejects.toThrow("不能降级");
 });
 it.each([{ignoreAccess:true},{missingFeatures:true},{mcp:true}])("fails closed before a model turn when policy/config cannot be confirmed: %j",async option=>{
  const f=await fixture(),calls=protocol(option);const adapter=new CodexRuntimeAdapter("unused");adapters.push(adapter);
  await expect(adapter.start(f.input)).rejects.toThrow();expect(calls.some(call=>call.method==="turn/start")).toBe(false);
  expect((await readdir(f.root)).filter(name=>name.startsWith(".codex-scope-")||name.startsWith(".outside-access"))).toEqual([]);
 });
 it("rejects foreign identity and unknown resumed context without starting a server",async()=>{
  const f=await fixture(),calls=protocol();const adapter=new CodexRuntimeAdapter("unused");adapters.push(adapter);
  await expect(adapter.start({...f.input,knowledgeEvidence:{...f.input.knowledgeEvidence!,knowledgeBaseId:"other"}})).rejects.toThrow("知识库");
  await expect(adapter.start({...f.input,sessionId:"ordinary-old-thread"})).rejects.toThrow("重新发起");expect(calls).toEqual([]);
 });
 it("resumes only the same bound scope and restores the persisted dynamic catalog",async()=>{
  const f=await fixture(),calls=protocol();const adapter=new CodexRuntimeAdapter("unused");adapters.push(adapter);
  const ref=await adapter.start(f.input);([...(adapter as any).frozenServers][0] as any).emit("notification",{method:"turn/completed",params:{threadId:ref.sessionId,turn:{id:ref.turnId,status:"completed"}}});
  await adapter.start({...f.input,sessionId:ref.sessionId});
  const resume=calls.find(call=>call.method==="thread/resume")!.params;expect(resume).toMatchObject({threadId:ref.sessionId,permissions:expect.stringMatching(/^twh-frozen-/),approvalPolicy:"never"});expect(resume).not.toHaveProperty("sandbox");expect(resume).not.toHaveProperty("dynamicTools");
  await expect(adapter.start({...f.input,sessionId:ref.sessionId,knowledgeEvidence:{...f.input.knowledgeEvidence!,inputHash:"2".repeat(64)}})).rejects.toThrow("冻结资料范围");
 });
 it("constructs restricted OS policies without changing ordinary read-only behavior",()=>{
  expect(codexSandboxPolicy({readOnly:true})).toEqual({type:"readOnly"});
  expect(codexFrozenPermissionProfile("/anonymous").filesystem).toEqual({":root":"deny",":minimal":"read","/anonymous":"read"});
  expect(()=>codexSandboxPolicy({readOnly:false,readOnlyAccess:{type:"restricted",includePlatformDefaults:true,readableRoots:["/anonymous"]}})).toThrow();
  expect(()=>codexSandboxPolicy({readOnly:true,readOnlyAccess:{type:"restricted",includePlatformDefaults:true,readableRoots:["/"]}})).toThrow();
 });
 it("probes only freshly created anonymous canaries and removes them on an unsupported RPC",async()=>{
  const f=await fixture(),scope=await prepareCodexFrozenScope(f.input);
  vi.spyOn(CodexAppServer.prototype,"request").mockRejectedValue(new Error("Unsupported sandbox access"));const server=new CodexAppServer("unused");
  try{await expect(verifyCodexRestrictedReads(server,scope.root,scope.profile.id)).rejects.toThrow("问题已保留");expect(await readdir(scope.root)).toEqual(["evidence.json","evidence_reader.py"]);}finally{await scope.close();server.stop();}
 });
});

it("serializes experimental opt-in and restricted roots through an anonymous fake RPC executable",async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"twh-anonymous-codex-protocol-")));roots.push(root);
 const executable=path.join(root,"fake-codex"),record=path.join(root,"requests.ndjson");
 await writeFile(executable,`#!${process.execPath}\nconst fs=require('node:fs');const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const m=JSON.parse(line);fs.appendFileSync(${JSON.stringify(record)},line+'\\n');if(m.id!==undefined)process.stdout.write(JSON.stringify({id:m.id,result:m.method==='turn/start'?{turn:{id:'anonymous-turn'}}:{}})+'\\n');});\n`,{mode:0o700});
 const bridge=new CodexAppServer(executable,{experimentalApi:true});
 try {
  await bridge.startTurn("anonymous-thread","Anonymous question",root,{readOnly:true,permissionProfile:"twh-frozen-abcdef"});
  const messages=(await readFile(record,"utf8")).trim().split("\n").map(line=>JSON.parse(line));
  expect(messages.find(message=>message.method==="initialize").params.capabilities).toEqual({experimentalApi:true});
  expect(messages.find(message=>message.method==="turn/start").params.permissions).toBe("twh-frozen-abcdef");expect(messages.find(message=>message.method==="turn/start").params).not.toHaveProperty("sandboxPolicy");
 } finally {bridge.stop();await vi.waitFor(()=>expect((bridge as any).process).toBeUndefined());}
});
