import { mkdtemp, realpath, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { ImportStore } from "../modules/imports/import-store.js";
import { stateRootForVault } from "@the-way-here/run-manager";
import { registerContentRoutes } from "./content-routes.js";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-capture-")));
  const knowledge = await KnowledgeRuntime.create(root, undefined);
  const app = Fastify();
  const imports = new ImportStore(knowledge);
  registerContentRoutes(app, knowledge, { runtimeCatalog: async () => [], hasActiveKnowledgeBaseRun: async () => false });
  cleanup.push(async () => { await app.close(); await knowledge.close(); await rm(root, { recursive:true, force:true }); await rm(stateRootForVault(root), { recursive:true, force:true }); });
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

it("keeps capture history library-bound, validates revisions and never resurrects deleted drafts", async () => {
  const { app, knowledge } = await fixture();
  const id = knowledge.index.config.knowledgeBaseId;
  const input = { knowledgeBaseId:id, id:"anonymous-history", revision:0, text:"嗯，今天走了一会儿。", folder:"随手记", diaryDate:"2026-10-17" };
  expect((await app.inject({method:"PUT",url:"/api/capture/draft",payload:{...input,knowledgeBaseId:"other"}})).statusCode).toBe(409);
  expect((await app.inject({method:"PUT",url:"/api/capture/draft",payload:{...input,folder:"../outside"}})).statusCode).toBe(400);
  const saved = await app.inject({method:"PUT",url:"/api/capture/draft",payload:input});
  expect(saved.statusCode).toBe(200); expect(saved.json().revision).toBe(1);
  expect((await app.inject({method:"PUT",url:"/api/capture/draft",payload:input})).statusCode).toBe(409);
  expect((await app.inject({method:"GET",url:"/api/capture/history?knowledgeBaseId=other"})).statusCode).toBe(409);
  const list = await app.inject({method:"GET",url:`/api/capture/history?knowledgeBaseId=${id}`});
  expect(list.json().entries[0].text).toBe(input.text);
  expect((await app.inject({method:"DELETE",url:`/api/capture/history/${input.id}`,payload:{knowledgeBaseId:id,revision:0}})).statusCode).toBe(409);
  expect((await app.inject({method:"DELETE",url:`/api/capture/history/${input.id}`,payload:{knowledgeBaseId:id,revision:1}})).statusCode).toBe(200);
  expect((await app.inject({method:"GET",url:`/api/capture/history?knowledgeBaseId=${id}`})).json().entries).toEqual([]);
  expect((await app.inject({method:"PUT",url:"/api/capture/draft",payload:input})).statusCode).toBe(409);
});

it("saves original words into life records without calling a model", async () => {
  const { app, knowledge, root } = await fixture();
  const id = knowledge.index.config.knowledgeBaseId;
  const draft = { knowledgeBaseId: id, id: "original-note", revision: 0, text: "原话留在这里。", folder: "随手记", diaryDate: "2026-10-24" };
  const saved = await app.inject({ method: "PUT", url: "/api/capture/draft", payload: draft });
  expect(saved.statusCode).toBe(200);
  const reply = await app.inject({ method: "POST", url: "/api/capture/original", payload: { ...draft, revision: saved.json().revision } });
  expect(reply.statusCode).toBe(201);
  const markdown = await readFile(path.join(root, reply.json().relativePath), "utf8");
  expect(markdown).toBe("# 2026-10-24 原文\n\n原话留在这里。\n");
  const history = await app.inject({ method: "GET", url: `/api/capture/history?knowledgeBaseId=${id}` });
  expect(history.json().entries[0]).toMatchObject({ status: "saved", text: draft.text, pageId: reply.json().id });
  expect((await app.inject({ method: "POST", url: "/api/capture/original", payload: { ...draft, revision: saved.json().revision } })).statusCode).toBe(409);
});
