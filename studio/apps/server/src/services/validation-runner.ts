import { spawn } from "node:child_process";
import type { VaultConfig, WikiRun } from "@the-way-here/shared";

export type ValidationResult = NonNullable<WikiRun["validation"]>[number];
const outputLimit = 50_000;

export async function runValidationCommands(options: {
  vaultRoot: string;
  knowledgeBaseId: string;
  config: VaultConfig;
  timeoutMs?: number;
  onOutput?: (command: string[], chunk: string) => void;
  onResult?: (result: ValidationResult) => Promise<void> | void;
}): Promise<{ valid: boolean; results: ValidationResult[] }> {
  const results: ValidationResult[] = [];
  for (const command of options.config.validation.commands) {
    if (!command.length) continue;
    const result = await new Promise<{ exitCode: number | null; output: string }>((resolve) => {
      const child = spawn(command[0]!, command.slice(1), {
        cwd: options.vaultRoot,
        env: { ...process.env, THE_WAY_HERE_KNOWLEDGE_BASE: options.knowledgeBaseId },
        detached: process.platform !== "win32",
      });
      let output = "", emitted = 0;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        // Stop the process group too, so descendants cannot keep stdout and the run open.
        try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); }
        catch { child.kill("SIGKILL"); }
      }, options.timeoutMs ?? 120_000);
      const capture = (chunk: Buffer | string) => {
        const text = chunk.toString();
        output = (output + text).slice(-outputLimit);
        const remaining = outputLimit - emitted;
        if (remaining > 0) { const part = text.slice(0, remaining); emitted += part.length; options.onOutput?.(command, part); }
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      child.on("error", (error) => { output = error.message; });
      // exit may precede the final output chunk; close means the pipes are drained.
      child.on("close", (exitCode) => {
        clearTimeout(timeout);
        resolve({ exitCode: timedOut ? null : exitCode, output: timedOut ? `${output}\n校验超时，已停止进程。`.slice(-outputLimit) : output });
      });
    });
    const entry = { command, ...result };
    results.push(entry);
    await options.onResult?.(entry);
    if (result.exitCode !== 0) return { valid: false, results };
  }
  return { valid: true, results };
}
