import { mkdtemp, realpath, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { ImportStore } from "../modules/imports/import-store.js";
import { registerContentRoutes } from "./content-routes.js";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-capture-")));
  const knowledge = await KnowledgeRuntime.create(root, undefined);
  const app = Fastify();
  const imports = new ImportStore(knowledge);
  registerContentRoutes(app, knowledge, imports, async () => [], async () => false);
  cleanup.push(async () => { await app.close(); await knowledge.close(); await rm(root, { recursive:true, force:true }); });
  return { app, knowledge, imports, root };
}
describe("desktop capture", () => {
  it("saves confirmed words atomically and registers them for the existing build flow", async () => {
    const { app, knowledge, root, imports } = await fixture();
    const markdown = "今天有点累，但还不确定原因。\n\n口述原话：\n嗯，今天有点累。";
    const reply = await app.inject({ method:"POST", url:"/api/capture", payload:{ title:"今天", markdown, knowledgeBaseId:knowledge.index.config.knowledgeBaseId } });
    expect(reply.statusCode).toBe(201);
    expect(await readFile(path.join(root,reply.json().relativePath),"utf8")).toBe(markdown);
    expect((await imports.list())[0]?.files[0]?.buildStatus).toBe("ready");
    const duplicate = await app.inject({ method:"POST", url:"/api/capture", payload:{ title:"今天", markdown:"不能覆盖", knowledgeBaseId:knowledge.index.config.knowledgeBaseId } });
    expect(duplicate.statusCode).toBe(409);
    expect(await readFile(path.join(root,reply.json().relativePath),"utf8")).toBe(markdown);
  });
  it("rejects stale windows, missing content, and traversal without writing", async () => {
    const { app, knowledge } = await fixture();
    const payload = {title:"片段",markdown:"原话",knowledgeBaseId:knowledge.index.config.knowledgeBaseId};
    expect((await app.inject({method:"POST",url:"/api/capture",payload:{...payload,knowledgeBaseId:"other"}})).statusCode).toBe(409);
    expect((await app.inject({method:"POST",url:"/api/capture",payload:{...payload,markdown:{text:"bad"}}})).statusCode).toBe(400);
    expect((await app.inject({method:"POST",url:"/api/capture",payload:{...payload,title:"../../outside"}})).statusCode).toBe(400);
  });
});
