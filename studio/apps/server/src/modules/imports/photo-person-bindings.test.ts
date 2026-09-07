import { describe, expect, it } from "vitest";
import { parsePhotoPersonBindings, photoPeopleVisibleAnswer } from "./photo-person-bindings.js";

const wrap = (people: unknown[]) => `<photo-people>${JSON.stringify({ people })}</photo-people>`;
const ref = { photoId: "photo-1", personId: "person-1", pageId: "existing-page" };
describe("model photo-person references", () => {
  it("distinguishes missing legacy output from an explicit unresolved list", () => {
    expect(parsePhotoPersonBindings("已完成")).toBeUndefined();
    expect(parsePhotoPersonBindings(wrap([]))).toEqual([]);
    expect(parsePhotoPersonBindings(wrap([ref]))).toEqual([ref]);
    expect(photoPeopleVisibleAnswer(`已完成人物关联。\n${wrap([ref])}`)).toBe("已完成人物关联。");
  });
  it("rejects truncated, invalid, ambiguous and duplicate references", () => {
    for (const output of ["<photo-people>{", "<photo-people>oops</photo-people>", wrap([ref, ref]), wrap([{ ...ref, pagePath: "wiki/person.md" }]), wrap([{ ...ref, personId: "../person" }]), wrap([{ ...ref, pageId: null }]), wrap([{ ...ref, pageId: "\n" }]), wrap(Array(401).fill(ref))]) {
      expect(() => parsePhotoPersonBindings(output)).toThrow();
    }
  });
});
