import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoLibraryCard } from "./PhotoLibraryCard";
describe("anonymous photo library entry", () => {
  it("keeps a browser fallback without promising unavailable library access", () => {
    const html = renderToStaticMarkup(<PhotoLibraryCard knowledgeBaseId="demo" />);
    expect(html).toContain("从一张照片想起");
    expect(html).toContain("macOS 桌面应用");
    expect(html).not.toContain("允许访问照片库");
    expect(html).not.toContain("<img");
  });
});
