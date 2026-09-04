import type { PhotoMemory, PhotoPerson } from "@the-way-here/shared";
import { photoPersonQueue } from "./photo-flow";

export type FaceGroups = string[][];
export type FaceFeature = { id: string; photoId: string; descriptor: number[] };
export const FACE_GROUP_SIMILARITY = 0.6;

export function normalizedDescriptor(values: ArrayLike<number>): number[] | undefined {
  if (values.length !== 128) return undefined;
  const array = Array.from(values);
  if (!array.every(Number.isFinite)) return undefined;
  const norm = Math.hypot(...array);
  return norm > 0 ? array.map((value) => value / norm) : undefined;
}

// Complete-link grouping prevents A≈B≈C from merging A and C without evidence.
// Faces in one photograph are always separate, even if they resemble each other.
export function groupFaceFeatures(faces: FaceFeature[]): FaceGroups {
  const clusters = faces.flatMap((face) => {
    const descriptor = normalizedDescriptor(face.descriptor);
    return descriptor ? [[{ ...face, descriptor }]] : [];
  });
  const scores = clusters.map((a, i) => clusters.map((b, j) => i === j || a[0]!.photoId === b[0]!.photoId ? -1 : a[0]!.descriptor.reduce((sum, value, k) => sum + value * b[0]!.descriptor[k]!, 0)));
  const active = new Set(clusters.map((_, i) => i));
  while (true) {
    let best: [number, number] | undefined;
    let bestScore = FACE_GROUP_SIMILARITY;
    for (const i of active) for (const j of active) {
      if (j <= i) continue;
      const score = scores[i]![j]!;
      if (score >= bestScore) { bestScore = score; best = [i, j]; }
    }
    if (!best) break;
    const [i, j] = best;
    clusters[i]!.push(...clusters[j]!); clusters[j] = [];
    active.delete(j);
    for (const k of active) scores[i]![k] = scores[k]![i] = Math.min(scores[i]![k]!, scores[j]![k]!);
  }
  return clusters.filter((group) => group.length > 1).map((group) => group.map((face) => face.id));
}

export function groupedPhotoQueue(memory: PhotoMemory, drafts: Record<string, PhotoPerson[]>, groups: FaceGroups) {
  const queue = photoPersonQueue(memory, drafts);
  const used = new Set<string>();
  return queue.flatMap((entry) => {
    if (used.has(entry.person.id)) return [];
    const ids = groups.find((group) => group.includes(entry.person.id)) ?? [entry.person.id];
    const members = queue.filter((candidate) => ids.includes(candidate.person.id) && !used.has(candidate.person.id));
    // A restored/stale suggestion must never override a separately chosen identity.
    const identities = new Set(members.filter((m) => m.person.name).map((m) => m.person.pageId ?? `name:${m.person.name}`));
    const safeMembers = identities.size > 1 || new Set(members.map((member) => member.photo.id)).size !== members.length ? [entry] : members;
    safeMembers.forEach((member) => used.add(member.person.id));
    return [{ ...entry, members: safeMembers, confirmed: safeMembers.every((member) => member.confirmed) }];
  });
}

export function detachFace(groups: FaceGroups, id: string): FaceGroups {
  return groups.map((group) => group.filter((member) => member !== id)).filter((group) => group.length > 1);
}
