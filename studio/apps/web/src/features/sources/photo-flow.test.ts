import { describe, expect, it } from "vitest";
import type { PhotoMemory, PhotoPerson } from "@the-way-here/shared";
import { appendPhotoAnswer, pendingPhotoPersonEdits, photoPersonQueue, photoQuestions } from "./photo-flow";
import { parsePhotoDraft } from "./photo-draft";

const person: PhotoPerson = { id: "face-1", name: "小林", pageId: "person-1", useAsAvatar: true, box: { x: .1, y: .2, width: .3, height: .4 } };
const memory: PhotoMemory = { id: "memory", knowledgeBaseId: "demo", title: "匿名聚会", reportPath: "demo/memory.md", revision: 1, createdAt: "2026-09-04", draft: "", confirmedStory: "", photos: [
  { id: "photo-1", name: "聚会.jpg", width: 1200, height: 800, people: [person], question: "这是在哪里拍的？" },
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
  it("uses the same memory invitation for every photo, ignoring old AI questions", () => {
    expect(photoQuestions(memory)).toEqual([
      { photoId: "photo-1", question: "这张照片给你留下了什么记忆？" },
      { photoId: "photo-2", question: "这张照片给你留下了什么记忆？" },
    ]);
    expect(appendPhotoAnswer("已有讲述", { photoId: "photo-1", question: "这天很开心吗？", answer: "  其实那天很累。  " }, "第 1 张照片（聚会.jpg）")).toBe("已有讲述\n\n关于第 1 张照片（聚会.jpg）\n提问：这天很开心吗？\n我的讲述：其实那天很累。");
  });
  it("recovers answered, skipped and unfinished questions under the same batch draft", () => {
    const draft = { revision: 1, photoId: "photo-1", people: [], peopleDirty: false, story: "已经讲过的故事", storyDirty: true, step: 3, answers: [{ photoId: "photo-1", question: "在哪里？", answer: "在学校。" }], skipped: [], answer: "还有一件事", direct: false, choiceMade: true };
    expect(parsePhotoDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parsePhotoDraft(JSON.stringify({ ...draft, step: 1 }))?.step).toBe(1);
    expect(parsePhotoDraft(JSON.stringify({ ...draft, answers: [null] }))).toBeUndefined();
    expect(parsePhotoDraft(JSON.stringify({ ...draft, step: 9 }))).toBeUndefined();
    expect(parsePhotoDraft(JSON.stringify({ ...draft, answer: "a".repeat(10001) }))).toBeUndefined();
  });
});

it("does not require unnamed candidates, but requires confirmation for chosen or edited people", () => {
  const blank = { ...person, id: "candidate", name: "", pageId: undefined };
  expect(pendingPhotoPersonEdits(memory, { "photo-2": [blank] })).toEqual([]);
  expect(pendingPhotoPersonEdits(memory, { "photo-2": [{ ...blank, name: "小林" }] })).toHaveLength(1);
  expect(pendingPhotoPersonEdits(memory, { "photo-1": [{ ...person, name: "" }] })).toHaveLength(1);
  expect(pendingPhotoPersonEdits(memory, { "photo-1": [person] })).toEqual([]);
});
