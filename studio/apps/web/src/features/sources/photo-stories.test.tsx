import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { PhotoMemory } from "@the-way-here/shared";
import { PhotoNarration } from "./PhotoNarration";
import { assemblePhotoStories, photoStory, restorePhotoStories } from "./photo-stories";
import { photoIdentityUpdates, groupedPhotoQueue, reconcilePhotoDrafts } from "./photo-face-groups";

const memory = { id: "memory", knowledgeBaseId: "demo", draft: "", confirmedStory: "", photos: [
  { id: "p1", name: "a.jpg", story: "夏天的回忆", width: 800, height: 600, people: [{ id: "a", name: "甲", groupId: "same", useAsAvatar: true, box: { x: .1, y: .1, width: .2, height: .3 } }] },
  { id: "p2", name: "b.jpg", width: 800, height: 600, people: [{ id: "b", name: "甲", groupId: "same", useAsAvatar: true, box: { x: .6, y: .3, width: .3, height: .4 } }] },
] } as PhotoMemory;

it("edits an identity from either photo after reopening, preserving independent crops", () => {
  const updates = photoIdentityUpdates(memory, {}, [], "b", { name: "乙", pageId: "person-page" });
  expect(updates).toHaveLength(2);
  updates.forEach((update, i) => {
    expect(update.people[0]).toMatchObject({ name: "乙", pageId: "person-page", groupId: "same", box: memory.photos[i]!.people[0]!.box });
  });
  const restored = { ...memory, photos: memory.photos.map((photo, i) => ({ ...photo, people: updates[i]!.people })) };
  expect(groupedPhotoQueue(restored, {}, [])[0]!.members).toHaveLength(2);
  expect(photoIdentityUpdates(restored, {}, [], "a", { name: "新称呼", pageId: undefined })[1]!.people[0]!.pageId).toBeUndefined();
});
it("does not synchronize detached or unrelated faces", () => {
  const drafts = { p2: [{ ...memory.photos[1]!.people[0]!, groupId: undefined }] };
  expect(photoIdentityUpdates(memory, drafts, [], "a", { name: "乙" })).toHaveLength(1);
});
it("keeps each story independent, including deliberate clearing", () => {
  const drafts = { p1: "", p2: "另一张的回忆" };
  expect(photoStory(memory, drafts, "p1")).toBe("");
  expect(assemblePhotoStories(memory, drafts)).toBe("关于第 2 张照片（b.jpg）\n另一张的回忆");
  expect(restorePhotoStories({ ...memory, photos: memory.photos.map((photo) => ({ ...photo, story: undefined })), confirmedStory: "原有整段讲述" }).legacyStory).toBe("原有整段讲述");
});
it("recovers answers from five-step browser drafts without exposing that workflow", () => {
  const draft = { revision: 1, photoId: "p1", people: [], peopleDirty: false, story: "", storyDirty: true, step: 4 as const, answers: [{ photoId: "p1", question: "在哪里？", answer: "在学校。" }], skipped: [], answer: "第二张还有一件事" };
  expect(restorePhotoStories(memory, draft).stories).toEqual({ p1: "在学校。", p2: "第二张还有一件事" });
});
it("shows distinct completed/empty copy and only offers drafting for an empty photo", () => {
  const props = { memory, selectedId: "p1", stories: { p1: "已写好", p2: "" }, legacyStory: "", locked: false, onSelect: vi.fn(), onStory: vi.fn(), onLegacyStory: vi.fn(), onGenerate: vi.fn() };
  const done = renderToStaticMarkup(<PhotoNarration {...props} />);
  expect(done).toContain("这张已经写好了，随时可以接着改。");
  expect(done).not.toContain("AI 帮你写");
  expect(done).toContain("，写好了"); expect(done).toContain("，还没写");
  const empty = renderToStaticMarkup(<PhotoNarration {...props} selectedId="p2" />);
  expect(empty).toContain("这张还没写"); expect(empty).toContain("AI 帮你写");
  expect(empty).not.toContain("role=\"combobox\"");
});

it("adopts published page links while preserving unsaved crop edits", () => {
  const current = { ...memory, photos: memory.photos.map((photo) => ({ ...photo, people: photo.people.map((person) => ({ ...person, pageId: "published-page" })) })) };
  const edited = { ...memory.photos[1]!.people[0]!, box: { x: .4, y: .3, width: .3, height: .4 } };
  const reconciled = reconcilePhotoDrafts(memory, current, { p1: memory.photos[0]!.people, p2: [edited] });
  expect(reconciled.p1![0]!.pageId).toBe("published-page");
  expect(reconciled.p2![0]).toEqual(edited);
});
