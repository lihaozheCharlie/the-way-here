import type { PhotoPerson } from "@the-way-here/shared";

type LegacyPhotoAnswer = { photoId: string; question: string; answer: string };

export interface PhotoLocalDraft {
  revision: number;
  photoId: string;
  people: PhotoPerson[];
  peopleDirty: boolean;
  story: string;
  storyDirty: boolean;
  faceGroups?: string[][];
  photoStories?: Record<string, string>;
  legacyStory?: string;
  photoDrafts?: Record<string, PhotoPerson[]>;
  step?: 1 | 2 | 3 | 4 | 5;
  answers?: LegacyPhotoAnswer[];
  skipped?: string[];
  answer?: string;
  detectionVersion?: number;
}
export function photoDraftKey(knowledgeBaseId: string, memoryId: string) {
  return `the-way-here:photo-draft:${encodeURIComponent(knowledgeBaseId)}:${encodeURIComponent(memoryId)}`;
}
export function parsePhotoDraft(raw: string | null): PhotoLocalDraft | undefined {
  try {
    if (!raw || raw.length > 256_000) return undefined;
    const value = JSON.parse(raw);
    if (!Number.isInteger(value.revision) || typeof value.photoId !== "string" || typeof value.story !== "string" || value.story.length > 60_000
      || typeof value.peopleDirty !== "boolean" || typeof value.storyDirty !== "boolean" || !Array.isArray(value.people) || value.people.length > 40) return undefined;
    const ids = new Set<string>();
    for (const person of value.people) {
      const b = person?.box;
      if (!person || typeof person.id !== "string" || ids.has(person.id) || typeof person.name !== "string" || typeof person.useAsAvatar !== "boolean"
        || person.pageId !== undefined && typeof person.pageId !== "string"
        || !b || ![b.x, b.y, b.width, b.height].every((n) => typeof n === "number" && Number.isFinite(n))
        || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x + b.width > 1.00001 || b.y + b.height > 1.00001) return undefined;
      ids.add(person.id);
    }
    if (value.photoDrafts !== undefined) {
      if (!value.photoDrafts || typeof value.photoDrafts !== "object" || Array.isArray(value.photoDrafts) || Object.keys(value.photoDrafts).length > 10) return undefined;
      for (const [photoId, people] of Object.entries(value.photoDrafts)) {
        if (!parsePhotoDraft(JSON.stringify({ revision: value.revision, photoId, people, peopleDirty: true, story: "", storyDirty: false }))) return undefined;
      }
    }
    if (value.legacyStory !== undefined && (typeof value.legacyStory !== "string" || value.legacyStory.length > 60000)) return undefined;
    if (value.photoStories !== undefined && (!value.photoStories || typeof value.photoStories !== "object" || Array.isArray(value.photoStories) || Object.keys(value.photoStories).length > 10 || !Object.values(value.photoStories).every((story) => typeof story === "string" && story.length <= 10000))) return undefined;
    if (value.faceGroups !== undefined) {
      if (!Array.isArray(value.faceGroups) || value.faceGroups.length > 200) return undefined;
      const grouped = new Set<string>();
      for (const group of value.faceGroups) {
        if (!Array.isArray(group) || group.length < 2 || group.length > 10) return undefined;
        for (const id of group) {
          if (typeof id !== "string" || !/^[a-z0-9-]{1,80}$/i.test(id) || grouped.has(id)) return undefined;
          grouped.add(id);
        }
      }
    }
    if (value.step !== undefined && ![1, 2, 3, 4, 5].includes(value.step)) return undefined;
    if (value.detectionVersion !== undefined && (!Number.isInteger(value.detectionVersion) || value.detectionVersion < 1 || value.detectionVersion > 100)) return undefined;
    if (value.answer !== undefined && (typeof value.answer !== "string" || value.answer.length > 10000)) return undefined;
    if (value.skipped !== undefined && (!Array.isArray(value.skipped) || value.skipped.length > 10 || !value.skipped.every((id: unknown) => typeof id === "string"))) return undefined;
    if (value.answers !== undefined && (!Array.isArray(value.answers) || value.answers.length > 10 || !value.answers.every((entry: any) => entry && typeof entry.photoId === "string" && typeof entry.question === "string" && entry.question.length <= 10000 && typeof entry.answer === "string" && entry.answer.length <= 10000))) return undefined;
    return value;
  } catch { return undefined; }
}
