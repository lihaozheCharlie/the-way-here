import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultConfig } from "@the-way-here/shared";
import { runValidationCommands } from "./validation-runner.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("validation runner", () => {
  it("injects the run-bound knowledge base into every command", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "the-way-here-validation-"));
    temporaryRoots.push(root);
    const config = {
      validation: { commands: [[process.execPath, "-e", "process.stdout.write(process.env.THE_WAY_HERE_KNOWLEDGE_BASE || '')"]] },
    } as VaultConfig;
    const result = await runValidationCommands({ vaultRoot: root, knowledgeBaseId: "demo", config });
    expect(result.valid).toBe(true);
    expect(result.results[0]?.output).toBe("demo");
  });
  it("stops hung validation and never proceeds to the next command", async () => {
    const config = { validation: { commands: [[process.execPath, "-e", "setInterval(() => {}, 1000)"], [process.execPath, "-e", "process.exit(0)"]] } } as VaultConfig;
    const result = await runValidationCommands({ vaultRoot: os.tmpdir(), knowledgeBaseId: "demo", config, timeoutMs:100 });
    expect(result.valid).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.output).toContain("校验超时");
  });

  it("drains the output while bounding persisted and streamed logs", async () => {
    const config = { validation: { commands: [[process.execPath, "-e", "process.stdout.write('a'.repeat(200000)+'END')"]] } } as VaultConfig;
    let streamed=0;
    const result = await runValidationCommands({ vaultRoot: os.tmpdir(), knowledgeBaseId: "demo", config, onOutput:(_command, chunk) => { streamed += chunk.length; } });
    expect(result.valid).toBe(true);
    expect(result.results[0]?.output.length).toBe(50000);
    expect(result.results[0]?.output.endsWith('END')).toBe(true);
    expect(streamed).toBeLessThanOrEqual(50000);
  });

  it("reports an unavailable executable as failure", async () => {
    const config = { validation: { commands: [["/nonexistent/twh-validator"]] } } as VaultConfig;
    const result = await runValidationCommands({ vaultRoot: os.tmpdir(), knowledgeBaseId: "demo", config });
    expect(result.valid).toBe(false);
    expect(result.results[0]?.output).toContain("ENOENT");
  });

});
