import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { MobileTaskRequest, VaultConfig, WikiRun } from "@the-way-here/shared";
import { validateFrozenSourceReferences } from "@the-way-here/wiki-core";
import { MobileFiles } from "../../modules/mobile-sync/files.js";
import { finalizeMobileLetter } from "./letter-finalization.js";

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-anonymous-letter-")); cleanup.push(root);
  await mkdir(path.join(root, "private-state"));
  const files = new MobileFiles(root), local = new MobileFiles(path.join(root, "private-state"));
  const pages = [{path:"vault/demo/sources/one.md",title:"匿名来源一",markdown:"# 匿名来源一\n\n我决定今晚早点休息。\n\n## 原话\n\n我也还不知道下一步。"}, {path:"vault/demo/sources/two.md",title:"匿名来源二",markdown:"# 匿名来源二\n\n这份材料被选入范围，但未被正文引用。"}];
  const hash = createHash("sha256").update(JSON.stringify(pages)).digest("hex");
  const config = {knowledgeBaseId:"demo",paths:{wiki:"vault/demo/wiki",sources:"vault/demo/sources",tools:"knowledge-engine/tools"},validation:{commands:[]}} as unknown as VaultConfig;
  const task = {id:"letter-1",knowledgeBaseId:"demo",kind:"letter",createdAt:"2026-10-30T00:00:00Z",text:"匿名问题",options:{},sourcePaths:[]} as unknown as MobileTaskRequest;
  const answer = "你好，测试者。你说“我决定今晚早点休息。”，也允许自己暂时不知道。\n\n## 依据\n- [[vault/demo/sources/one|匿名来源一]]";
  const run = {id:"run-1",knowledgeBaseId:"demo",configSnapshot:config,mode:"read",status:"completed",frozenEvidence:{id:task.id,hash},result:{finalAnswer:answer}} as WikiRun;
  const evidence = {knowledgeBaseId:"demo",inputHash:hash,frozenAt:"2026-10-30T00:00:00Z",catalogue:pages.map(p=>({pageId:p.path,title:p.title,category:"sources",isSource:true})),pages:pages.map(p=>({pageId:p.path,category:"sources",markdown:p.markdown}))};
  await local.write(`mobile-scopes/${task.id}/evidence.json`,evidence);
  for (const page of pages) { const destination=await files.resolve(page.path);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,page.markdown); }
  const qualityCheck = vi.fn(async () => {});
  return {files,local,config,task,run,pages,evidence,qualityCheck,perspectiveName:"匿名视角"};
}
async function candidates(f: Awaited<ReturnType<typeof fixture>>) { const names=await readdir(await f.local.resolve(`mobile-letter-candidates/${f.task.id}`));return Promise.all(names.map(name=>f.local.json(`mobile-letter-candidates/${f.task.id}/${name}`) as Promise<any>)); }

