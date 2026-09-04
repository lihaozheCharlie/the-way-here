import { describe, expect, it } from "vitest";
import { detachFace, groupFaceFeatures, groupedPhotoQueue, normalizedDescriptor, type FaceFeature } from "./photo-face-groups";
import { faceAlignment, faceTensorPixels } from "./photo-face-alignment";
import { parsePhotoDraft } from "./photo-draft";
import type { PhotoMemory } from "@the-way-here/shared";
const vector = (angle: number) => [Math.cos(angle), Math.sin(angle), ...Array(126).fill(0)];
const face = (id: string, photoId: string, angle = 0): FaceFeature => ({ id, photoId, descriptor: vector(angle) });

describe("local suggested face groups", () => {
  it("groups matching faces across photos and leaves other identities separate", () => {
    const groups = groupFaceFeatures([face("a", "1"), face("b", "2", .1), face("c", "3", 2)]);
    expect(groups).toEqual([["a", "b"]]);
  });
  it("never merges two faces from one photo, including through another photo", () => {
    const groups = groupFaceFeatures([face("a", "1"), face("b", "1"), face("c", "2")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
    expect(groups[0]!.includes("a") && groups[0]!.includes("b")).toBe(false);
  });
  it("requires every pair to match rather than chaining weak matches", () => {
    expect(groupFaceFeatures([face("a", "1", 0), face("b", "2", .7), face("c", "3", 1.4)])[0]).toHaveLength(2);
  });
  it("rejects malformed descriptors and ignores low-quality missing results", () => {
    for (const value of [[], Array(128).fill(0), Array(128).fill(NaN), Array(128).fill(Infinity)]) expect(normalizedDescriptor(value)).toBeUndefined();
    expect(groupFaceFeatures([{ ...face("a", "1"), descriptor: [] }, face("b", "2")])).toEqual([]);
  });
  it("detaches a face without changing other groups or rejoining it", () => {
    expect(detachFace([["a", "b", "c"], ["d", "e"]], "a")).toEqual([["b", "c"], ["d", "e"]]);
    expect(detachFace([["a", "b"]], "a")).toEqual([]);
  });
  it("handles the maximum batch without an unbounded similarity search", () => {
    const faces = Array.from({ length: 400 }, (_, i) => face(`face-${i}`, `photo-${Math.floor(i / 40)}`, i % 40 / 20));
    const groups = groupFaceFeatures(faces);
    expect(groups.flat().length).toBeLessThanOrEqual(400);
    for (const group of groups) expect(new Set(group.map((id) => faces.find((face) => face.id === id)!.photoId)).size).toBe(group.length);
  });
  it("restores group IDs but refuses duplicate memberships", () => {
    const draft = { revision: 1, photoId: "photo-1", people: [], peopleDirty: true, story: "", storyDirty: false, faceGroups: [["a", "b"]] };
    expect(parsePhotoDraft(JSON.stringify(draft))?.faceGroups).toEqual([["a", "b"]]);
    expect(parsePhotoDraft(JSON.stringify({ ...draft, faceGroups: [["a", "b"], ["b", "c"]] }))).toBeUndefined();
  });
  it("does not group conflicting user identities or multiple faces in one photo", () => {
    const person = (id: string, pageId?: string) => ({ id, name: pageId ? "已选人物" : "", pageId, useAsAvatar: true, box: { x: 0, y: 0, width: 1, height: 1 } });
    const memory = { photos: [{ id: "p1", people: [person("a", "first"), person("b", "second")] }, { id: "p2", people: [person("c", "third")] }] } as PhotoMemory;
    expect(groupedPhotoQueue(memory, {}, [["a", "c"]])).toHaveLength(3);
    expect(groupedPhotoQueue(memory, { p1: [person("a"), person("b")] }, [["a", "b"]])).toHaveLength(3);
  });
});

describe("SFace alignment and tensor input", () => {
  it("maps the detector landmark template to identity transform", () => {
    const matrix = faceAlignment([{ x: 38.2946, y: 51.6963 }, { x: 73.5318, y: 51.5014 }, { x: 56.0252, y: 71.7366 }, { x: 56.1396, y: 92.2848 }])!;
    matrix.forEach((value, i) => expect(value).toBeCloseTo([1, 0, 0, 1, 0, 0][i]!, 5));
    expect(faceAlignment([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeUndefined();
  });
  it("feeds raw RGB in channel-first order, leaving normalization to the model", () => {
    const pixels = new Uint8ClampedArray(112 * 112 * 4); pixels.set([10, 20, 30, 255]);
    const input = faceTensorPixels(pixels);
    expect([input[0], input[112 * 112], input[2 * 112 * 112]]).toEqual([10, 20, 30]);
  });
});
