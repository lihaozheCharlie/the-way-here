import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RunStore, stateRootForVault } from "@the-way-here/run-manager";

/** Persist the first known interaction per space, independently of deletable runs. */
export class CompanionshipStore {
  private pending = new Map<string, Promise<string>>();
  constructor(private root: string, private now = () => new Date()) {}

  startedAt(knowledgeBaseId: string): Promise<string> {
    const existing = this.pending.get(knowledgeBaseId);
    if (existing) return existing;
    const task = this.load(knowledgeBaseId).catch(error => { this.pending.delete(knowledgeBaseId); throw error; });
    this.pending.set(knowledgeBaseId, task);
    return task;
  }

  private async load(id: string): Promise<string> {
    const dir = path.join(stateRootForVault(this.root), "companionship");
    const file = path.join(dir, `${createHash("sha256").update(id).digest("hex")}.json`);
    try {
      const stored = JSON.parse(await readFile(file, "utf8"));
      if (typeof stored.startedAt === "string" && Number.isFinite(Date.parse(stored.startedAt))) return stored.startedAt;
      throw new Error("Invalid companionship start date");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const now = this.now().getTime();
    const times = (await new RunStore(this.root).list()).filter(run => run.knowledgeBaseId === id).map(run => Date.parse(run.createdAt)).filter(time => Number.isFinite(time) && time <= now);
    const startedAt = new Date(Math.min(now, ...times)).toISOString();
    await mkdir(dir, { recursive: true });
    try { await writeFile(file, JSON.stringify({ startedAt }), { flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stored = JSON.parse(await readFile(file, "utf8"));
      if (typeof stored.startedAt !== "string" || !Number.isFinite(Date.parse(stored.startedAt))) throw new Error("Invalid companionship start date");
      return stored.startedAt;
    }
    return startedAt;
  }
}
