import { describe, expect, it } from "vitest";
import { apiPageHref, isSourceSectionPage, mentalModelHref, pageDestination, returnContextFor } from "./routing";

describe("page destinations", () => {
  it("opens a recent letter in the dedicated letter reader", () => {
    expect(pageDestination({
      id: "wiki/12 近况对话/2026-09-03 能力是在悬而未决里长出来的",
      category: "letters",
    })).toBe("/letters?letter=wiki%2F12+%E8%BF%91%E5%86%B5%E5%AF%B9%E8%AF%9D%2F2026-09-03+%E8%83%BD%E5%8A%9B%E6%98%AF%E5%9C%A8%E6%82%AC%E8%80%8C%E6%9C%AA%E5%86%B3%E9%87%8C%E9%95%BF%E5%87%BA%E6%9D%A5%E7%9A%84");
  });

  it("keeps ordinary knowledge pages in the standalone reader", () => {
    expect(pageDestination({ id: "wiki/01 个人主线/选择", category: "personal-lines" })).toBe("/page/wiki/01%20%E4%B8%AA%E4%BA%BA%E4%B8%BB%E7%BA%BF/%E9%80%89%E6%8B%A9");
  });

  it("marks source pages so the sidebar stays on life records after reload", () => {
    expect(pageDestination({ id: "sources/日记/今天", category: "sources", isSource: true })).toBe("/page/sources/%E6%97%A5%E8%AE%B0/%E4%BB%8A%E5%A4%A9?from=source");
    expect(isSourceSectionPage("/page/sources/today", "?from=source", null)).toBe(true);
    expect(isSourceSectionPage("/page/sources/today", "", null)).toBe(true);
    expect(isSourceSectionPage("/page/sources/today", "", { returnTo: "/sources", returnLabel: "返回生活记录" })).toBe(true);
    expect(isSourceSectionPage("/page/wiki/note", "", { returnTo: "/sources", returnLabel: "返回生活记录" })).toBe(false);
    expect(isSourceSectionPage("/page/wiki/note", "", { returnTo: "/search", returnLabel: "返回搜索结果" })).toBe(false);
    expect(isSourceSectionPage("/knowledge", "?from=source", null)).toBe(false);
  });

  it("encodes reader API paths so spaces and reserved characters stay in the path", () => {
    expect(apiPageHref("wiki/01 个人主线/选择?还是#留下")).toBe("/api/pages/wiki/01%20%E4%B8%AA%E4%BA%BA%E4%B8%BB%E7%BA%BF/%E9%80%89%E6%8B%A9%3F%E8%BF%98%E6%98%AF%23%E7%95%99%E4%B8%8B");
  });

  it("names the life-path page and opens one thinking model", () => {
    expect(returnContextFor("/timeline").returnLabel).toBe("返回人生轨迹");
    expect(returnContextFor("/predict-self").returnLabel).toBe("返回看见未来");
    expect(mentalModelHref("一、先确认责任链")).toBe(`/mental-models?${new URLSearchParams({ model: "一、先确认责任链" })}`);
  });
});
