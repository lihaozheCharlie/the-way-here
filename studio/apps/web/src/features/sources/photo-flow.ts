import type { PhotoMemory, PhotoPerson } from "@the-way-here/shared";

export type PhotoStep = 2 | 3;

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
