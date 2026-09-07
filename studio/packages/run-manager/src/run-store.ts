import { isTerminalRunStatus } from "@the-way-here/shared";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApprovalRequest, RunEvent, RunFileChange, RunStatus, VaultConfig, WikiRun } from "@the-way-here/shared";
import { atomicWriteJson, normalizeLegacyRun, parseRecoverableJson } from "./run-record.js";
import { stateRootForVault } from "./state-paths.js";
import { RunSnapshots } from "./snapshots.js";

export class RunStore {
  readonly vaultRoot: string;
  readonly stateRoot: string;
  private readonly snapshots: RunSnapshots;
  private readonly activeWriteRuns = new Map<string, string>();
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly legacyStateRoots: string[];
  private legacyMigration?: Promise<void>;

  constructor(vaultRoot: string, stateRoot = stateRootForVault(vaultRoot), legacyVaultRoots: string[] = []) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.stateRoot = path.resolve(stateRoot);
    this.snapshots = new RunSnapshots(this.vaultRoot);
    this.legacyStateRoots = legacyVaultRoots.map(stateRootForVault).filter((root) => path.resolve(root) !== this.stateRoot);
  }

  async create(
    title: string,
    prompt: string,
    mode: WikiRun["mode"],
    knowledgeBaseId: string,
    configSnapshot: VaultConfig,
    options: Partial<Pick<WikiRun, "displayPrompt" | "runtimeId" | "runtimeSessionId" | "runtimeTurnId" | "provider" | "model" | "effort" | "outputTarget" | "sourceContext" | "contextPageId">> = {},
  ): Promise<WikiRun> {
    const mayWrite = mode === "write" || mode === "auto";
    if (mayWrite && !this.activeWriteRuns.has(knowledgeBaseId)) {
      const active = (await this.list()).find((run) => (run.mode === "write" || run.mode === "auto")
        && run.knowledgeBaseId === knowledgeBaseId
        && !isTerminalRunStatus(run.status));
      if (active) this.activeWriteRuns.set(knowledgeBaseId, active.id);
    }
    if (mayWrite && this.activeWriteRuns.has(knowledgeBaseId)) {
      throw new Error(`知识库 ${knowledgeBaseId} 已有一个 Wiki 写入任务正在运行`);
    }
    const now = new Date().toISOString();
    const run: WikiRun = {
      id: randomUUID(),
      knowledgeBaseId,
      configSnapshot,
      title,
      prompt,
      ...options,
      mode,
      status: "preparing",
      createdAt: now,
      updatedAt: now,
      events: [],
      approvals: [],
      changes: [],
    };
    if (mayWrite) this.activeWriteRuns.set(knowledgeBaseId, run.id);
    await this.save(run);
    return run;
  }

  async list(): Promise<WikiRun[]> {
    await this.ensureLegacyRunsMigrated();
    const runsDir = path.join(this.stateRoot, "runs");
    let entries: string[] = [];
    try {
      entries = await readdir(runsDir);
    } catch {
      return [];
    }
    const runs = await Promise.all(entries.map(async (entry) => {
      try {
        return normalizeLegacyRun(parseRecoverableJson<WikiRun>(await readFile(path.join(runsDir, entry, "run.json"), "utf8")));
      } catch {
        return undefined;
      }
    }));
    return runs.filter((run): run is WikiRun => Boolean(run)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<WikiRun | undefined> {
    await this.ensureLegacyRunsMigrated();
    try {
      return normalizeLegacyRun(parseRecoverableJson<WikiRun>(await readFile(this.runFile(id), "utf8")));
    } catch {
      return undefined;
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLegacyRunsMigrated();
    await this.mutationQueues.get(id);
    const run = await this.get(id);
    if (!run) return false;
    await rm(this.runDir(id), { recursive: true, force: true });
    if (this.activeWriteRuns.get(run.knowledgeBaseId) === id) this.activeWriteRuns.delete(run.knowledgeBaseId);
    return true;
  }

  async update(id: string, patch: Partial<WikiRun>): Promise<WikiRun> {
    return this.mutate(id, (run) => ({ ...run, ...patch, id: run.id }));
  }

  async addEvent(id: string, event: Omit<RunEvent, "id" | "at">): Promise<WikiRun> {
    return this.mutate(id, (run) => ({ ...run, events: [...run.events, { id: randomUUID(), at: new Date().toISOString(), ...event }] }));
  }

  async addApproval(id: string, approval: ApprovalRequest): Promise<WikiRun> {
    return this.mutate(id, (run) => ({
      ...run,
      approvals: [...run.approvals.filter((item) => item.requestId !== approval.requestId), approval],
      status: "waiting-approval",
    }));
  }

  async resolveApproval(id: string, requestId: string | number): Promise<WikiRun> {
    return this.mutate(id, (run) => {
      const approvals = run.approvals.filter((item) => String(item.requestId) !== String(requestId));
      return { ...run, approvals, status: !approvals.length && run.status === "waiting-approval" ? "running" : run.status };
    });
  }

  snapshot(id: string, config: VaultConfig): Promise<void> {
    return this.snapshots.snapshot(this.runDir(id), config);
  }

  async collectChanges(id: string, config: VaultConfig): Promise<RunFileChange[]> {
    const changes = await this.snapshots.collectChanges(this.runDir(id), config);
    await this.update(id, { changes });
    return changes;
  }

  async setStatus(id: string, status: RunStatus, error?: string): Promise<WikiRun> {
    return this.update(id, { status, error });
  }

  async isLegacyWorkspaceRun(id: string): Promise<boolean> {
    await this.ensureLegacyRunsMigrated();
    try {
      await stat(path.join(this.runDir(id), ".legacy-workspace"));
      return true;
    } catch {
      return false;
    }
  }

  private runDir(id: string): string {
    if (!/^[a-f0-9-]+$/i.test(id)) throw new Error("无效任务 ID");
    return path.join(this.stateRoot, "runs", id);
  }

  private runFile(id: string): string {
    return path.join(this.runDir(id), "run.json");
  }

  private async require(id: string): Promise<WikiRun> {
    const run = await this.get(id);
    if (!run) throw new Error("任务不存在");
    return run;
  }

  private async mutate(id: string, mutation: (run: WikiRun) => WikiRun): Promise<WikiRun> {
    const previous = this.mutationQueues.get(id) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.mutationQueues.set(id, queued);
    await previous;
    try {
      const run = await this.require(id);
      const updated = mutation(run);
      updated.updatedAt = new Date().toISOString();
      if (isTerminalRunStatus(updated.status)
        && this.activeWriteRuns.get(updated.knowledgeBaseId) === id) {
        this.activeWriteRuns.delete(updated.knowledgeBaseId);
      }
      await this.save(updated);
      return updated;
    } finally {
      release();
      if (this.mutationQueues.get(id) === queued) this.mutationQueues.delete(id);
    }
  }

  private async save(run: WikiRun): Promise<void> {
    await atomicWriteJson(this.runFile(run.id), run);
  }

  private async ensureLegacyRunsMigrated(): Promise<void> {
    if (this.legacyMigration) return this.legacyMigration;
    this.legacyMigration = (async () => {
      for (const legacyRoot of this.legacyStateRoots) {
        const sourceRuns = path.join(legacyRoot, "runs");
        let entries: string[];
        try {
          entries = await readdir(sourceRuns);
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!/^[a-f0-9-]+$/i.test(entry)) continue;
          const source = path.join(sourceRuns, entry);
          const destination = path.join(this.stateRoot, "runs", entry);
          try {
            await stat(destination);
          } catch {
            await mkdir(path.dirname(destination), { recursive: true });
            await cp(source, destination, { recursive: true, errorOnExist: false });
          }
          await writeFile(path.join(destination, ".legacy-workspace"), `${legacyRoot}\n`, "utf8");
        }
      }
    })();
    return this.legacyMigration;
  }
}
