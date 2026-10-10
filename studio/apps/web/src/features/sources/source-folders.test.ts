import { describe, expect, it } from "vitest";
import { sourceFolderOptions } from "./source-folders";

describe("source folder options", () => {
  it("lists only existing folders after loading, excluding stale selections", () => {
    expect(sourceFolderOptions([{ path: "日记" }, { path: "读书笔记" }, { path: "日记" }], "日记/2026")).toEqual([
      "读书笔记",
      "日记",
    ]);
  });
});
