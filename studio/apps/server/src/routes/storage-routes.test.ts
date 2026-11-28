import Fastify from "fastify";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheRootForVault, stateRootForVault } from "@the-way-here/run-manager";
import { registerStorageRoutes } from "./storage-routes.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.unstubAllEnvs(); });

const configYaml = `version: 3
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
`;

const home = os.homedir();
const expectedDisplay = (target: string) => (target.startsWith(`${home}${path.sep}`) ? `~${target.slice(home.length)}` : target);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-storage-route-"));
  await mkdir(path.join(root, "app/personal/wiki"), { recursive: true });
  await mkdir(path.join(root, "app/personal/sources"), { recursive: true });
  await mkdir(path.join(root, "app/demo/wiki"), { recursive: true });
  await mkdir(path.join(root, "app/demo/sources"), { recursive: true });
  await writeFile(path.join(root, "the-way-here.config.yaml"), configYaml);
  await writeFile(path.join(root, "app/personal/wiki/00 总入口.md"), "# 入口\n".repeat(10));
  await writeFile(path.join(root, "app/demo/sources/note.md"), "记录\n");
  const knowledge = {
    vaultRoot: root,
    index: {
      config: {
        knowledgeBaseId: "personal",
        name: "Personal",
        paths: { wiki: "app/personal/wiki", sources: "app/personal/sources" },
        knowledgeBases: [{ id: "personal", name: "Personal" }, { id: "demo", name: "Demo" }],
      },
    },
  } as never;
  const app = Fastify();
  registerStorageRoutes(app, knowledge);
  cleanup.push(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  return { app, root };
}

describe("storage overview route", () => {
  it("reports only the active knowledge base with its real content size", async () => {
    const { app, root } = await fixture();
    const response = await app.inject({ url: "/api/storage/overview" });
    expect(response.statusCode).toBe(200);
    const overview = response.json();
    expect(overview.version).toBe(1);
    expect(overview).not.toHaveProperty("knowledgeBases");
    expect(overview.knowledgeBase.id).toBe("personal");
    expect(overview.knowledgeBase.name).toBe("Personal");
    expect(overview.knowledgeBase.path).toBe(path.join(root, "app/personal"));
    expect(overview.knowledgeBase.displayPath).toBe(expectedDisplay(path.join(root, "app/personal")));
    // app/personal walks two directories plus one authored Markdown file (10 × "# 入口\n" = 90 bytes).
    expect(overview.knowledgeBase.size).toEqual({ exists: true, fileCount: 3, sizeBytes: 90, approximate: false });
    expect(overview.knowledgeBase.issues).toEqual({ conflictFiles: 0, iCloudPlaceholders: 0 });
    expect(overview.state.path).toBe(stateRootForVault(root));
    expect(overview.state.displayPath).toBe(expectedDisplay(stateRootForVault(root)));
    expect(overview.cache.path).toBe(cacheRootForVault(root));
    expect(overview.cache.size.exists).toBe(false);
  });

  it("reports the desktop cache folder as one place covering capture backups and recordings", async () => {
    const { app, root } = await fixture();
    const cacheHome = await mkdtemp(path.join(os.tmpdir(), "twh-storage-route-cache-"));
    cleanup.push(() => rm(cacheHome, { recursive: true, force: true }));
    const desktopCache = path.join(cacheHome, "cache");
    vi.stubEnv("TWH_APP_CACHE_ROOT", desktopCache);
    const vaultCache = cacheRootForVault(root);
    await mkdir(path.join(desktopCache, "vaults", path.basename(vaultCache)), { recursive: true });
    await mkdir(path.join(desktopCache, "speech-recordings", "session"), { recursive: true });
    await writeFile(path.join(desktopCache, "vaults", path.basename(vaultCache), "input.json"), "1234");
    await writeFile(path.join(desktopCache, "speech-recordings", "session", "recording.caf"), "12345678");
    const overview = (await app.inject({ url: "/api/storage/overview" })).json();
    expect(overview.cache.path).toBe(path.resolve(desktopCache));
    expect(overview.cache.size).toEqual({ exists: true, fileCount: 3, sizeBytes: 12, approximate: false });
    expect(overview.state.path).toBe(stateRootForVault(root));
  });

  it("never follows symlinks while sizing content", async () => {
    const { app, root } = await fixture();
    await symlink("/etc", path.join(root, "app/personal/wiki/link-to-etc"));
    const overview = (await app.inject({ url: "/api/storage/overview" })).json();
    // The authored Markdown file accounts for every byte; /etc is a single non-followed entry.
    expect(overview.knowledgeBase.size).toEqual({ exists: true, fileCount: 4, sizeBytes: 90, approximate: false });
  });
});
