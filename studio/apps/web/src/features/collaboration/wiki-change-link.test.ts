import { describe, expect, it } from "vitest";
import { wikiPageIdFromChange } from "./wiki-change-link";

describe("wiki change links", () => {
  it("links a wiki file and ignores source reports", () => {
    expect(wikiPageIdFromChange("demo/wiki/note.md", "demo/wiki")).toBe("wiki/note");
    expect(wikiPageIdFromChange("demo/sources/journey.md", "demo/wiki")).toBeUndefined();
    expect(wikiPageIdFromChange("demo/wiki/01 个人主线/选择.md", "demo/wiki")).toBe("wiki/01 个人主线/选择");
  });
});
