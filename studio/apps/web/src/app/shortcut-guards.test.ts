import { describe, expect, it } from "vitest";
import { shortcutSuppressed } from "./shortcut-guards";

describe("desktop shortcut guards", () => {
  const capture = { tagName: "TEXTAREA", closest: (selector: string) => selector === ".life-record-capture" ? {} : null };
  const note = { tagName: "TEXTAREA", closest: () => null };
  const button = { tagName: "BUTTON", closest: () => null };

  it("does not switch libraries while an editable field is focused", () => {
    expect(shortcutSuppressed("knowledge-base:1", note as unknown as EventTarget)).toBe(true);
    expect(shortcutSuppressed("knowledge-base:1", { tagName: "INPUT", type: "search" } as unknown as EventTarget)).toBe(true);
    expect(shortcutSuppressed("knowledge-base:1", { tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(shortcutSuppressed("knowledge-base:1", button as unknown as EventTarget)).toBe(false);
  });

  it("does not detach when capture is submitting with the same shortcut", () => {
    expect(shortcutSuppressed("detach", capture as unknown as EventTarget)).toBe(true);
    expect(shortcutSuppressed("detach", note as unknown as EventTarget)).toBe(false);
  });
});
