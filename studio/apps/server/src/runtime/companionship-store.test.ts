import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { stateRootForVault } from "@the-way-here/run-manager";
import { CompanionshipStore } from "./companionship-store.js";
it("isolates anonymous spaces and persists history through run deletion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "companion-demo-"));
  const state = stateRootForVault(root);
  try {
    const runDir = path.join(state, "runs", "demo-run");
    await mkdir(runDir, { recursive:true });
    await writeFile(path.join(runDir, "run.json"), JSON.stringify({id:"demo-run", knowledgeBaseId:"demo", createdAt:"2026-01-01T00:00:00.000Z", status:"completed", mode:"read", events:[], changes:[], approvals:[]}));
    const store = new CompanionshipStore(root, () => new Date("2026-09-22T00:00:00.000Z"));
    expect(await store.startedAt("demo")).toBe("2026-01-01T00:00:00.000Z");
    expect(await Promise.all([store.startedAt("new-space"), store.startedAt("new-space")])).toEqual(["2026-09-22T00:00:00.000Z", "2026-09-22T00:00:00.000Z"]);
    await rm(runDir, {recursive:true});
    expect(await new CompanionshipStore(root).startedAt("demo")).toBe("2026-01-01T00:00:00.000Z");
  } finally { await rm(root, {recursive:true, force:true}); await rm(state, {recursive:true, force:true}); }
});
