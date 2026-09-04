import { PHOTO_MEMORY_QUESTION, type PhotoMemory, type PhotoPerson } from "@the-way-here/shared";

export type PhotoStep = 1 | 2 | 3 | 4 | 5;
export type PhotoAnswer = { photoId: string; question: string; answer: string };
export const photoSteps = ["选照片", "认人物", "讲故事", "确认讲述", "收进理解"];

export function photoPersonQueue(memory: PhotoMemory, drafts: Record<string, PhotoPerson[]>) {
  return memory.photos.flatMap((photo, photoIndex) => (drafts[photo.id] ?? photo.people).map((person) => ({
    photo, photoIndex, person,
    confirmed: photo.people.some((saved) => saved.id === person.id && saved.name === person.name && saved.pageId === person.pageId && saved.useAsAvatar === person.useAsAvatar && JSON.stringify(saved.box) === JSON.stringify(person.box)),
  })));
}

// Unnamed detection candidates are optional; edited or named people need explicit confirmation.
export function pendingPhotoPersonEdits(memory: PhotoMemory, drafts: Record<string, PhotoPerson[]>) {
  return photoPersonQueue(memory, drafts).filter((entry) => !entry.confirmed && (entry.person.name.trim() || entry.photo.people.some((person) => person.id === entry.person.id)));
}

export function photoQuestions(memory: PhotoMemory) {
  return memory.photos.map((photo) => ({ photoId: photo.id, question: PHOTO_MEMORY_QUESTION }));
}

export function appendPhotoAnswer(story: string, entry: PhotoAnswer, photoLabel = entry.photoId) {
  // Photo order is immutable in a batch; the caller supplies its ordinal and filename.
  // Keep the question attributed; its premise is never rewritten as the user's fact.
  return [story.trim(), `关于${photoLabel}\n提问：${entry.question}\n我的讲述：${entry.answer.trim()}`].filter(Boolean).join("\n\n");
}
