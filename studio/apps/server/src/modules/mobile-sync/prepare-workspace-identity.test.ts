import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
import { WikiIndex } from "@the-way-here/wiki-core";
import { prepareMobileWorkspace } from "./prepare-workspace.js";
import { MobileFiles } from "./files.js";
import { reconcileMobileSpaceIdentity } from "./space-identity.js";

it("exports a trusted initial name baseline without mutating the original anonymous workspace",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"twh-identity-export-anonymous-"));
  const destination=await mkdtemp(path.join(tmpdir(),"twh-identity-destination-anonymous-"));
  try {
    for(const folder of ["wiki","sources","skills","tools"])await mkdir(path.join(root,folder));
    await writeFile(path.join(root,"AGENTS.md"),"Anonymous export protocol fixture. No private content.\n");
    await writeFile(path.join(root,"the-way-here.config.yaml"),JSON.stringify({version:3,name:"Anonymous initial name",defaultKnowledgeBase:"anonymous",knowledgeBases:{anonymous:{name:"Anonymous initial name",paths:{wiki:"wiki",sources:"sources"}}}}));
    const index=new WikiIndex(root,"anonymous");await index.rebuild();
    const exported=await prepareMobileWorkspace(root,index.config,destination),files=new MobileFiles(exported);
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:(await files.manifest())!.knowledgeBaseId,name:"Anonymous initial name"});
    expect(await new MobileFiles(root).json(".mobile/identity-state.json")).toBeUndefined();
    await reconcileMobileSpaceIdentity(files,"Anonymous Mac renamed",async()=>{throw new Error("Must not overwrite the explicitly renamed Mac");});
    expect((await files.manifest())?.name).toBe("Anonymous Mac renamed");
    expect(await files.json(".mobile/identity-conflict.json")).toBeUndefined();
  } finally {await rm(root,{recursive:true,force:true});await rm(destination,{recursive:true,force:true});}
});
