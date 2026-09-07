

export type PhotoBox = { x: number; y: number; width: number; height: number };
export interface PhotoPerson {
  id: string;
  groupId?: string;
  box: PhotoBox;
  name: string;
  pageId?: string;
  useAsAvatar: boolean;
}
export interface MemoryPhoto {
  id: string;
  name: string;
  width: number;
  height: number;
  story?: string;
  storyOrigin?: "user" | "ai";
  people: PhotoPerson[];
}
export interface PhotoMemory {
  id: string;
  knowledgeBaseId: string;
  title: string;
  reportPath: string;
  revision: number;
  reportHash?: string;
  createdAt: string;
  photos: MemoryPhoto[];
  draft: string;
  confirmedStory: string;
  confirmedAt?: string;
  builtAt?: string;
  builtPeople?: Array<{ photoId: string; personId: string; pageId: string; avatar: boolean }>;
}
export interface PersonPhoto {
  imageUrl: string;
  avatarUrl?: string;
  reportPageId: string;
  title: string;
}
export function photoAssetUrl(knowledgeBaseId: string, memoryId: string, photoId: string, variant = "preview"): string {
  return `/api/photo-memories/${encodeURIComponent(memoryId)}/assets/${encodeURIComponent(photoId)}/${encodeURIComponent(variant)}?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`;
}
