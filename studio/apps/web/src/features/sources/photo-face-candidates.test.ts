import { describe, expect, it } from "vitest";
import { mergeDetectedFaces, photoBoxesMatch, photoFaceTiles, remapDetectedFace, type DetectedFace } from "./photo-face-candidates";

const face = (x: number, score = .8): DetectedFace => ({ box: { originX: x, originY: 20, width: 40, height: 40 }, keypoints: [{ x: .5, y: .5 }], score });

describe("multi-scale face candidates", () => {
  it("adds overlapping crops along the long edge of group photos", () => {
    expect(photoFaceTiles(1000, 500)).toEqual([{ x: 0, y: 0, width: 640, height: 500 }, { x: 360, y: 0, width: 640, height: 500 }]);
    expect(photoFaceTiles(500, 1000)).toEqual([{ x: 0, y: 0, width: 500, height: 640 }, { x: 0, y: 360, width: 500, height: 640 }]);
    expect(photoFaceTiles(500, 500)).toEqual([]);
  });

  it("maps tile landmarks back to the original image", () => {
    const mapped = remapDetectedFace(face(10), { x: 300, y: 100, width: 400, height: 300 }, 1000, 500);
    expect(mapped.box.originX).toBe(310);
    expect(mapped.box.originY).toBe(120);
    expect(mapped.keypoints[0]).toEqual({ x: .5, y: .5 });
  });

  it("keeps the strongest overlapping result and preserves separate faces", () => {
    expect(mergeDetectedFaces([face(10, .6), face(12, .9), face(100, .7)]).map((item) => item.score)).toEqual([.9, .7]);
    expect(mergeDetectedFaces([face(10, .8), face(29, .7)])).toHaveLength(1);
  });

  it("matches a refreshed detector box to an existing local draft", () => {
    expect(photoBoxesMatch({ x: .1, y: .1, width: .2, height: .2 }, { x: .12, y: .11, width: .19, height: .21 })).toBe(true);
    expect(photoBoxesMatch({ x: .1, y: .1, width: .2, height: .2 }, { x: .6, y: .1, width: .2, height: .2 })).toBe(false);
  });
});
