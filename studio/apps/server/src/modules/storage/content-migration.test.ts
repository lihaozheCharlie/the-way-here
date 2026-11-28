import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadVaultConfig } from "@the-way-here/wiki-core";
import { applyContentMigration, MigrationRequestError, planContentMigration } from "./content-migration.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-content-migration-"));
  await mkdir(path.join(root, "app/personal/wiki"), { recursive: true });
  await mkdir(path.join(root, "app/personal/sources/日记"), { recursive: true });
  await mkdir(path.join(root, "app/demo/wiki"), { recursive: true });
  await mkdir(path.join(root, "app/demo/sources"), { recursive: true });
  await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
name: Anonymous space
defaultKnowledgeBase: personal
knowledgeBases:
  personal:
    name: Personal
    paths:
      wiki: app/personal/wiki
      sources: app/personal/sources
  demo:
    name: Demo
    paths:
      wiki: app/demo/wiki
      sources: app/demo/sources
`);
  await writeFile(path.join(root, "app/personal/sources/日记/2026-01-02.md"), "# 2026-01-02\n\n记录一句\n");
  await writeFile(path.join(root, "app/personal/wiki/00 总入口.md"), "# 入口\n");
  await writeFile(path.join(root, "app/demo/wiki/log.md"), "# demo\n");
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function destinationFixture() {
  return await mkdtemp(path.join(os.tmpdir(), "twh-content-migration-dest-"));
}

describe("content migration", () => {
  it("plans a move for workspace-anchored libraries and keeps the bundled demo local", async () => {
    const root = await fixture();
    const destination = await destinationFixture();
    const plan = await planContentMigration(root, destination);
    expect(plan.destination).toBe(path.resolve(destination));
    expect(plan.entries.map((entry) => entry.knowledgeBaseId)).toEqual(["personal"]);
    expect(plan.entries[0]!.relativePath).toBe("app/personal");
    expect(plan.stays.map((stay) => stay.knowledgeBaseId)).toEqual(["demo"]);
    expect(plan.warnings).toEqual([]);
    await rm(destination, { recursive: true, force: true });
  });

  it("rejects destinations inside the workspace and non-writable roots", async () => {
    const root = await fixture();
    await expect(planContentMigration(root, path.join(root, "inside"))).rejects.toThrow(MigrationRequestError);
    await expect(planContentMigration(root, "relative/path")).rejects.toThrow(MigrationRequestError);
    await expect(planContentMigration(root, "/nonexistent-twh-destination")).rejects.toThrow(MigrationRequestError);
  });

  it("copies content, rewrites config atomically and anchors demo to the workspace", async () => {
    const root = await fixture();
    const destination = await destinationFixture();
    const result = await applyContentMigration(root, destination, async () => false);
    expect(result.moved.map((entry) => entry.knowledgeBaseId)).toEqual(["personal"]);

    const yaml = await readFile(path.join(root, "the-way-here.config.yaml"), "utf8");
    expect(yaml).toContain(`contentRoot: ${path.resolve(destination)}`);
    expect(yaml).toContain("contentRoot: workspace");

    const migratedConfig = await loadVaultConfig(root, "personal");
    expect(migratedConfig.storage?.contentRoot).toBe(path.resolve(destination));
    const personalWiki = path.join(destination, "app/personal/wiki/00 总入口.md");
    await expect(stat(personalWiki)).resolves.toBeTruthy();
    const diary = await loadVaultConfig(root, "personal");
    expect(diary.paths.wiki).toBe("app/personal/wiki");

    // Demo content stays in the workspace and resolves against the workspace root.
    const demoConfig = await loadVaultConfig(root, "demo");
    expect(demoConfig.storage?.contentRoot).toBe(path.resolve(root));
    await expect(stat(path.join(root, "app/demo/wiki/log.md"))).resolves.toBeTruthy();

    // Original directories remain as recovery copies until the user cleans them up.
    await expect(stat(path.join(root, "app/personal/wiki/00 总入口.md"))).resolves.toBeTruthy();

    // The knowledge engine tools resolve the new content root from the config alone.
    await rm(destination, { recursive: true, force: true });
  });

  it("refuses to run while a knowledge base is busy", async () => {
    const root = await fixture();
    const destination = await destinationFixture();
    await expect(applyContentMigration(root, destination, async (id) => id === "personal")).rejects.toThrow("任务进行中");
    await rm(destination, { recursive: true, force: true });
  });

  it("does not modify the config when the copy fails midway", async () => {
    const root = await fixture();
    const destination = await destinationFixture();
    // Pre-occupy the personal destination so errorOnExist aborts before the config flips.
    await mkdir(path.join(destination, "app/personal"), { recursive: true });
    await writeFile(path.join(destination, "app/personal", "occupied"), "x");
    await expect(applyContentMigration(root, destination, async () => false)).rejects.toBeTruthy();
    const yaml = await readFile(path.join(root, "the-way-here.config.yaml"), "utf8");
    expect(yaml).not.toContain("contentRoot");
    const config = await loadVaultConfig(root, "personal");
    expect(config.storage).toBeUndefined();
    await rm(destination, { recursive: true, force: true });
  });
});
