import type { SourceImportBatch } from "@the-way-here/shared";
import { sourceBuildRecords } from "./source-model";

// A just-imported batch fills the gap before refresh; live server status wins afterward.
export function mergeSourceBatches(batches: SourceImportBatch[], recent?: SourceImportBatch): SourceImportBatch[] {
  return recent && !batches.some((batch) => batch.id === recent.id) ? [recent, ...batches] : batches;
}

export function pendingMemoryRecords(batches: SourceImportBatch[]) {
  return sourceBuildRecords(batches).filter(({ batch, file }) =>
    ["photos", "alipay"].includes(batch.channel || "") && file.buildKind === "dialogue" && !["built", "deferred"].includes(file.buildStatus || "needs-dialogue"),
  ).sort((a, b) => b.batch.createdAt.localeCompare(a.batch.createdAt));
}
