import Fastify from "fastify";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, access } from "node:fs/promises";
import os from "node:os";import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import YAML from "yaml";
import { WikiIndex } from "@the-way-here/wiki-core";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { RunCoordinator } from "../runtime/run-coordinator.js";
import type { MobileSyncWorker } from "../runtime/mobile-sync/worker.js";
import { CompanionshipStore } from "../runtime/companionship-store.js";
import { registerMobileSyncRoutes } from "./mobile-sync-routes.js";
vi.mock("@the-way-here/run-manager",async importOriginal=>{const original=await importOriginal<typeof import("@the-way-here/run-manager")>();return {...original,stateRootForVault:(root:string)=>path.join(root,".runtime/anonymous-binding-test")};});
const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
function barrier(){let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});return{wait,release};}
it.each(["run-check","companionship"] as const)("keeps the original selected config while %s awaits and another window switches to B",async stage=>{
  const base=await mkdtemp(path.join(os.tmpdir(),"twh-anonymous-copy-binding-"));roots.push(base);const root=path.join(base,"workspace"),destination=path.join(base,"Spaces");await mkdir(destination);
  for(const dir of ["a/wiki","a/sources","b/wiki","b/sources","skills","tools"])await mkdir(path.join(root,dir),{recursive:true});
  await writeFile(path.join(root,"AGENTS.md"),"Anonymous binding fixture instructions.");
  const config=YAML.stringify({version:3,defaultKnowledgeBase:"a",paths:{skills:"skills",tools:"tools",agentInstructions:"AGENTS.md"},knowledgeBases:{a:{name:"Anonymous A",paths:{wiki:"a/wiki",sources:"a/sources"}},b:{name:"Anonymous B",paths:{wiki:"b/wiki",sources:"b/sources"}}},validation:{commands:[]}});
  await writeFile(path.join(root,"the-way-here.config.yaml"),config);
  const aText="# Anonymous A\n\nOnly selected A original.",bText="# Anonymous B\n\nB must never be copied by this request.";
  await writeFile(path.join(root,"a/sources/original.md"),aText);await writeFile(path.join(root,"b/sources/original.md"),bText);
  const a=new WikiIndex(root,"a"),b=new WikiIndex(root,"b");await a.rebuild();await b.rebuild();let active=a;
  const entered=barrier(),resume=barrier(),seen:string[]=[];
  vi.spyOn(CompanionshipStore.prototype,"startedAt").mockImplementation(async id=>{seen.push(id);if(stage==="companionship"){entered.release();await resume.wait;}return "2026-01-01T00:00:00Z";});
  const knowledge={vaultRoot:root,get index(){return active;}} as unknown as KnowledgeRuntime;
  const runs={hasAnyActiveRuns:async()=>{if(stage==="run-check"){entered.release();await resume.wait;}return false;}} as unknown as RunCoordinator;
  const app=Fastify();registerMobileSyncRoutes(app,knowledge,runs,{enable:async()=>undefined} as unknown as MobileSyncWorker);
  try {
    const pending=app.inject({method:"POST",url:"/api/mobile-sync/prepare",payload:{knowledgeBaseId:"a",destination,confirmed:true}});
    await entered.wait;active=b;resume.release();const response=await pending;
    expect(response.statusCode).toBe(200);const result=response.json();expect(result.sourceKnowledgeBaseId).toBe("a");expect(result.knowledgeBaseId).not.toBe("a");expect(result.knowledgeBaseId).not.toBe("b");expect(seen).toEqual(["a"]);
    expect(await readFile(path.join(result.root,"a/sources/original.md"),"utf8")).toBe(aText);await expect(access(path.join(result.root,"b"))).rejects.toMatchObject({code:"ENOENT"});expect(await readdir(destination)).toHaveLength(1);
    expect(await readFile(path.join(root,"b/sources/original.md"),"utf8")).toBe(bText);expect(await readFile(path.join(root,"the-way-here.config.yaml"),"utf8")).toBe(config);
  } finally {resume.release();await app.close();}
});
