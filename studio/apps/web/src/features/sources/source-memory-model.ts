import type { SourceImportBatch } from "@the-way-here/shared";
import { sourceBuildRecords, type SourceBuildRecord } from "./source-model";

// A just-imported batch fills the gap before refresh; live server status wins afterward.
export function mergeSourceBatches(batches: SourceImportBatch[], recent?: SourceImportBatch, acknowledged = false): SourceImportBatch[] {
  return recent && !acknowledged && !batches.some((batch) => batch.id === recent.id) ? [recent, ...batches] : batches;
}

export function pendingMemoryRecords(batches: SourceImportBatch[]) {
  return sourceBuildRecords(batches).filter(({ batch, file }) =>
    ["photos", "alipay"].includes(batch.channel || "") && file.buildKind === "dialogue" && !["built", "deferred"].includes(file.buildStatus || "needs-dialogue"),
  ).sort((a, b) => b.batch.createdAt.localeCompare(a.batch.createdAt));
}

export function importedMemoryRecord(batch: SourceImportBatch) {
  return pendingMemoryRecords([batch])[0];
}

export function resolveOpenedMemoryRecord(requested: SourceBuildRecord | undefined, batches: SourceImportBatch[]) {
  if (!requested) return undefined;
  return sourceBuildRecords(batches).find((record) => record.batch.id === requested.batch.id && record.file.storedPath === requested.file.storedPath) || requested;
}

// Hide successful deletions immediately, including from a not-yet-refreshed import snapshot.
export function excludeDeletedSources(batches: SourceImportBatch[], deletedPaths: ReadonlySet<string>) {
  return batches.map((batch) => ({ ...batch, files: batch.files.filter((file) => !deletedPaths.has(file.storedPath)) })).filter((batch) => batch.files.length > 0);
}
