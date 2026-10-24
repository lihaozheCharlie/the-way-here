import { describe, expect, it } from "vitest";
import { photoLibraryBridge } from "./PhotoLibraryCard";
describe("anonymous photo library entry", () => {
  it("hides the unsupported photo source entirely", () => {
    expect(photoLibraryBridge()).toBeUndefined();
  });
});
