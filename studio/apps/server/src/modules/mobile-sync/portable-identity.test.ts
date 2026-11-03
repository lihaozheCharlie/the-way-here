import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import YAML from "yaml";
import { WikiIndex } from "@the-way-here/wiki-core";
import { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";
import { prepareMobileWorkspace, copyCaptureDirectoryPreference } from "./prepare-workspace.js";
import { MobileFiles } from "./files.js";
import { CapturePreferencesStore } from "../content/capture-preferences-store.js";
import { CaptureHistoryStore } from "../content/capture-history-store.js";
vi.mock("chokidar", () => ({default:{watch:()=>{const watcher={on:()=>watcher,close:async()=>undefined};return watcher;}}}));
vi.mock("@the-way-here/run-manager",async importOriginal=>{
  const original=await importOriginal<typeof import("@the-way-here/run-manager")>();
  return {...original,stateRootForVault:(root:string)=>path.join(root,".runtime/anonymous-test-state")};
});
const temporary: string[]=[];
afterEach(async()=>{for(const root of temporary.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture() {
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"twh-anonymous-portable-source-")));temporary.push(root);
  for(const folder of ["vault/personal/wiki","vault/personal/sources","vault/personal/predictions","skills","tools"])await mkdir(path.join(root,folder),{recursive:true});
  const config={version:3,name:"Anonymous portable source",defaultKnowledgeBase:"personal",paths:{skills:"skills",tools:"tools",agentInstructions:"AGENTS.md"},knowledgeBases:{personal:{name:"Anonymous portable source",paths:{wiki:"vault/personal/wiki",sources:"vault/personal/sources"}}},validation:{commands:[]}};
  await writeFile(path.join(root,"the-way-here.config.yaml"),YAML.stringify(config));
  await writeFile(path.join(root,"AGENTS.md"),"Anonymous public fixture instructions.\n");
  await writeFile(path.join(root,"vault/personal/sources/original.md"),"# Anonymous original\n\nThe word personal is original user text. Never rewrite personal.\n");
  await writeFile(path.join(root,"vault/personal/predictions/state.json"),JSON.stringify({knowledgeBaseId:"personal",status:"ready",thoughts:"personal is authored input",report:{current:"personal is authored report content"}}));
  const index=new WikiIndex(root,"personal");await index.rebuild();return{root,config:index.config};
}
it("gives every independently prepared copy a portable UUID and opens that exact library",async()=>{
  const a=await fixture(),b=await fixture(),parent=await mkdtemp(path.join(os.tmpdir(),"twh-anonymous-portable-copies-"));temporary.push(parent);
  await new CapturePreferencesStore(a.root).set("personal","Chosen personal folder");
  const originalConfig=await readFile(path.join(a.root,"the-way-here.config.yaml")),originalText=await readFile(path.join(a.root,"vault/personal/sources/original.md")),originalPrediction=await readFile(path.join(a.root,"vault/personal/predictions/state.json"));
  const ids:string[]=[];
  for(const source of [a,a,b]) {
    const exported=await prepareMobileWorkspace(source.root,source.config,parent),files=new MobileFiles(exported),manifest=(await files.manifest())!;
    expect(manifest.knowledgeBaseId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    ids.push(manifest.knowledgeBaseId);expect(path.basename(exported)).toBe("personal-"+manifest.knowledgeBaseId);
    const config=YAML.parse(await readFile(path.join(exported,"the-way-here.config.yaml"),"utf8"));
    expect(config.defaultKnowledgeBase).toBe(manifest.knowledgeBaseId);expect(Object.keys(config.knowledgeBases)).toEqual([manifest.knowledgeBaseId]);
    expect(config.knowledgeBases[manifest.knowledgeBaseId].paths).toEqual({wiki:"vault/personal/wiki",sources:"vault/personal/sources"});
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:manifest.knowledgeBaseId,name:"Anonymous portable source"});
    expect(await files.json("vault/personal/predictions/state.json")).toEqual({knowledgeBaseId:manifest.knowledgeBaseId,status:"ready",thoughts:"personal is authored input",report:{current:"personal is authored report content"}});
    expect(await readFile(path.join(exported,"vault/personal/sources/original.md"))).toEqual(originalText);
    if(source===a)expect((await new CaptureHistoryStore(exported).list(manifest.knowledgeBaseId)).defaultFolder).toBe("Chosen personal folder");
    else expect(await new CapturePreferencesStore(exported).get(manifest.knowledgeBaseId)).toBeUndefined();
    const knowledge=await KnowledgeRuntime.create(exported,undefined);
    try {expect(knowledge.index.config.knowledgeBaseId).toBe(manifest.knowledgeBaseId);expect((await knowledge.resolve()).config.knowledgeBaseId).toBe(manifest.knowledgeBaseId);await expect(knowledge.resolve("personal")).rejects.toThrow();}finally{await knowledge.close();}
  }
  expect(new Set(ids).size).toBe(3);
  expect(await readFile(path.join(a.root,"the-way-here.config.yaml"))).toEqual(originalConfig);
  expect(await readFile(path.join(a.root,"vault/personal/sources/original.md"))).toEqual(originalText);
  expect(await readFile(path.join(a.root,"vault/personal/predictions/state.json"))).toEqual(originalPrediction);
});
it("never replaces an already selected destination capture directory",async()=>{
  const a=await fixture(),b=await fixture();
  await new CapturePreferencesStore(a.root).set("personal","Original explicit directory");
  await new CapturePreferencesStore(b.root).set("portable-fixture","Destination explicit directory");
  await copyCaptureDirectoryPreference(a.root,"personal",b.root,"portable-fixture");
  expect(await new CapturePreferencesStore(b.root).get("portable-fixture")).toBe("Destination explicit directory");
  expect(await new CapturePreferencesStore(a.root).get("personal")).toBe("Original explicit directory");
  await new CapturePreferencesStore(a.root).set("explicit-empty","");
  await copyCaptureDirectoryPreference(a.root,"explicit-empty",b.root,"portable-empty");
  expect(await new CapturePreferencesStore(b.root).get("portable-empty")).toBe("");
});
it("rejects foreign portable prediction ownership rather than rebinding unrelated data",async()=>{
  const a=await fixture(),parent=await mkdtemp(path.join(os.tmpdir(),"twh-anonymous-portable-reject-"));temporary.push(parent);
  await writeFile(path.join(a.root,"vault/personal/predictions/state.json"),JSON.stringify({knowledgeBaseId:"other",status:"ready"}));
  await expect(prepareMobileWorkspace(a.root,a.config,parent)).rejects.toThrow("预测");
});
it("creates a sibling from an already prepared space including newer phone material but no old queue",async()=>{
  const a=await fixture(),parent=await mkdtemp(path.join(os.tmpdir(),"twh-anonymous-prepared-siblings-"));temporary.push(parent);
  const first=await prepareMobileWorkspace(a.root,a.config,parent),firstFiles=new MobileFiles(first),firstManifest=(await firstFiles.manifest())!;
  const firstConfig=await readFile(path.join(first,"the-way-here.config.yaml"));
  const pending={version:1,id:"anonymous-pending-task",knowledgeBaseId:firstManifest.knowledgeBaseId,text:"Anonymous pending diary remains in the old space."};
  await firstFiles.write(".mobile/queue/anonymous-pending-task.json",pending,true);
  const queueBytes=await readFile(path.join(first,".mobile/queue/anonymous-pending-task.json"));
  const phoneText="# Fictional phone addition\n\nNew phone material with the original word personal.\n";
  await writeFile(path.join(first,"vault/personal/sources/new-phone-material.md"),phoneText);
  await new CapturePreferencesStore(first).set(firstManifest.knowledgeBaseId,"Chosen phone-era directory");
  const knowledge=await KnowledgeRuntime.create(first,undefined);let second:string;
  try{second=await prepareMobileWorkspace(first,knowledge.index.config,parent);}finally{await knowledge.close();}
  const secondFiles=new MobileFiles(second),secondManifest=(await secondFiles.manifest())!;
  expect(secondManifest.knowledgeBaseId).not.toBe(firstManifest.knowledgeBaseId);
  expect(path.dirname(second)).toBe(path.dirname(first));expect(path.basename(second)).toBe(firstManifest.knowledgeBaseId+"-"+secondManifest.knowledgeBaseId);
  expect(await readFile(path.join(second,"vault/personal/sources/new-phone-material.md"),"utf8")).toBe(phoneText);
  expect(await readFile(path.join(first,"the-way-here.config.yaml"))).toEqual(firstConfig);
  expect(await readFile(path.join(first,".mobile/queue/anonymous-pending-task.json"))).toEqual(queueBytes);
  expect(await secondFiles.json(".mobile/queue/anonymous-pending-task.json")).toBeUndefined();
  expect((await new CaptureHistoryStore(second).list(secondManifest.knowledgeBaseId)).defaultFolder).toBe("Chosen phone-era directory");
  expect(await new CapturePreferencesStore(first).get(firstManifest.knowledgeBaseId)).toBe("Chosen phone-era directory");
});
it("still refuses to create a copy inside its source root",async()=>{
  const a=await fixture();
  await expect(prepareMobileWorkspace(a.root,a.config,a.root)).rejects.toThrow("互相包含");
  const nested=path.join(a.root,"nested-target");await mkdir(nested);
  await expect(prepareMobileWorkspace(a.root,a.config,nested)).rejects.toThrow("互相包含");
});
