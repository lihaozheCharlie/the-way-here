import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { StudioApplication } from "./studio-application.js";

it("supports anonymous knowledge requests without HTTP listen or frontend hosting", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-embedded-"));
  let runtime: StudioApplication | undefined;
  try {
    await mkdir(path.join(root,"sources"));await mkdir(path.join(root,"wiki"));
    await writeFile(path.join(root,"sources","anonymous.md"),"# 匿名记录\n\n虚构测试材料。");
    runtime=await StudioApplication.create({vaultRoot:root});
    await runtime.app.ready();
    expect(runtime.app.server.listening).toBe(false);
    expect((await runtime.app.inject('/api/search?sources=true&q='+encodeURIComponent('虚构测试'))).json()).toHaveLength(1);
    expect((await runtime.app.inject('/')).statusCode).toBe(404);
    expect(runtime.app.server.listening).toBe(false);
  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});}
});
