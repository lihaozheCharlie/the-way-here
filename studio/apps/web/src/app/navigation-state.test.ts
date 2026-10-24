import { describe, expect, it } from "vitest";
import { activeKnowledgeChild, isSourceDocument, pageIdFromPathname } from "./navigation-state";

const sourcePath = "/page/sources/%E6%97%A5%E8%AE%B0/%E4%BB%8A%E5%A4%A9";
const wikiPath = "/page/wiki/01%20%E4%B8%AA%E4%BA%BA%E4%B8%BB%E7%BA%BF/%E9%80%89%E6%8B%A9";

describe("reader navigation", () => {
  it("decodes each reader path segment", () => {
    expect(pageIdFromPathname(wikiPath)).toBe("wiki/01 个人主线/选择");
    expect(pageIdFromPathname("/sources")).toBe("");
  });

  it("treats a life record as 生活记录 even when opened without return state", () => {
    expect(isSourceDocument(sourcePath, undefined, undefined)).toBe(true);
    expect(activeKnowledgeChild(sourcePath, undefined, undefined)).toBeUndefined();
  });

  it("keeps a wiki page under 已有理解 when it was opened from a life record", () => {
    expect(isSourceDocument(wikiPath, undefined, "/sources?file=sources/日记/今天")).toBe(false);
    expect(activeKnowledgeChild(wikiPath, "/sources?file=sources/日记/今天", { pageId: "wiki/01 个人主线/选择", isSource: false, category: "personal-lines" })).toBe("/insights");
  });

  it("follows the page the reader came from, then the page category", () => {
    const loaded = { pageId: "wiki/01 个人主线/选择", isSource: false, category: "personal-lines" };
    expect(activeKnowledgeChild(wikiPath, "/timeline?stage=wiki/stage", loaded)).toBe("/timeline");
    expect(activeKnowledgeChild(wikiPath, undefined, loaded)).toBe("/insights");
    expect(activeKnowledgeChild(wikiPath, "/letters", { ...loaded, category: "entities" })).toBe("/letters");
  });

  it("trusts the loaded page when the folder name is not the default sources root", () => {
    const pathname = "/page/notes/%E4%BB%8A%E5%A4%A9";
    expect(isSourceDocument(pathname, undefined, "/knowledge")).toBe(false);
    expect(isSourceDocument(pathname, undefined, "/knowledge", "?from=source")).toBe(true);
    expect(isSourceDocument(pathname, { pageId: "notes/今天", isSource: true, category: "sources" }, "/knowledge")).toBe(true);
    expect(isSourceDocument(pathname, { pageId: "notes/今天", isSource: false, category: "personal-lines" }, "/sources", "?from=source")).toBe(false);
  });
});
