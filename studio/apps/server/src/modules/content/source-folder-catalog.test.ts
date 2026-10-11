import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";
import { listSourceFolders, listSourceFolderChildren } from "./source-folder-catalog.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("source folder catalog", () => {
  it("lists nested and empty folders from the active source root while hiding system folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-source-folders-"));
    roots.push(root);
    await Promise.all([
      mkdir(path.join(root, "sources/日记/2026"), { recursive: true }),
      mkdir(path.join(root, "sources/日记/今天.assert"), { recursive: true }),
      mkdir(path.join(root, "sources/读书笔记"), { recursive: true }),
      mkdir(path.join(root, "sources/.system/cache"), { recursive: true }),
    ]);
    const knowledge = {
      vaultRoot: root,
      index: { config: { paths: { sources: "sources" } } },
    } as unknown as KnowledgeRuntime;

    await expect(listSourceFolders(knowledge)).resolves.toEqual([
      { path: "读书笔记" },
      { path: "日记" },
      { path: "日记/2026" },
    ]);
  });

  it("returns an empty list before a source root has been created", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-source-folders-"));
    roots.push(root);
    const knowledge = {
      vaultRoot: root,
      index: { config: { paths: { sources: "sources" } } },
    } as unknown as KnowledgeRuntime;

    await expect(listSourceFolders(knowledge)).resolves.toEqual([]);
  });
  it("reads one level, retains empty directories, reports missing roots, and refuses symlink traversal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-tree-")); roots.push(root);
    await mkdir(path.join(root, "sources/日记/2026/十月"), { recursive: true });
    await mkdir(path.join(root, "sources/空文件夹"));
    await mkdir(path.join(root, "outside")); await symlink(path.join(root, "outside"), path.join(root, "sources/shortcut"));
    const knowledge = { vaultRoot: root, index: { config: { paths: { sources: "sources" }, sourceConnections: [{ id: "missing", name: "旅行", path: path.join(root, "gone") }] } } } as unknown as KnowledgeRuntime;
    const top = await listSourceFolderChildren(knowledge, "");
    expect(top.map(n => n.path)).toEqual(["空文件夹", "日记", "外部来源/missing"]);
    expect(top.at(-1)).toMatchObject({ unavailable: true, hasChildren: false });
    expect((await listSourceFolderChildren(knowledge, "日记")).map(n => n.path)).toEqual(["日记/2026"]);
    expect(await listSourceFolderChildren(knowledge, "空文件夹")).toEqual([]);
    await expect(listSourceFolderChildren(knowledge, "shortcut")).rejects.toMatchObject({ statusCode: 403 });
    await expect(listSourceFolderChildren(knowledge, "../outside")).rejects.toMatchObject({ statusCode: 400 });
  });

});
