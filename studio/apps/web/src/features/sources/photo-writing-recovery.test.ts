import { expect, it } from "vitest";
import type { PhotoMemory, WikiRun } from "@the-way-here/shared";
import { photoRunToReconcile, photoWritingBackground } from "./photo-writing-recovery";
import { parsePhotoDraft } from "./photo-draft";
import { restoreGroupStory } from "./photo-stories";
import { memoryWritingPrompt } from "./memory-writing";

const running = { id: "run-1", status: "running", prompt: memoryWritingPrompt("那天和朋友看海", ""), outputTarget: { kind: "photo-memory", phase: "draft" } } as WikiRun;
const completed = { ...running, status: "completed" } as WikiRun;
const local = { revision: 4, photoId: "p1", people: [], peopleDirty: false, story: "", storyDirty: false, groupStory: "", background: "那天和朋友看海", pendingDraftRunId: running.id };

it("still reconciles output when the completion notification beats the next poll", () => {
  expect(photoRunToReconcile([running], [], running)).toBe(running);
  expect(photoRunToReconcile([completed], [], running)).toBe(completed);
  expect(photoRunToReconcile([completed], [completed.id], running)).toBeUndefined();
});
it("resumes a completed run after closing and reopening the photo editor", () => {
  const restored = parsePhotoDraft(JSON.stringify(local))!;
  expect(restored.background).toBe(local.background);
  expect(photoRunToReconcile([completed], [], undefined, restored.pendingDraftRunId)).toBe(completed);
  const memory = { revision: 5, draft: "那天我和朋友一起看海。", storyLayout: "group", photos: [] } as unknown as PhotoMemory;
  expect(restoreGroupStory(memory, restored)).toBe(memory.draft);
  // Autosave may already have copied the new revision onto the old empty cache.
  expect(restoreGroupStory(memory, { ...restored, revision: 5 })).toBe(memory.draft);
  expect(restoreGroupStory(memory, { ...restored, storyDirty: true })).toBe("");
});
it("surfaces failed and interrupted pending runs, but never replays old completed runs", () => {
  for (const status of ["failed", "interrupted"] as const) {
    const run = { ...running, status };
    expect(photoRunToReconcile([run], [], undefined, run.id)).toBe(run);
  }
  expect(photoRunToReconcile([completed], [])).toBeUndefined();
});
it("recovers the submitted background for drafts made before background persistence existed", () => {
  expect(photoWritingBackground(completed)).toBe(local.background);
  expect(photoWritingBackground({ ...completed, prompt: "legacy request" })).toBeUndefined();
  expect(photoWritingBackground({ ...completed, prompt: '\n{"background":null}' })).toBeUndefined();
  expect(parsePhotoDraft(JSON.stringify({ ...local, background: "" }))?.background).toBe("");
  expect(parsePhotoDraft(JSON.stringify({ ...local, background: "x".repeat(10001) }))).toBeUndefined();
  expect(parsePhotoDraft(JSON.stringify({ ...local, pendingDraftRunId: {} }))).toBeUndefined();
});
