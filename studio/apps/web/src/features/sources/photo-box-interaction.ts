import type { PhotoBox } from "@the-way-here/shared";

export type PhotoPoint = { x: number; y: number };
export type PhotoBoxHandle = "n" | "s" | "nw" | "ne" | "sw" | "se";
export const MIN_MANUAL_FACE_SIZE = 0.03;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function photoPoint(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): PhotoPoint {
  return { x: clamp((clientX - rect.left) / rect.width, 0, 1), y: clamp((clientY - rect.top) / rect.height, 0, 1) };
}

export function drawnPhotoBox(start: PhotoPoint, end: PhotoPoint, minimum = MIN_MANUAL_FACE_SIZE): PhotoBox | undefined {
  const box = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  return box.width >= minimum && box.height >= minimum ? box : undefined;
}

export function movePhotoBox(box: PhotoBox, delta: PhotoPoint): PhotoBox {
  return { ...box, x: clamp(box.x + delta.x, 0, 1 - box.width), y: clamp(box.y + delta.y, 0, 1 - box.height) };
}

export function resizePhotoBox(box: PhotoBox, handle: PhotoBoxHandle, delta: PhotoPoint, minimum = MIN_MANUAL_FACE_SIZE): PhotoBox {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (handle.includes("w")) left = clamp(left + delta.x, 0, right - minimum);
  if (handle.includes("e")) right = clamp(right + delta.x, left + minimum, 1);
  if (handle.includes("n")) top = clamp(top + delta.y, 0, bottom - minimum);
  if (handle.includes("s")) bottom = clamp(bottom + delta.y, top + minimum, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
