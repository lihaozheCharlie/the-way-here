import { describe, expect, it } from "vitest";
import type { PhotoMemory, PhotoPerson } from "@the-way-here/shared";
import { pendingPhotoPersonEdits, photoPersonQueue } from "./photo-flow";

const person: PhotoPerson = { id: "face-1", name: "小林", pageId: "person-1", useAsAvatar: true, box: { x: .1, y: .2, width: .3, height: .4 } };
const memory: PhotoMemory = { id: "memory", knowledgeBaseId: "demo", title: "匿名聚会", reportPath: "demo/memory.md", revision: 1, createdAt: "2026-09-04", draft: "", confirmedStory: "", photos: [
  { id: "photo-1", name: "聚会.jpg", width: 1200, height: 800, people: [person] },
  { id: "photo-2", name: "旅行.jpg", width: 800, height: 1200, people: [] },
] };

describe("photo memory stage boundaries", () => {
  it("flattens faces across photographs and distinguishes saved identities from local edits", () => {
    const pending = { ...person, id: "face-2", name: "", pageId: undefined };
    const queue = photoPersonQueue(memory, { "photo-1": [person], "photo-2": [pending] });
    expect(queue.map(({ photo, confirmed }) => [photo.id, confirmed])).toEqual([["photo-1", true], ["photo-2", false]]);
    expect(photoPersonQueue(memory, { "photo-1": [{ ...person, pageId: "another-person" }] })[0]?.confirmed).toBe(false);
    expect(photoPersonQueue(memory, { "photo-1": [{ ...person, box: { ...person.box, x: .2 } }] })[0]?.confirmed).toBe(false);
  });
  it("supports an empty face list and preserves existing identities when skipping other photos", () => {
    expect(photoPersonQueue(memory, { "photo-1": [], "photo-2": [] })).toEqual([]);
    expect(photoPersonQueue(memory, {}).map(({ person }) => person.id)).toEqual(["face-1"]);
  });
});

it("does not require unnamed candidates, but requires confirmation for chosen or edited people", () => {
  const blank = { ...person, id: "candidate", name: "", pageId: undefined };
  expect(pendingPhotoPersonEdits(memory, { "photo-2": [blank] })).toEqual([]);
  expect(pendingPhotoPersonEdits(memory, { "photo-2": [{ ...blank, name: "小林" }] })).toHaveLength(1);
  expect(pendingPhotoPersonEdits(memory, { "photo-1": [{ ...person, name: "" }] })).toHaveLength(1);
  expect(pendingPhotoPersonEdits(memory, { "photo-1": [person] })).toEqual([]);
});
