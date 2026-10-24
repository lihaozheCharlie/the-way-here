import type { SourceImportBatch } from "@the-way-here/shared";
import type { PhotoLocalDraft } from "../sources/photo-draft";

export const PENDING_PHOTO_MEMORY_KEY = "twh:pending-photo-memory";

export function stagePendingPhotoMemory(batch: SourceImportBatch): void {
  sessionStorage.setItem(PENDING_PHOTO_MEMORY_KEY, JSON.stringify(batch));
}

export function readPendingPhotoMemory(): SourceImportBatch | undefined {
  const raw = sessionStorage.getItem(PENDING_PHOTO_MEMORY_KEY);
  if (!raw) return undefined;
  try {
    const batch = JSON.parse(raw) as SourceImportBatch;
    if (batch?.channel === "photos" && typeof batch.id === "string" && Array.isArray(batch.files)) return batch;
  } catch { return undefined; }
  return undefined;
}

export function clearPendingPhotoMemory(): void {
  sessionStorage.removeItem(PENDING_PHOTO_MEMORY_KEY);
}

/** Preview bytes stay on device. Rejects anything that is not a still image data URL. */
export function photoPreviewPayload(dataUrl: string, name: string): { name: string; content: string; encoding: "base64" } {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) throw new Error("这张照片的预览不是可保存的 JPG、PNG 或 WebP");
  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\r\n]/g, " ").trim().slice(0, 80) || "照片";
  return { name: `${base}.${ext}`, content: match[2], encoding: "base64" };
}

/** Names and the short note are local draft context for the later person-confirmation step. */
export function photoHandoffDraft(people: string, note: string): PhotoLocalDraft | undefined {
  const lines = [people.trim() && `照片里的人：${people.trim()}`, note.trim()].filter((line): line is string => Boolean(line));
  if (!lines.length) return undefined;
  return {
    revision: 1,
    photoId: "photo-1",
    people: [],
    peopleDirty: false,
    story: "",
    storyDirty: false,
    background: lines.join("\n\n").slice(0, 10_000),
    step: 2,
  };
}
