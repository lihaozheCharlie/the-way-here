import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { registerContentRoutes } from "./content-routes.js";

it("searches full source bodies beyond the command-search cap without returning Wiki pages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-source-search-"));
  const app = Fastify(); let knowledge: KnowledgeRuntime | undefined;
  try {
    await Promise.all([mkdir(path.join(root, "sources")), mkdir(path.join(root, "wiki"))]);
    await Promise.all(Array.from({ length: 35 }, (_, i) => writeFile(path.join(root, "sources", `${i}.md`), `# 匿名记录 ${i}\n\n${"其他文字。".repeat(300)}\n\n只在正文深处的搜索词`)));
    await writeFile(path.join(root, "wiki", "understanding.md"), "# 只在正文深处的搜索词\n\n已有理解");
    knowledge = await KnowledgeRuntime.create(root, undefined);
    registerContentRoutes(app, knowledge, { runtimeCatalog: async () => [], hasActiveKnowledgeBaseRun: async () => false });
    const query = encodeURIComponent("只在正文深处的搜索词");
    const normal = await app.inject(`/api/search?q=${query}`);
    expect(normal.json()).toHaveLength(30);
    const sources = await app.inject(`/api/search?sources=true&q=${query}`);
    expect(sources.statusCode).toBe(200);
    expect(sources.json()).toHaveLength(35);
    expect(sources.json().every((page: { isSource: boolean }) => page.isSource)).toBe(true);
    expect((await app.inject("/api/search?sources=true&q=")).json()).toEqual([]);
  } finally { await app.close(); await knowledge?.close(); await rm(root, { recursive: true, force: true }); }
});
