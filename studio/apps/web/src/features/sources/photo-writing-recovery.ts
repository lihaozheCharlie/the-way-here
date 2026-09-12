import { isTerminalRunStatus, type WikiRun } from "@the-way-here/shared";

/** A completion event must not make a pending output disappear before it is applied. */
export function photoRunToReconcile(runs: WikiRun[], finished: string[], started?: WikiRun, pendingDraftRunId?: string): WikiRun | undefined {
  return runs.find((run) => !finished.includes(run.id) && (run.id === pendingDraftRunId || run.id === started?.id || !isTerminalRunStatus(run.status)))
    ?? (started && !finished.includes(started.id) ? started : undefined);
}

/** Recover only the structured user background from our own writing request. */
export function photoWritingBackground(run?: WikiRun): string | undefined {
  if (run?.outputTarget?.kind !== "photo-memory" || run.outputTarget.phase !== "draft") return undefined;
  const start = run.prompt.indexOf('\n{"background":');
  if (start < 0) return undefined;
  try {
    const value = JSON.parse(run.prompt.slice(start + 1));
    return typeof value.background === "string" && value.background.length <= 10000 ? value.background : undefined;
  } catch { return undefined; }
}
