import { describe, expect, it } from "vitest";
import type { SourceImportBatch } from "@the-way-here/shared";
import { mergeSourceBatches, pendingMemoryRecords } from "./source-memory-model";

function batch(id: string, channel: SourceImportBatch["channel"], status: SourceImportBatch["files"][number]["buildStatus"]): SourceImportBatch {
  return { id, channel, createdAt: "2026-09-04T00:00:00Z", fileCount: 2, totalBytes: 20, files: [{ originalName: id, storedPath: `sources/${id}.md`, bytes: 20, buildKind: channel === "files" ? "direct" : "dialogue", buildStatus: status }] };
}

describe("memory inbox", () => {
  it("keeps unfinished photo and bill memories while completed, deferred and regular imports stay in the list", () => {
    const batches = [batch("photo", "photos", "needs-dialogue"), batch("bill", "alipay", "ready-to-build"), batch("running", "photos", "building"), batch("built-photo", "photos", "built"), batch("built-bill", "alipay", "built"), batch("later", "photos", "deferred"), batch("note", "files", "ready")];
    expect(pendingMemoryRecords(batches).map((r) => r.batch.id)).toEqual(["photo", "bill", "running"]);
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
});
