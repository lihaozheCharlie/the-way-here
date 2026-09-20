import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WikiPage } from "@the-way-here/shared";
import type { KnowledgeRuntime } from "../../runtime/knowledge-runtime.js";
import { ImportStore } from "../imports/import-store.js";
import { ContentRequestError, PageWriter } from "./page-writer.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sourcePage(relativePath: string, modifiedAt: string): WikiPage {
  return {
    id: relativePath.replace(/\.md$/, ""),
    relativePath,
    title: path.basename(relativePath, ".md"),
    category: "sources",
    aliases: [],
    tags: [],
    locations: [],
    sources: [],
    excerpt: "",
    modifiedAt,
    isSource: true,
    markdown: "",
    renderedMarkdown: "",
    properties: {},
    sections: [],
    outgoingLinks: [],
    incomingLinks: [],
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-content-delete-"));
  roots.push(root);
  const filePath = path.join(root, "sources/日记/今天.md");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "# 今天\n", "utf8");
  const modifiedAt = (await stat(filePath)).mtime.toISOString();
  const page = sourcePage("sources/日记/今天.md", modifiedAt);
  const rebuild = vi.fn(async () => undefined);
  const broadcast = vi.fn();
  const get = vi.fn((id: string) => id === page.id ? page : undefined);
  const knowledge = {
    vaultRoot: root,
    index: { config: { paths: { wiki: "wiki", sources: "sources" } }, get, list: () => [page], rebuild, lastIndexedAt: "2026-09-02T00:00:00.000Z" },
    events: { broadcast },
  } as unknown as KnowledgeRuntime;
  return { root, filePath, page, knowledge, get, rebuild, broadcast, writer: new PageWriter(knowledge) };
}

describe("PageWriter source files", () => {
  it("creates a life-record file without duplicating its filename as a Markdown heading", async () => {
    const { root, writer } = await fixture();

    await writer.createSource("新记录", "日记");

    await expect(readFile(path.join(root, "sources/日记/新记录.md"), "utf8")).resolves.toBe("");
  });

  it.each(["ready", "deferred", "built"] as const)("preserves %s build tracking after saving and renaming a diary, including reload", async (status) => {
    const { root, page, knowledge, get, broadcast } = await fixture();
    const imports = new ImportStore(knowledge);
    const batch = await imports.trackCreatedSource(page);
    const manifestPath = path.join(root, "sources/.imports", `${batch.id}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    Object.assign(manifest.files[0], { buildStatus: status, buildRunId: "existing-run", builtRefs: [] });
    await writeFile(manifestPath, JSON.stringify(manifest));
    const writer = new PageWriter(knowledge, (before, after) => imports.renameSource(before, after));
    await writer.save(page.id, "今天完成了一份记录。");
    const renamed = sourcePage("sources/日记/写完后的标题.md", page.modifiedAt);
    get.mockImplementation((id: string) => id === page.id ? page : renamed);

    await writer.rename(page.id, "写完后的标题");

    const reloaded = await new ImportStore(knowledge).list();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.id).toBe(batch.id);
    expect(reloaded[0]?.files[0]).toMatchObject({ storedPath: renamed.relativePath, buildStatus: status, buildRunId: "existing-run" });
    await expect(readFile(path.join(root, renamed.relativePath), "utf8")).resolves.toBe("今天完成了一份记录。");
    expect(broadcast).toHaveBeenCalledWith("import", { previousPath: page.relativePath, storedPath: renamed.relativePath });
  });

  it("restores the original filename when build tracking cannot be migrated", async () => {
    const { filePath, page, knowledge, rebuild } = await fixture();
    const writer = new PageWriter(knowledge, async () => { throw new Error("manifest unavailable"); });
    await expect(writer.rename(page.id, "新标题")).rejects.toThrow("manifest unavailable");
    await expect(readFile(filePath, "utf8")).resolves.toBe("# 今天\n");
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("deletes one indexed life-record file with a concurrency check", async () => {
    const { filePath, page, rebuild, broadcast, writer } = await fixture();

    await expect(writer.deleteSource(page.id, page.modifiedAt)).resolves.toEqual({ ok: true, pageId: page.id });
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(rebuild).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith("index", expect.objectContaining({ deletedPath: page.relativePath }));
  });

  it("deletes a selected folder recursively but protects the source root", async () => {
    const { root, writer } = await fixture();
    await writeFile(path.join(root, "sources/日记/补充.txt"), "补充", "utf8");

    await expect(writer.deleteSourceFolder("日记", 2)).rejects.toMatchObject({ statusCode: 409 });
    await expect(writer.deleteSourceFolder("日记", 1)).resolves.toEqual({ ok: true, folder: "日记" });
    await expect(readFile(path.join(root, "sources/日记/补充.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(writer.deleteSourceFolder("")).rejects.toMatchObject({ statusCode: 400 } satisfies Partial<ContentRequestError>);
  });
});
