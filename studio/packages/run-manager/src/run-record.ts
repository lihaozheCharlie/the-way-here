import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WikiRun } from "@the-way-here/shared";

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

export function parseRecoverableJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (originalError) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let started = false;
    for (let index = 0; index < raw.length; index += 1) {
      const character = raw[index]!;
      if (!started) {
        if (character !== "{") continue;
        started = true;
        depth = 1;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return JSON.parse(raw.slice(raw.indexOf("{"), index + 1)) as T;
      }
    }
    throw originalError;
  }
}

export function normalizeLegacyRun(run: WikiRun): WikiRun {
  const legacy = run as WikiRun & { threadId?: string; turnId?: string };
  return {
    ...run,
    runtimeId: run.runtimeId || (legacy.threadId ? "codex" : undefined),
    runtimeSessionId: run.runtimeSessionId || legacy.threadId,
    runtimeTurnId: run.runtimeTurnId || legacy.turnId,
    approvals: (run.approvals || []).map((approval) => approval.runtimeId ? approval : {
      ...approval,
      runtimeId: "codex",
      operation: String(approval.method || "").includes("command") ? "command" : "tool",
      title: "Codex 请求执行操作",
      detail: String(approval.params?.reason || approval.params?.command || approval.method || "需要确认的操作"),
    }),
  };
}

