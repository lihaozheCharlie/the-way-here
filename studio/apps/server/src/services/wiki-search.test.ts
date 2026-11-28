import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WikiIndex } from "@the-way-here/wiki-core";
import { searchWiki } from "./wiki-search.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspaceFixture(): Promise<WikiIndex> {
  const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-wiki-search-"));
  temporaryRoots.push(root);
  await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\n`, "utf8");
  const wiki = path.join(root, "vault/demo/wiki");
  await Promise.all([
    mkdir(path.join(wiki, "notes"), { recursive: true }),
    mkdir(path.join(wiki, "letters"), { recursive: true }),
  ]);
  await writeFile(path.join(wiki, "notes/plan.md"), "# 匿名计划\n\n周三在海边散步之后讨论旅行安排。\n", "utf8");
  await writeFile(path.join(wiki, "letters/2026-01-01.md"), "# 匿名旧信\n\n你在海边散步时提到旅行安排，旧信的正文片段不应外泄。\n", "utf8");
  const index = new WikiIndex(root, "demo");
  await index.rebuild();
  return index;
}

describe("wiki search", () => {
  it("returns both matching pages by default", async () => {
    const hits = searchWiki(await workspaceFixture(), ["海边散步"]);
    expect(hits.map((hit) => hit.path).sort()).toEqual(["vault/demo/wiki/letters/2026-01-01.md", "vault/demo/wiki/notes/plan.md"]);
  });

  it("drops excluded pages entirely, snippets included", async () => {
    const hits = searchWiki(await workspaceFixture(), ["海边散步"], 8, ["wiki/letters"]);
    expect(hits.map((hit) => hit.path)).toEqual(["vault/demo/wiki/notes/plan.md"]);
    expect(JSON.stringify(hits)).not.toContain("旧信的正文片段");
  });

  it("matches the exclude term against the page id or the relative path", async () => {
    const index = await workspaceFixture();
    expect(searchWiki(index, ["海边散步"], 8, ["letters/2026-01-01.md"]).map((hit) => hit.path)).toEqual(["vault/demo/wiki/notes/plan.md"]);
    expect(searchWiki(index, ["海边散步"], 8, ["vault/demo/wiki/letters"]).map((hit) => hit.path)).toEqual(["vault/demo/wiki/notes/plan.md"]);
  });

  it("ignores blank exclude terms", async () => {
    const hits = searchWiki(await workspaceFixture(), ["海边散步"], 8, ["", "   "]);
    expect(hits).toHaveLength(2);
  });
});
