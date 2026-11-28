import os from "node:os";
import path from "node:path";
import { lstat, readdir, stat } from "node:fs/promises";
import { resolveContentPath } from "@the-way-here/wiki-core";
import { cacheRootForVault, stateRootForVault } from "@the-way-here/run-manager";
import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { MigrationRequestError, applyContentMigration, planContentMigration } from "../modules/storage/content-migration.js";

export interface StorageGuards {
  hasAnyActiveRuns: () => Promise<boolean>;
  hasActiveKnowledgeBase: (knowledgeBaseId: string) => Promise<boolean>;
}

const MAX_WALKED_FILES = 200_000;
const SIZE_CACHE_TTL_MS = 120_000;
const sizeCache = new Map<string, { at: number; value: SizeSummary }>();

interface SizeSummary {
  exists: boolean;
  sizeBytes: number;
  fileCount: number;
  /** True when the walk hit the file cap and stopped early. */
  approximate: boolean;
}

/** Inventory only: never follows symlinks, so synced or external folders cannot pull the walk elsewhere. */
async function directorySize(root: string): Promise<SizeSummary> {
  let info;
  try { info = await lstat(root); }
  catch (error: any) { if (error?.code === "ENOENT") return { exists: false, sizeBytes: 0, fileCount: 0, approximate: false }; throw error; }
  if (info.isSymbolicLink()) return { exists: true, sizeBytes: 0, fileCount: 0, approximate: true };
  if (!info.isDirectory()) return { exists: true, sizeBytes: info.size, fileCount: 0, approximate: false };
  let sizeBytes = 0, fileCount = 0, approximate = false;
  const queue = [root];
  while (queue.length) {
    const current = queue.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    // Stats of one directory run together: a large state root (50k+ entries) stays near-instant.
    const sizes: Promise<number>[] = [];
    for (const entry of entries) {
      if (fileCount >= MAX_WALKED_FILES) { approximate = true; return { exists: true, sizeBytes, fileCount, approximate }; }
      const target = path.join(current, entry.name);
      fileCount += 1;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { queue.push(target); continue; }
      sizes.push(stat(target).then((info) => info.size, (error: any) => { if (error?.code !== "ENOENT") throw error; return 0; }));
    }
    sizeBytes += (await Promise.all(sizes)).reduce((total, value) => total + value, 0);
  }
  return { exists: true, sizeBytes, fileCount, approximate };
}

async function cachedSize(root: string): Promise<SizeSummary> {
  const cached = sizeCache.get(root);
  if (cached && Date.now() - cached.at < SIZE_CACHE_TTL_MS) return cached.value;
  const value = await directorySize(root);
  sizeCache.set(root, { at: Date.now(), value });
  return value;
}

export interface ContentIssues { conflictFiles: number; iCloudPlaceholders: number; }
const issuesCache = new Map<string, { at: number; value: ContentIssues }>();

/** Sync artifacts the user should know about: iCloud evicted placeholders and
 * provider conflict copies. Names only; never reads file content. */
async function contentIssues(root: string): Promise<ContentIssues> {
  const cached = issuesCache.get(root);
  if (cached && Date.now() - cached.at < SIZE_CACHE_TTL_MS) return cached.value;
  const issues: ContentIssues = { conflictFiles: 0, iCloudPlaceholders: 0 };
  const queue = [root];
  while (queue.length) {
    const current = queue.pop()!;
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch (error: any) { if (error?.code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name.endsWith(".icloud")) { issues.iCloudPlaceholders += 1; continue; }
      if (entry.isFile() && /(的副本|conflicted copy)/i.test(entry.name)) { issues.conflictFiles += 1; continue; }
      if (entry.isDirectory() && !entry.isSymbolicLink()) queue.push(path.join(current, entry.name));
    }
  }
  issuesCache.set(root, { at: Date.now(), value: issues });
  return issues;
}

/** macOS-style display path: the user's home folder reads as `~`. The full path stays available to clients. */
function displayPath(target: string): string {
  const home = os.homedir();
  return target === home || target.startsWith(`${home}${path.sep}`) ? `~${target.slice(home.length)}` : target;
}

function combineSizes(sizes: SizeSummary[]): SizeSummary {
  return {
    exists: sizes.some((size) => size.exists),
    sizeBytes: sizes.reduce((total, size) => total + size.sizeBytes, 0),
    fileCount: sizes.reduce((total, size) => total + size.fileCount, 0),
    approximate: sizes.some((size) => size.approximate),
  };
}

export function registerStorageRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, guards?: StorageGuards) {
  // Settings show the active knowledge base only; sibling libraries are out of scope here.
  app.get("/api/storage/overview", async () => {
    const workspaceRoot = path.resolve(knowledge.vaultRoot);
    const config = knowledge.index.config;
    const stateRoot = stateRootForVault(workspaceRoot);
    const cacheRoot = cacheRootForVault(workspaceRoot);
    const desktopCache = process.env.TWH_APP_CACHE_ROOT;
    const speechRoot = desktopCache ? path.join(desktopCache, "speech-recordings") : undefined;
    // The desktop cache folder holds both capture backups and in-flight recordings; report it as one place.
    const cacheLocation = desktopCache || cacheRoot;
    const contentRoot = path.dirname(resolveContentPath(workspaceRoot, config, config.paths.wiki));

    const contentSize = await cachedSize(contentRoot);
    const stateSize = await cachedSize(stateRoot);
    const cacheSize = combineSizes([await cachedSize(cacheRoot), ...(speechRoot ? [await cachedSize(speechRoot)] : [])]);
    return {
      version: 1,
      knowledgeBaseId: config.knowledgeBaseId,
      knowledgeBase: {
        id: config.knowledgeBaseId,
        name: config.name,
        path: contentRoot,
        displayPath: displayPath(contentRoot),
        size: contentSize,
        issues: await contentIssues(contentRoot),
      },
      state: { path: stateRoot, displayPath: displayPath(stateRoot), size: stateSize },
      cache: { path: cacheLocation, displayPath: displayPath(cacheLocation), size: cacheSize },
    };
  });

  app.get<{ Querystring: { destination?: string } }>("/api/storage/migration-plan", async (request, reply) => {
    try {
      return await planContentMigration(knowledge.vaultRoot, request.query.destination);
    } catch (error) {
      if (error instanceof MigrationRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  app.post<{ Body: { destination?: unknown; confirmed?: unknown } }>("/api/storage/migrate", async (request, reply) => {
    if (request.body?.confirmed !== true) return reply.code(400).send({ error: "请确认迁移操作后重试" });
    if (await guards?.hasAnyActiveRuns()) return reply.code(409).send({ error: "仍有任务正在进行，请先完成或取消再迁移" });
    try {
      const result = await applyContentMigration(knowledge.vaultRoot, request.body?.destination, async (knowledgeBaseId) => {
        return (await guards?.hasActiveKnowledgeBase(knowledgeBaseId)) ?? false;
      });
      return result;
    } catch (error) {
      if (error instanceof MigrationRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
