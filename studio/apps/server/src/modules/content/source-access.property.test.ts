import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { loadVaultConfig } from "@the-way-here/wiki-core";
import { ContentRequestError } from "./content-error.js";
import { sourceDestination } from "./source-access.js";

// mulberry32: a fixed seed replays exactly the same sequence.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(next: () => number, items: T[]): T => items[Math.floor(next() * items.length)]!;
const inside = (root: string, candidate: string) => candidate === root || candidate.startsWith(`${root}${path.sep}`);

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

type Place = { workspace: string; content: string; outside: string };

/** A sources directory holding real folders, a file, and links that lead out of it, into it, to a file, and nowhere. */
async function plant(base: string, outside: string): Promise<void> {
  const sources = path.join(base, "sources");
  await mkdir(path.join(sources, "日记/2026"), { recursive: true });
  await writeFile(path.join(sources, "a.md"), "匿名占位", "utf8");
  await symlink(outside, path.join(sources, "link-out"));
  await symlink(path.join(sources, "日记"), path.join(sources, "link-in"));
  await symlink(path.join(sources, "a.md"), path.join(sources, "link-file"));
  await symlink(outside, path.join(sources, "日记", "link-deep"));
  await symlink(path.join(sources, "nowhere"), path.join(sources, "link-dangling"));
}

async function makePlace(): Promise<Place> {
  const workspace = await realpath(await mkdtemp(path.join(os.tmpdir(), "the-way-here-destination-")));
  const content = await realpath(await mkdtemp(path.join(os.tmpdir(), "the-way-here-content-")));
  const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), "the-way-here-outside-")));
  temporaryRoots.push(workspace, content, outside);
  await plant(workspace, outside);
  await plant(content, outside);
  return { workspace, content, outside };
}

/** Where a path really leads once existing links are followed; missing trailing segments are kept. */
async function physical(target: string): Promise<string> {
  const tail: string[] = [];
  let current = path.resolve(target);
  for (;;) {
    try { return path.join(await realpath(current), ...tail); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      tail.unshift(path.basename(current));
      current = path.dirname(current);
    }
  }
}

/** A folder as the client sends it: every shape a user may type, including ones that try to leave the sources directory. */
function folder(next: () => number, { workspace, outside }: Place): [string, string] {
  const name = () => pick(next, ["日记", "新 记录", "中文 目录/a b", "x"]);
  return pick(next, [
    ["traversal", ".."], ["traversal", "../x"], ["traversal", "a/../../b"], ["traversal", "日记/../.."], ["traversal", "./.."], ["traversal", "link-out/../x"],
    ["absolute", "/etc"], ["absolute", "/"], ["absolute", workspace], ["absolute", outside],
    ["symlink", "link-out"], ["symlink", "link-out/子目录"], ["symlink", "link-in"], ["symlink", "link-file"], ["symlink", "日记/link-deep"], ["symlink", "日记/link-deep/文件.md"], ["symlink", "link-dangling"], ["symlink", "link-dangling/x"],
    ["spaces", "日记"], ["spaces", "日记/2026/新 记录"], ["spaces", "我的 文件夹/中文 目录"], ["spaces", "a.md"],
    ["trailing-slash", `${name()}/`], ["trailing-slash", "日记/2026///"], ["trailing-slash", ""],
    ["tilde", "~"], ["tilde", "~/日记"], ["tilde", "日记/~"],
    ["empty", ""], ["empty", " "], ["empty", "\\"],
    ["dot", "."], ["dot", "./日记"], ["dot", "日记/./x"],
    ["plain", "a/b"], ["plain", "日记/2026"],
    ["external", "外部来源"], ["external", "外部来源/x"],
    ["control", "a\0b"], ["control", "日记\n"],
  ]);
}

const shapes = ["absolute", "control", "dot", "empty", "external", "plain", "spaces", "symlink", "tilde", "trailing-slash", "traversal"];

describe("source folder destinations", () => {
  it.each([1, 2, 3])("stay inside the sources directory or are refused, whatever folder is asked for (seed %i)", async (seed) => {
    const next = seeded(seed), place = await makePlace(), seen = new Set<string>();
    for (let step = 0; step < 150; step++) {
      const external = next() < 0.5, [shape, value] = folder(next, place);
      seen.add(shape); seen.add(external ? "content:external" : "content:workspace");
      await writeFile(path.join(place.workspace, "the-way-here.config.yaml"), YAML.stringify({
        version: 3,
        knowledgeBases: { kb: { name: "匿名测试知识库", paths: { wiki: "kb/wiki", sources: "sources" } } },
        ...(external ? { storage: { contentRoot: place.content } } : {}),
      }), "utf8");
      const config = await loadVaultConfig(place.workspace, "kb");
      const root = path.join(external ? place.content : place.workspace, "sources");
      const at = `seed ${seed} step ${step}: folder ${JSON.stringify(value)}, content ${external ? "outside" : "in"} the workspace`;
      const resolved = await sourceDestination(place.workspace, config, value).then((value) => ({ value }), (error: unknown) => ({ error }));
      if ("error" in resolved) {
        expect(resolved.error, at).toBeInstanceOf(ContentRequestError);
        const error = resolved.error as ContentRequestError;
        expect(error.message.trim(), at).not.toBe("");
        expect(error.statusCode, at).toBeGreaterThanOrEqual(400);
        expect(error.statusCode, at).toBeLessThan(500);
        continue;
      }
      expect(resolved.value.root, `${at}: sources directory`).toBe(root);
      expect(inside(root, resolved.value.target), `${at}: target lies outside the sources directory`).toBe(true);
      expect(inside(await realpath(root), await physical(resolved.value.target)), `${at}: target really leads outside the sources directory`).toBe(true);
      expect(resolved.value.connection, at).toBeUndefined();
    }
    expect([...seen].sort()).toEqual([...shapes, "content:external", "content:workspace"].sort());
  });
});
