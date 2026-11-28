import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { loadVaultConfig, resolveContentPath } from "./index";

// mulberry32: a fixed seed replays exactly the same sequence.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(next: () => number, items: T[]): T => items[Math.floor(next() * items.length)];
const inside = (root: string, candidate: string) => candidate === root || candidate.startsWith(`${root}${path.sep}`);

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// Content paths resolve against the content root; app resources always stay inside the workspace.
const contentEntries = ["wiki", "sources"] as const;
const workspaceEntries = ["skills", "tools", "agentInstructions"] as const;
const entries = [...contentEntries, ...workspaceEntries];

type Place = { root: string; outside: string; file: string };

async function makePlace(): Promise<Place> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "the-way-here-config-boundary-")));
  const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), "the-way-here-content-boundary-")));
  temporaryRoots.push(root, outside);
  await symlink(outside, path.join(root, "link-out"));
  const file = path.join(outside, "not-a-directory");
  await writeFile(file, "匿名占位", "utf8");
  return { root, outside, file };
}

/** A configured relative path: every shape a user may type, including ones that try to leave the root. */
function configPath(next: () => number, { root, outside }: Place): [string, string] {
  const name = () => pick(next, ["wiki", "我的 知识库", "知识 库/a b", "x"]);
  return pick(next, [
    ["traversal", ".."], ["traversal", "../x"], ["traversal", "a/../../b"], ["traversal", "a/b/../../../c"], ["traversal", `../${path.basename(outside)}`],
    ["absolute", "/etc"], ["absolute", "/"], ["absolute", root], ["absolute", path.join(root, "wiki")],
    ["symlink", "link-out"], ["symlink", "link-out/sub"], ["symlink", "./link-out/"],
    ["spaces", "我的 知识库/wiki"], ["spaces", "知识 库/a b/文件"], ["spaces", "a b/中文 目录"],
    ["trailing-slash", `${name()}/`], ["trailing-slash", `${name()}///`],
    ["tilde", "~"], ["tilde", "~/wiki"], ["tilde", "a/~"],
    ["empty", ""], ["empty", " "], ["empty", "\t"],
    ["dot", "."], ["dot", "./"], ["dot", "./wiki"],
    ["plain", "a/b"], ["plain", "vault/kb/wiki"],
  ]);
}

/** Where content lives: the workspace by default, the literal `workspace`, or a directory of the user's choosing outside it. */
function contentRoot(next: () => number, { root, outside, file }: Place): { kind: string; raw?: string; base?: string } {
  return pick(next, [
    { kind: "unset" },
    { kind: "workspace", raw: "workspace", base: root },
    { kind: "outside", raw: outside, base: outside },
    { kind: "outside-with-slashes", raw: `${outside}/x/..`, base: outside },
    { kind: "home", raw: "~", base: os.homedir() },
    { kind: "inside-workspace", raw: path.join(root, "nested") },
    { kind: "around-workspace", raw: path.dirname(root) },
    { kind: "missing", raw: path.join(outside, "missing") },
    { kind: "file", raw: file },
    { kind: "relative", raw: "relative/content" },
  ]);
}

const pathShapes = ["absolute", "dot", "empty", "plain", "spaces", "symlink", "tilde", "trailing-slash", "traversal"];
const rootShapes = ["unset", "workspace", "outside", "outside-with-slashes", "home", "inside-workspace", "around-workspace", "missing", "file", "relative"];

describe("configured content paths", () => {
  test.each([1, 2, 3])("resolve inside their root or are refused, whatever the config says (seed %i)", async (seed) => {
    const next = seeded(seed), place = await makePlace(), seen = new Set<string>();
    for (let step = 0; step < 150; step++) {
      const entry = pick(next, entries), [shape, value] = configPath(next, place), root = contentRoot(next, place);
      seen.add(shape); seen.add(`root:${root.kind}`);
      const paths: Record<string, string> = { skills: "knowledge-engine/skills", tools: "knowledge-engine/tools", agentInstructions: "AGENTS.md" };
      const library: Record<string, string> = { wiki: "vault/kb/wiki", sources: "vault/kb/sources" };
      (entry in library ? library : paths)[entry] = value;
      await writeFile(path.join(place.root, "the-way-here.config.yaml"), YAML.stringify({
        version: 3,
        knowledgeBases: { kb: { name: "匿名测试知识库", paths: library } },
        paths,
        ...(root.raw ? { storage: { contentRoot: root.raw } } : {}),
      }), "utf8");
      const at = `seed ${seed} step ${step}: ${entry}=${JSON.stringify(value)}, content root ${root.kind}`;
      const loaded = await loadVaultConfig(place.root, "kb").then((config) => ({ config }), (error: unknown) => ({ error }));
      if ("error" in loaded) {
        expect(loaded.error, at).toBeInstanceOf(Error);
        expect((loaded.error as Error).message.trim(), at).not.toBe("");
        continue;
      }
      const { config } = loaded, base = root.base ?? place.root;
      expect(config.storage?.contentRoot, `${at}: accepted content root`).toBe(root.base);
      if (config.storage?.contentRoot && config.storage.contentRoot !== place.root) {
        expect(inside(config.storage.contentRoot, place.root) || inside(place.root, config.storage.contentRoot), `${at}: the content root overlaps the workspace`).toBe(false);
      }
      for (const name of contentEntries) expect(inside(base, resolveContentPath(place.root, config, config.paths[name])), `${at}: ${name} resolves outside ${base}`).toBe(true);
      for (const name of workspaceEntries) expect(inside(place.root, path.resolve(place.root, config.paths[name])), `${at}: ${name} resolves outside the workspace`).toBe(true);
    }
    expect([...seen].sort()).toEqual([...pathShapes, ...rootShapes.map((shape) => `root:${shape}`)].sort());
  });
});