describe("mobile letter publication boundary",()=> {
  it("counts only genuinely cited frozen sources and publishes idempotently",async()=>{
    const f=await fixture();const saved=await finalizeMobileLetter(f);const body=await readFile(await f.files.resolve(saved),"utf8");
    expect(body).toContain("reference_count: 1");expect(body).toContain('evidence_frozen_at: "2026-10-30T00:00:00Z"');expect(body).not.toContain("匿名来源二");expect(f.qualityCheck).toHaveBeenCalledTimes(1);
    expect(await finalizeMobileLetter(f)).toBe(saved);expect(await readFile(await f.files.resolve(saved),"utf8")).toBe(body);
    expect((await candidates(f))[0]).toMatchObject({status:"published",citedPaths:[f.pages[0]!.path]});
  });
  it.each(["[[vault/other/sources/one|匿名来源一]]","[[vault/demo/sources/missing|伪造来源]]","[伪造](vault/demo/sources/one.md)","[[vault/demo/sources/one#不存在的段落|匿名来源一]]","[[vault/demo/sources/one|伪造标题]]","未提供来源"]) ("rejects invalid citation %s without publishing",async citation=>{
    const f=await fixture();f.run.result!.finalAnswer="匿名正文\n\n"+citation;
    await expect(finalizeMobileLetter(f)).rejects.toThrow();expect(f.qualityCheck).not.toHaveBeenCalled();expect((await candidates(f))[0].status).toBe("failed");
    await expect(readdir(path.join(f.files.root,"vault/demo/wiki"))).rejects.toThrow();
  });
  it("rejects fabricated quotations even when their source link is valid",async()=>{
    const f=await fixture();f.run.result!.finalAnswer='你说“我已经作出了不在原文里的决定”。\n\n[[vault/demo/sources/one|匿名来源一]]';
    await expect(finalizeMobileLetter(f)).rejects.toThrow("连续原话");
  });
  it.each(["knowledgeBaseId","hash","body","runScope","config"])("rejects changed binding %s",async kind=>{
    const f=await fixture();if(kind==="knowledgeBaseId")f.run.knowledgeBaseId="other";
    if(kind==="hash")f.run.frozenEvidence!.hash="0".repeat(64);
    if(kind==="body"){f.evidence.pages[0]!.markdown+="被篡改";await f.local.write(`mobile-scopes/${f.task.id}/evidence.json`,f.evidence);}
    if(kind==="runScope")f.run.frozenEvidence!.id="other-task";
    if(kind==="config")f.run.configSnapshot={...f.config,knowledgeBaseId:"other"};
    await expect(finalizeMobileLetter(f)).rejects.toThrow();expect(f.qualityCheck).not.toHaveBeenCalled();expect((await candidates(f))[0].status).toBe("failed");
  });
  it("retains a candidate when the shared gate fails and never publishes it",async()=>{
    const f=await fixture();f.qualityCheck.mockRejectedValueOnce(new Error("anonymous quality failure"));
    await expect(finalizeMobileLetter(f)).rejects.toThrow("quality failure");expect((await candidates(f))[0]).toMatchObject({status:"failed",answer:f.run.result!.finalAnswer});
    await expect(readdir(path.join(f.files.root,"vault/demo/wiki"))).rejects.toThrow();
  });
  it("keeps an existing edited result and marks the new candidate failed",async()=>{
    const f=await fixture();const saved=await finalizeMobileLetter(f);await writeFile(await f.files.resolve(saved),"# Anonymous edited letter\n");
    await expect(finalizeMobileLetter(f)).rejects.toThrow("同名回信已经变化");expect(await readFile(await f.files.resolve(saved),"utf8")).toBe("# Anonymous edited letter\n");
    expect((await candidates(f))[0].status).toBe("failed");
  });
  it("rejects a selected cited source deleted while the letter was generated",async()=>{
    const f=await fixture();await rm(await f.files.resolve(f.pages[0]!.path));
    await expect(finalizeMobileLetter(f)).rejects.toThrow("重新选择范围");
    expect((await candidates(f))[0].status).toBe("failed");expect(f.qualityCheck).not.toHaveBeenCalled();
    await expect(readdir(path.join(f.files.root,"vault/demo/wiki"))).rejects.toThrow();
  });
  it("rechecks cited existence after quality validation without rereading its live body",async()=>{
    const f=await fixture();f.qualityCheck.mockImplementationOnce(async()=>{await rm(await f.files.resolve(f.pages[0]!.path));});
    await expect(finalizeMobileLetter(f)).rejects.toThrow("重新选择范围");
  });
  it("allows live edits while preserving the frozen quotation and ignores unreferenced deletion",async()=>{
    const f=await fixture();await writeFile(await f.files.resolve(f.pages[0]!.path),"# Anonymous later revision");await rm(await f.files.resolve(f.pages[1]!.path));
    const saved=await finalizeMobileLetter(f);expect(await readFile(await f.files.resolve(saved),"utf8")).toContain("我决定今晚早点休息。");
  });
  it("runs the actual shared link quality gate only in an anonymous staged workspace",async()=>{
    const f=await fixture();const tools=fileURLToPath(new URL("../../../../../../knowledge-engine/tools/",import.meta.url));
    await cp(tools,path.join(f.files.root,"knowledge-engine/tools"),{recursive:true});
    const saved=await finalizeMobileLetter({...f,qualityCheck:undefined});
    expect(await readFile(await f.files.resolve(saved),"utf8")).toContain("reference_count: 1");
    expect(await readFile(await f.files.resolve(f.pages[0]!.path),"utf8")).toBe(f.pages[0]!.markdown);
  });
});

it("requires block quotations to occur in the actually cited source",()=>{
 const pages=[{path:"sources/one.md",title:"one",markdown:"only first"},{path:"sources/two.md",title:"two",markdown:"uncited quotation"}];
 expect(()=>validateFrozenSourceReferences("> uncited quotation\n[[sources/one|one]]",pages)).toThrow("连续原话");
 expect(validateFrozenSourceReferences("> only first\n[[sources/one|one]]",pages).map(p=>p.path)).toEqual(["sources/one.md"]);
});
