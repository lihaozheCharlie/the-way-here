import { describe, expect, test } from "vitest";
import { isTruncatedText } from "./TruncatedTextTooltip";

describe("truncated text tooltip", () => {
  test("detects a clipped single-line ellipsis", () => {
    expect(isTruncatedText({ clientHeight: 20, clientWidth: 120, lineClamp: "none", scrollHeight: 20, scrollWidth: 180, textOverflow: "ellipsis" })).toBe(true);
  });

  test("does not show for ellipsis styles when the whole value fits", () => {
    expect(isTruncatedText({ clientHeight: 20, clientWidth: 120, lineClamp: "none", scrollHeight: 20, scrollWidth: 120, textOverflow: "ellipsis" })).toBe(false);
  });

  test("detects a clipped multi-line value", () => {
    expect(isTruncatedText({ clientHeight: 44, clientWidth: 240, lineClamp: "2", scrollHeight: 88, scrollWidth: 240, textOverflow: "clip" })).toBe(true);
  });

  test("ignores ordinary overflow containers that are not text truncation", () => {
    expect(isTruncatedText({ clientHeight: 44, clientWidth: 240, lineClamp: "none", scrollHeight: 88, scrollWidth: 300, textOverflow: "clip" })).toBe(false);
  });
});
