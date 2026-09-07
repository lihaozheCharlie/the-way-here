import type { PhotoBox } from "@the-way-here/shared";

export type FaceTile = { x: number; y: number; width: number; height: number };
export type DetectedFace = {
  box: { originX: number; originY: number; width: number; height: number };
  keypoints: Array<{ x: number; y: number }>;
  score: number;
};

export function photoFaceTiles(width: number, height: number): FaceTile[] {
  if (width / height >= 1.15) {
    const tileWidth = Math.round(width * .64);
    return [{ x: 0, y: 0, width: tileWidth, height }, { x: width - tileWidth, y: 0, width: tileWidth, height }];
  }
  if (height / width >= 1.15) {
    const tileHeight = Math.round(height * .64);
    return [{ x: 0, y: 0, width, height: tileHeight }, { x: 0, y: height - tileHeight, width, height: tileHeight }];
  }
  return [];
}

export function remapDetectedFace(face: DetectedFace, tile: FaceTile, imageWidth: number, imageHeight: number): DetectedFace {
  return {
    ...face,
    box: { ...face.box, originX: face.box.originX + tile.x, originY: face.box.originY + tile.y },
    keypoints: face.keypoints.map((point) => ({ x: (point.x * tile.width + tile.x) / imageWidth, y: (point.y * tile.height + tile.y) / imageHeight })),
  };
}

function intersectionOverUnion(a: DetectedFace["box"], b: DetectedFace["box"]) {
  const width = Math.max(0, Math.min(a.originX + a.width, b.originX + b.width) - Math.max(a.originX, b.originX));
  const height = Math.max(0, Math.min(a.originY + a.height, b.originY + b.height) - Math.max(a.originY, b.originY));
  const intersection = width * height;
  return intersection / (a.width * a.height + b.width * b.height - intersection || 1);
}

function sameFace(a: DetectedFace["box"], b: DetectedFace["box"], overlap: number) {
  if (intersectionOverUnion(a, b) >= overlap) return true;
  const centerDistance = Math.hypot(a.originX + a.width / 2 - b.originX - b.width / 2, a.originY + a.height / 2 - b.originY - b.height / 2);
  return centerDistance <= Math.max(a.width, a.height, b.width, b.height) * .5;
}

export function photoBoxesMatch(a: PhotoBox, b: PhotoBox) {
  return sameFace({ originX: a.x, originY: a.y, width: a.width, height: a.height }, { originX: b.x, originY: b.y, width: b.width, height: b.height }, .3);
}

export function mergeDetectedFaces(faces: DetectedFace[], overlap = .3): DetectedFace[] {
  const kept: DetectedFace[] = [];
  for (const face of [...faces].sort((a, b) => b.score - a.score)) {
    if (!kept.some((candidate) => sameFace(face.box, candidate.box, overlap))) kept.push(face);
  }
  return kept.sort((a, b) => a.box.originX - b.box.originX || a.box.originY - b.box.originY).slice(0, 40);
}
