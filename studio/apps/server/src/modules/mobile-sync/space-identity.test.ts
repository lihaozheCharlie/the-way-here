import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileFiles } from "./files.js";
import { reconcileMobileSpaceIdentity } from "./space-identity.js";
const cleanup: string[]=[];
afterEach(async()=>{for(const root of cleanup.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(phoneName="Anonymous original",base: {knowledgeBaseId:string;name:string}|null={knowledgeBaseId:"anonymous",name:"Anonymous original"}) {
  const root=await mkdtemp(path.join(tmpdir(),"twh-identity-anonymous-"));cleanup.push(root);
  const files=new MobileFiles(root);
  await files.write("mobile-space.json",{version:1,knowledgeBaseId:"anonymous",name:phoneName,sourcesPath:"vault/anonymous/sources",wikiPath:"vault/anonymous/wiki",createdAt:"2026-01-01T00:00:00Z",readOnly:false});
  await writeFile(path.join(root,"the-way-here.config.yaml"),"# Anonymous identity test only\n");
  if(base)await files.write(".mobile/identity-state.json",base);
  return {root,files};
}
describe("anonymous three-way mobile space names",()=>{
  it("applies a phone-only rename through the existing Mac rename callback",async()=>{
    const {files}=await fixture("Anonymous phone name"),rename=vi.fn(async()=>{});
    await reconcileMobileSpaceIdentity(files,"Anonymous original",rename);
    expect(rename).toHaveBeenCalledExactlyOnceWith("Anonymous phone name");
    expect((await files.manifest())?.name).toBe("Anonymous phone name");
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"anonymous",name:"Anonymous phone name"});
    expect(await files.json(".mobile/identity-conflict.json")).toBeUndefined();
  });
  it("copies a Mac-only rename to the phone manifest without invoking another Mac mutation",async()=>{
    const {files}=await fixture(),rename=vi.fn(async()=>{});
    await reconcileMobileSpaceIdentity(files,"Anonymous Mac name",rename);
    expect(rename).not.toHaveBeenCalled();
    expect((await files.manifest())?.name).toBe("Anonymous Mac name");
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"anonymous",name:"Anonymous Mac name"});
  });
  it("preserves both simultaneous renames and the common base until explicitly reconciled",async()=>{
    const {files}=await fixture("Anonymous phone name"),rename=vi.fn(async()=>{});
    await reconcileMobileSpaceIdentity(files,"Anonymous Mac name",rename);
    expect(rename).not.toHaveBeenCalled();expect((await files.manifest())?.name).toBe("Anonymous phone name");
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"anonymous",name:"Anonymous original"});
    expect(await files.json(".mobile/identity-conflict.json")).toMatchObject({knowledgeBaseId:"anonymous",macName:"Anonymous Mac name",phoneName:"Anonymous phone name"});
    await reconcileMobileSpaceIdentity(files,"Anonymous phone name",rename);
    expect(await files.json(".mobile/identity-conflict.json")).toBeUndefined();
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"anonymous",name:"Anonymous phone name"});
  });
  it("does not use another library's identity state as a merge base",async()=>{
    const {files}=await fixture("Anonymous phone name",{knowledgeBaseId:"other-anonymous",name:"Foreign base"}),rename=vi.fn(async()=>{});
    await reconcileMobileSpaceIdentity(files,"Anonymous Mac name",rename);
    expect(rename).not.toHaveBeenCalled();
    expect((await files.manifest())?.name).toBe("Anonymous phone name");
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"other-anonymous",name:"Foreign base"});
    expect(await files.json(".mobile/identity-conflict.json")).toMatchObject({knowledgeBaseId:"anonymous",macName:"Anonymous Mac name",phoneName:"Anonymous phone name"});
  });
  it("preserves both names when no trustworthy baseline exists",async()=>{
    for(const base of [null,{knowledgeBaseId:"anonymous",name:""},{knowledgeBaseId:"anonymous",name:" ".repeat(3)}]) {
      const {files}=await fixture("Anonymous phone name",base),rename=vi.fn(async()=>{});
      await reconcileMobileSpaceIdentity(files,"Anonymous Mac name",rename);
      expect(rename).not.toHaveBeenCalled();expect((await files.manifest())?.name).toBe("Anonymous phone name");
      expect(await files.json(".mobile/identity-state.json")).toEqual(base ?? undefined);
      expect(await files.json(".mobile/identity-conflict.json")).toMatchObject({knowledgeBaseId:"anonymous",macName:"Anonymous Mac name",phoneName:"Anonymous phone name"});
    }
  });
  it("establishes a missing baseline only when both names already agree",async()=>{
    const {files}=await fixture("Anonymous agreed name",null),rename=vi.fn(async()=>{});
    await reconcileMobileSpaceIdentity(files,"Anonymous agreed name",rename);
    expect(rename).not.toHaveBeenCalled();
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"anonymous",name:"Anonymous agreed name"});
    expect(await files.json(".mobile/identity-conflict.json")).toBeUndefined();
  });
  it("does not acknowledge a failed Mac rename or rewrite the phone's requested name",async()=>{
    const {files}=await fixture("Anonymous phone name");
    await expect(reconcileMobileSpaceIdentity(files,"Anonymous original",async()=>{throw new Error("Anonymous simulated rename failure");})).rejects.toThrow("simulated rename failure");
    expect((await files.manifest())?.name).toBe("Anonymous phone name");
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"anonymous",name:"Anonymous original"});
  });
  it("leaves a read-only anonymous demo unchanged",async()=>{
    const {files}=await fixture("Anonymous demo"),manifest=(await files.manifest())!;manifest.readOnly=true;await files.write("mobile-space.json",manifest);
    const rename=vi.fn(async()=>{});await reconcileMobileSpaceIdentity(files,"Other anonymous name",rename);
    expect(rename).not.toHaveBeenCalled();expect((await files.manifest())?.name).toBe("Anonymous demo");
    expect(await files.json(".mobile/identity-state.json")).toEqual({knowledgeBaseId:"anonymous",name:"Anonymous original"});
  });
});
