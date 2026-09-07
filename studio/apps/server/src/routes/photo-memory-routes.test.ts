import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { RunCoordinator } from "../runtime/run-coordinator.js";
import { ImportStore } from "../modules/imports/import-store.js";
import { registerContentRoutes } from "./content-routes.js";
import { registerImportRoutes } from "./import-routes.js";
import { registerPhotoMemoryRoutes } from "./photo-memory-routes.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanups.splice(0)) await fn(); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-photo-http-")));
  const knowledge = await KnowledgeRuntime.create(root, undefined);
  const app = Fastify();
  const hasActiveKnowledgeBaseRun = vi.fn(async () => false);
  const runs = { hasActiveKnowledgeBaseRun, list: vi.fn(async () => []) } as unknown as RunCoordinator;
  const imports = new ImportStore(knowledge);
  registerPhotoMemoryRoutes(app, knowledge, runs);
  registerContentRoutes(app, knowledge, imports, async () => [], hasActiveKnowledgeBaseRun);
  registerImportRoutes(app, imports, runs);
  cleanups.push(async () => { await app.close(); await knowledge.close(); await rm(root, { recursive: true, force: true }); });
  const bytes = await sharp({ create: { width: 10, height: 12, channels: 3, background: "white" } }).png().toBuffer();
  const payload = { knowledgeBaseId: "default", files: [{ name: "测试.png", encoding: "base64", content: bytes.toString("base64") }] };
  return { app, payload, bytes, hasActiveKnowledgeBaseRun, knowledge };
}

describe("photo-memory HTTP boundaries", () => {
  it("requires a bound knowledge base and serves only scoped images with private cache policy", async () => {
    const { app, payload, bytes } = await fixture();
    expect((await app.inject({ method: "POST", url: "/api/imports/photos", payload: { files: payload.files } })).statusCode).toBe(400);
    const created = await app.inject({ method: "POST", url: "/api/imports/photos", payload });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await app.inject(`/api/photo-memories/${id}`)).statusCode).toBe(400);
    const base = `/api/photo-memories/${id}/assets/photo-1`;
    const preview = await app.inject(`${base}/preview?knowledgeBaseId=default`);
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["cache-control"]).toBe("private, no-store");
    expect(preview.headers["content-type"]).toContain("image/jpeg");
    const original = await app.inject(`${base}/original?knowledgeBaseId=default`);
    expect(original.rawPayload).toEqual(bytes);
    expect(original.headers["content-disposition"]).toContain("attachment;");
    expect((await app.inject(`${base}/unpublished-avatar?knowledgeBaseId=default`)).statusCode).toBe(404);
  });

  it("rejects edits during an active run and rejects stale revision numbers", async () => {
    const { app, payload, hasActiveKnowledgeBaseRun } = await fixture();
    const created = await app.inject({ method: "POST", url: "/api/imports/photos", payload });
    const url = `/api/photo-memories/${created.json().id}`;
    hasActiveKnowledgeBaseRun.mockResolvedValueOnce(true);
    const edit = { knowledgeBaseId: "default", revision: 1, story: "用户确认的故事" };
    expect((await app.inject({ method: "PATCH", url, payload: edit })).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url, payload: edit })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url, payload: edit })).statusCode).toBe(409);
  });
});

describe("deleting a photo source removes its pending memory", () => {
  it("drops only the deleted report from imports, including on refresh, and preserves original images", async () => {
    const { app, payload, bytes, knowledge } = await fixture();
    const deleted = (await app.inject({ method: "POST", url: "/api/imports/photos", payload })).json();
    const kept = (await app.inject({ method: "POST", url: "/api/imports/photos", payload })).json();
    expect((await app.inject("/api/imports")).json()).toHaveLength(2);
    const page = knowledge.index.list({ sources: true }).find((page) => page.relativePath === deleted.files[0].storedPath)!;
    expect((await app.inject({ method: "DELETE", url: "/api/sources/file", payload: { pageId: page.id, expectedModifiedAt: page.modifiedAt } })).statusCode).toBe(200);
    for (let refresh = 0; refresh < 2; refresh++) {
      const batches = (await app.inject("/api/imports")).json();
      expect(batches.map((batch: any) => batch.id)).toEqual([kept.id]);
    }
    const original = await app.inject(`/api/photo-memories/${deleted.id}/assets/photo-1/original?knowledgeBaseId=default`);
    expect(original.rawPayload).toEqual(bytes);
  });
  it("removes folder memories without affecting a similarly named sibling folder", async () => {
    const { app, payload } = await fixture();
    for (const targetFolder of ["旅行", "旅行/第二天", "旅行备份"]) await app.inject({ method: "POST", url: "/api/imports/photos", payload: { ...payload, targetFolder } });
    expect((await app.inject({ method: "DELETE", url: "/api/sources/folder", payload: { folder: "旅行", expectedFileCount: 2 } })).statusCode).toBe(200);
    const batches = (await app.inject("/api/imports")).json();
    expect(batches).toHaveLength(1);
    expect(batches[0].targetFolder).toBe("旅行备份");
  });
});
