import { describe, expect, it } from "vitest";
import type { SourceImportBatch } from "@the-way-here/shared";
import { excludeDeletedSources, importedMemoryRecord, mergeSourceBatches, pendingMemoryRecords, resolveOpenedMemoryRecord } from "./source-memory-model";

function batch(id: string, channel: SourceImportBatch["channel"], status: SourceImportBatch["files"][number]["buildStatus"]): SourceImportBatch {
  return { id, channel, createdAt: "2026-09-04T00:00:00Z", fileCount: 2, totalBytes: 20, files: [{ originalName: id, storedPath: `sources/${id}.md`, bytes: 20, buildKind: channel === "files" ? "direct" : "dialogue", buildStatus: status }] };
}

describe("memory inbox", () => {
  it("keeps unfinished photo and bill memories while completed, deferred and regular imports stay in the list", () => {
    const batches = [batch("photo", "photos", "needs-dialogue"), batch("bill", "alipay", "ready-to-build"), batch("running", "photos", "building"), batch("built-photo", "photos", "built"), batch("built-bill", "alipay", "built"), batch("later", "photos", "deferred"), batch("note", "files", "ready")];
    expect(pendingMemoryRecords(batches).map((r) => r.batch.id)).toEqual(["photo", "bill", "running"]);
  });
  it("shows one memory card when historical batches point to the same life record", () => {
    const current = batch("current-bill", "alipay", "needs-dialogue");
    const historical = batch("historical-bill", "alipay", "needs-dialogue");
    historical.files[0]!.storedPath = current.files[0]!.storedPath;

    expect(pendingMemoryRecords([current, historical]).map((record) => record.batch.id)).toEqual(["current-bill"]);
  });
  it("uses refreshed build status instead of the old just-imported snapshot", () => {
    const imported = batch("photo", "photos", "needs-dialogue");
    expect(pendingMemoryRecords(mergeSourceBatches([], imported))).toHaveLength(1);
    const completed = batch("photo", "photos", "built");
    const merged = mergeSourceBatches([completed], imported);
    expect(merged).toEqual([completed]);
    expect(pendingMemoryRecords(merged)).toEqual([]);
    expect(pendingMemoryRecords(mergeSourceBatches([batch("photo", "photos", "ready-to-build")], imported))).toHaveLength(1);
  });

  it("opens only a newly imported photo or bill memory", () => {
    expect(importedMemoryRecord(batch("photo", "photos", "needs-dialogue"))?.batch.id).toBe("photo");
    expect(importedMemoryRecord(batch("bill", "alipay", "needs-dialogue"))?.batch.id).toBe("bill");
    expect(importedMemoryRecord(batch("note", "files", "ready"))).toBeUndefined();
    expect(importedMemoryRecord(batch("built", "photos", "built"))).toBeUndefined();
  });

  it("keeps the just-imported memory open while the refreshed import list catches up", () => {
    const requested = importedMemoryRecord(batch("photo", "photos", "needs-dialogue"))!;
    expect(resolveOpenedMemoryRecord(requested, [])).toBe(requested);
    const refreshed = batch("photo", "photos", "in-dialogue");
    expect(resolveOpenedMemoryRecord(requested, [refreshed])?.file.buildStatus).toBe("in-dialogue");
    expect(resolveOpenedMemoryRecord(undefined, [refreshed])).toBeUndefined();
  });
});

it("does not resurrect a deleted batch from an acknowledged recent import", () => {
  const recent = batch("deleted", "photos", "needs-dialogue");
  expect(mergeSourceBatches([], recent, true)).toEqual([]);
  expect(mergeSourceBatches([], recent, false)).toEqual([recent]);
});
it("immediately removes deleted memories and pending counts from stale responses", () => {
  const deleted = batch("deleted", "photos", "needs-dialogue");
  const kept = batch("kept", "photos", "needs-dialogue");
  const removed = new Set([deleted.files[0]!.storedPath]);
  const result = excludeDeletedSources(mergeSourceBatches([kept], deleted), removed);
  expect(result).toEqual([kept]);
  expect(pendingMemoryRecords(result).map((record) => record.batch.id)).toEqual(["kept"]);
  expect(deleted.files).toHaveLength(1);
});
it("removes only deleted records from a multi-file batch", () => {
  const mixed = batch("mixed", "alipay", "needs-dialogue");
  const second = { ...mixed.files[0]!, storedPath: "sources/remaining.md" };
  mixed.files.push(second);
  const result = excludeDeletedSources([mixed], new Set([mixed.files[0]!.storedPath]));
  expect(result[0]!.files).toEqual([second]);
});
