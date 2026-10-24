import { describe, expect, it } from "vitest";
import { parsePhotoDraft } from "../sources/photo-draft";
import { photoHandoffDraft, photoPreviewPayload } from "./photo-library-handoff";

describe("photo library handoff", () => {
  it("keeps a jpeg preview as a local still-image payload", () => {
    expect(photoPreviewPayload("data:image/jpeg;base64,aGVsbG8=", "旅行.HEIC")).toEqual({ name: "旅行.jpg", content: "aGVsbG8=", encoding: "base64" });
    expect(() => photoPreviewPayload("data:image/gif;base64,aGVsbG8=", "动图.gif")).toThrow(/JPG/);
  });

  it("stores people and the short note as a local draft, with nothing to send", () => {
    const draft = photoHandoffDraft(" 小林 ", "那天晚饭");
    expect(parsePhotoDraft(JSON.stringify(draft))?.background).toBe("照片里的人：小林\n\n那天晚饭");
    expect(draft).not.toHaveProperty("images");
    expect(photoHandoffDraft("  ", "")).toBeUndefined();
  });
});
