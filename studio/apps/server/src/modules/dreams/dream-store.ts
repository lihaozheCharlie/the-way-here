import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRootForVault } from "@the-way-here/run-manager";
import type { AgentReasoningEffort, DreamCollection, DreamPointDescription, DreamRun, VaultConfig } from "@the-way-here/shared";

export interface StoredDream {
  version: 1;
  run: DreamRun;
  fingerprint: string;
  effort: AgentReasoningEffort;
  config: VaultConfig;
  retrying?: boolean;
}

export interface DreamLibraryState extends DreamCollection {
  descriptions: Record<string, DreamPointDescription>;
  discovered: string[];
  scannedWiki?: string[];
  freshPoints?: string[];
  conversations?: Record<string, DreamPointDescription>;
  deletedRuns?: string[];
}

export const dreamDigest = (data: string) => createHash("sha256").update(data).digest("hex");
export const isDreamRunId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
export const isActiveDream = (run: DreamRun) => run.status === "queued" || run.status === "running";

export class DreamStore {
  private readonly root: string;

  constructor(vaultRoot: string, stateRoot = stateRootForVault(vaultRoot)) {
    this.root = path.join(stateRoot, "dreams");
  }

  private library(knowledgeBaseId: string) {
    return path.join(this.root, dreamDigest(knowledgeBaseId));
  }

  private async checked(target: string, directory: boolean): Promise<boolean> {
    try {
      const stat = await lstat(target);
      if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error("梦境存储路径类型无效");
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private async directory(knowledgeBaseId: string, id: string): Promise<string> {
    if (!isDreamRunId(id)) throw new Error("梦境任务 ID 无效");
    const library = this.library(knowledgeBaseId);
    const dir = path.join(library, id);
    for (const target of [path.dirname(this.root), this.root, library, dir]) await this.checked(target, true);
    return dir;
  }

  async list(knowledgeBaseId: string): Promise<StoredDream[]> {
    const library = this.library(knowledgeBaseId);
    for (const target of [path.dirname(this.root), this.root, library]) {
      if (!await this.checked(target, true)) return [];
    }
    const [entries, collection] = await Promise.all([readdir(library, { withFileTypes: true }), this.collection(knowledgeBaseId)]);
    const deleted = new Set(collection.deletedRuns);
    // One damaged or foreign run directory must not hide the whole library; load() still rejects it by id.
    const states = await Promise.all(entries.filter(entry => entry.isDirectory() && isDreamRunId(entry.name) && !deleted.has(entry.name))
      .map(entry => this.readState(knowledgeBaseId, entry.name).catch(() => undefined)));
    return states.filter((state): state is StoredDream => !!state)
      .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt));
  }

  async load(knowledgeBaseId: string, id: string): Promise<StoredDream | undefined> {
    if ((await this.collection(knowledgeBaseId)).deletedRuns?.includes(id)) return;
    return this.readState(knowledgeBaseId, id);
  }

  private async readState(knowledgeBaseId: string, id: string): Promise<StoredDream | undefined> {
    const state = await this.readJson<StoredDream>(knowledgeBaseId, id, "state.json");
    if (state && (state.version !== 1 || state.run?.id !== id || state.run.knowledgeBaseId !== knowledgeBaseId ||
      state.config?.knowledgeBaseId !== knowledgeBaseId)) throw new Error("梦境任务与知识库或存储版本不匹配");
    return state;
  }

  async save(state: StoredDream) {
    await this.writeJson(state.run.knowledgeBaseId, state.run.id, "state.json", state);
  }

  async readJson<T>(knowledgeBaseId: string, id: string, name: string): Promise<T | undefined> {
    const file = await this.file(knowledgeBaseId, id, name);
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  async writeJson(knowledgeBaseId: string, id: string, name: string, value: unknown) {
    await this.write(knowledgeBaseId, id, name, JSON.stringify(value));
  }

  async file(knowledgeBaseId: string, id: string, name: string) {
    if (!/^[a-z0-9-]+\.(?:json|py)$/.test(name)) throw new Error("梦境产物文件名无效");
    const file = path.join(await this.directory(knowledgeBaseId, id), name);
    await this.checked(file, false);
    return file;
  }

  private async collectionFile(knowledgeBaseId: string) {
    const library = this.library(knowledgeBaseId);
    for (const target of [path.dirname(this.root), this.root, library]) await this.checked(target, true);
    const file = path.join(library, "collection.json");
    return { file, exists: await this.checked(file, false) };
  }

  async collection(knowledgeBaseId: string): Promise<DreamLibraryState> {
    const { file, exists } = await this.collectionFile(knowledgeBaseId);
    return exists ? JSON.parse(await readFile(file, "utf8")) : { descriptions: {}, discovered: [], favorites: [], insights: [] };
  }

  async saveCollection(knowledgeBaseId: string, collection: DreamLibraryState) {
    const { file } = await this.collectionFile(knowledgeBaseId);
    await this.atomic(file, JSON.stringify(collection));
  }

  async write(knowledgeBaseId: string, id: string, name: string, content: string) {
    await this.atomic(await this.file(knowledgeBaseId, id, name), content);
  }

  private async atomic(file: string, content: string) {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async remove(knowledgeBaseId: string, id: string, names: string[]) {
    for (const name of names) await rm(await this.file(knowledgeBaseId, id, name), { force: true });
  }

  async removeRunFiles(knowledgeBaseId: string, id: string) {
    await rm(await this.directory(knowledgeBaseId, id), { recursive: true, force: true });
  }

  async removeLibrary(knowledgeBaseId: string) {
    await rm(this.library(knowledgeBaseId), { recursive: true, force: true });
  }
}
