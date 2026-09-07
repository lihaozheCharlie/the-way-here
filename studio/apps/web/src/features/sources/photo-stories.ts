import type { PhotoMemory } from "@the-way-here/shared";
import type { PhotoLocalDraft } from "./photo-draft";

function appendLegacyAnswer(story: string, entry: { question: string; answer: string }, photoLabel: string) {
  return [story.trim(), `关于${photoLabel}\n提问：${entry.question}\n我的讲述：${entry.answer.trim()}`].filter(Boolean).join("\n\n");
}

export function restorePhotoStories(memory: PhotoMemory, draft?: PhotoLocalDraft) {
  const stories: Record<string, string> = {};
  for (const photo of memory.photos) {
    const local = draft?.photoStories?.[photo.id];
    const answer = draft?.answers?.find((entry) => entry.photoId === photo.id)?.answer;
    if (local !== undefined || answer !== undefined) stories[photo.id] = local ?? answer!;
  }
  if (draft?.answer?.trim()) {
    const next = memory.photos.find((photo) => !draft.answers?.some((entry) => entry.photoId === photo.id) && !draft.skipped?.includes(photo.id));
    if (next && stories[next.id] === undefined) stories[next.id] = draft.answer;
  }
  // Free-form legacy stories have no reliable per-photo attribution; retain them whole.
  let legacyStory = draft?.legacyStory ?? (draft?.storyDirty ? draft.story : memory.photos.some((photo) => photo.story !== undefined) ? "" : memory.draft || memory.confirmedStory);
  if (draft?.photoStories === undefined && draft?.answers?.length) {
    const assembled = draft.answers.reduce((story, answer) => {
      const index = memory.photos.findIndex((photo) => photo.id === answer.photoId);
      return appendLegacyAnswer(story, answer, index < 0 ? answer.photoId : `第 ${index + 1} 张照片（${memory.photos[index]!.name}）`);
    }, "");
    if (legacyStory.startsWith(assembled)) legacyStory = legacyStory.slice(assembled.length).trim();
    else if (legacyStory) {
      // A reviewed legacy version is authoritative; do not reintroduce superseded answers.
      for (const answer of draft.answers) delete stories[answer.photoId];
    }
  }
  return { stories, legacyStory };
}

export function photoStory(memory: PhotoMemory, drafts: Record<string, string>, photoId: string) {
  return drafts[photoId] ?? memory.photos.find((photo) => photo.id === photoId)?.story ?? "";
}

export function assemblePhotoStories(memory: PhotoMemory, drafts: Record<string, string>, legacyStory = "") {
  return [legacyStory.trim(), ...memory.photos.flatMap((photo, index) => {
    const story = photoStory(memory, drafts, photo.id).trim();
    return story ? [`关于第 ${index + 1} 张照片（${photo.name}）\n${story}`] : [];
  })].filter(Boolean).join("\n\n");
}
