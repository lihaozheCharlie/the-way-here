import { mkdtemp, realpath, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { registerViewRoutes } from "./view-routes.js";

it("keeps photo person suggestions bound to their requested library after an active-library switch", async () => {
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"twh-photo-people-scope-")));
  let knowledge: KnowledgeRuntime | undefined;
  const app=Fastify();
  try {
    await writeFile(path.join(root,"the-way-here.config.yaml"), `version: 3\ndefaultKnowledgeBase: first\nknowledgeBases:\n  first:\n    name: First\n    paths:\n      wiki: vault/first/wiki\n      sources: vault/first/sources\n  second:\n    name: Second\n    paths:\n      wiki: vault/second/wiki\n      sources: vault/second/sources\n`);
    for(const [id,name] of [["first","匿名甲"],["second","匿名乙"]]) {
      const folder=path.join(root,`vault/${id}/wiki/07 实体/人物`);
      await mkdir(folder,{recursive:true});
      await writeFile(path.join(folder,`${name}.md`),`---\ntype: entity\n---\n# ${name}\n\n匿名人物资料。`);
    }
    knowledge=await KnowledgeRuntime.create(root,"first");
    registerViewRoutes(app,knowledge);
    await knowledge.activate("second");
    const requested=await app.inject("/api/views/relationships?knowledgeBaseId=first");
    expect(requested.statusCode).toBe(200);
    expect(requested.body).toContain("匿名甲");
    expect(requested.body).not.toContain("匿名乙");
    const active=await app.inject("/api/views/relationships");
    expect(active.body).toContain("匿名乙");
    expect((await app.inject("/api/views/relationships?knowledgeBaseId=missing")).statusCode).toBe(400);
  } finally {
    await app.close(); await knowledge?.close(); await rm(root,{recursive:true,force:true});
  }
});
