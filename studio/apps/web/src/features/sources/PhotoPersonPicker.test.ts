import { describe, expect, it } from "vitest";
import { matchingPhotoAliases, matchingPhotoPeople } from "./PhotoPersonPicker";

const people = [
  { id: "lin", title: "林晓", aliases: ["小林", "Xiao Lin", "林同学"] },
  { id: "chen", title: "陈宁", aliases: ["小林"] },
  { id: "zhou", title: "周远" },
];

describe("photo person name and alias search", () => {
  it("finds aliases while preserving canonical names and page IDs", () => {
    expect(matchingPhotoPeople(people, "同学")).toEqual([people[0]]);
    expect(matchingPhotoAliases(people[0]!, "同学")).toEqual(["林同学"]);
  });
  it("ignores case and surrounding query spaces", () => {
    expect(matchingPhotoPeople(people, "  XIAO  ")).toEqual([people[0]]);
    expect(matchingPhotoAliases(people[0]!, "  XIAO  ")).toEqual(["Xiao Lin"]);
  });
  it("keeps ambiguous alias matches separate instead of merging identities", () => {
    expect(matchingPhotoPeople(people, "小林").map((person) => person.id)).toEqual(["lin", "chen"]);
  });
  it("returns one row per person even when both name and multiple aliases match", () => {
    expect(matchingPhotoPeople(people, "林")).toEqual([people[0], people[1]]);
  });
  it("preserves name, empty-query and missing-alias behavior", () => {
    expect(matchingPhotoPeople(people, "周远")).toEqual([people[2]]);
    expect(matchingPhotoPeople(people, " ")).toEqual(people);
    expect(matchingPhotoAliases(people[0]!, " ")).toEqual([]);
    expect(matchingPhotoPeople(people, "无匹配")).toEqual([]);
  });
});
