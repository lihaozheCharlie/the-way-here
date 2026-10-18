import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { StudioApplication } from "./studio-application.js";
import { StudioServer } from "./studio-server.js";
import { stateRootForVault } from "@the-way-here/run-manager";

it.each([
  ["desktop", (vaultRoot: string) => StudioApplication.create({ vaultRoot })],
  ["web", (vaultRoot: string) => StudioServer.create({ vaultRoot, development: true })],
] as const)("registers the shared content APIs for %s without opening a port", async (_host, create) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-embedded-")));
  let runtime: StudioApplication | StudioServer | undefined;
  try {
    await mkdir(path.join(root,"sources"));await mkdir(path.join(root,"wiki"));
    await writeFile(path.join(root,"sources","anonymous.md"),"# 匿名记录\n\n虚构测试材料。");
    runtime=await create(root);
    await runtime.app.ready();
    expect(runtime.app.server.listening).toBe(false);
    expect((await runtime.app.inject('/api/search?sources=true&q='+encodeURIComponent('虚构测试'))).json()).toHaveLength(1);
    for (const url of [
      "/api/health", "/api/vault", "/api/storage/policy", "/api/pages", "/api/sources/folders",
      "/api/capture/history?knowledgeBaseId=default", "/api/build/skills", "/api/lenses",
      "/api/views/today", "/api/views/timeline", "/api/views/life-map", "/api/views/letters",
      "/api/views/relationships", "/api/views/graph", "/api/views/cards/cycles",
    ]) {
      expect((await runtime.app.inject(url)).statusCode, url).toBe(200);
    }
    expect((await runtime.app.inject('/')).statusCode).toBe(404);
    expect(runtime.app.server.listening).toBe(false);
  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});await rm(stateRootForVault(root),{recursive:true,force:true});}
});
