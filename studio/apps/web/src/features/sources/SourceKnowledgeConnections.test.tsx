import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { SourceKnowledgeConnections } from "./Sources";

const page = (id: string, category: WikiPageSummary["category"] = "events"): WikiPageSummary => ({ id, title: id, relativePath: `wiki/${id}.md`, excerpt: `关于${id}的描述`, category, aliases: [], tags: [], locations: [], sources: [], modifiedAt: "2026-10-11", isSource: category === "sources" });
const render = (relatedPages: WikiPageSummary[]) => renderToStaticMarkup(<MemoryRouter initialEntries={["/sources?file=record"]}><SourceKnowledgeConnections page={{ ...page("record", "sources"), markdown: "原始记录", relatedPages } as WikiPage} /></MemoryRouter>);

describe("source related results", () => {
  it("features a related letter before the first eight ordinary results without duplicating it", () => {
    const html = render([...Array.from({ length: 9 }, (_, i) => page(`事件${i}`)), page("回信", "letters"), page("其他回信", "letters")]);
    expect(html).toContain('查看关联结果 · 11');
    expect(html.indexOf('class="source-letter-feature')).toBeLessThan(html.indexOf('class="source-related-knowledge"'));
    expect(html).toContain('href="/letters?letter=%E5%9B%9E%E4%BF%A1"');
    expect(html.match(/关于回信的描述/g)).toHaveLength(1);
    expect(html).toContain('查看全部 10 个关联页面');
    expect(html).not.toContain('事件8</b>');
  });
  it("keeps ordinary sources visible and hides maintenance pages when no letter exists", () => {
    const html = render([page("另一篇日记", "sources"), page("事件"), page("维护", "maintenance")]);
    expect(html).toContain('查看关联结果 · 2');
    expect(html).toContain('另一篇日记');
    expect(html).not.toContain('source-letter-feature');
    expect(html).not.toContain('维护');
  });
  it("supports a letter by itself and an empty result", () => {
    const html = render([page("回信", "letters")]);
    expect(html).toContain('source-letter-feature');
    expect(html).not.toContain('source-related-knowledge');
    expect(render([])).toBe('');
  });
  it("shows English link chrome when the desktop locale is English", () => {
    const store = new Map([["desktop.locale", "en"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => store.clear(),
    });
    try {
      const html = render([...Array.from({ length: 9 }, (_, i) => page(`事件${i}`)), page("回信", "letters")]);
      expect(html).toContain("See linked results · 10");
      expect(html).toContain("See all 9 linked pages");
      expect(html).toContain('aria-label="Pages linked from this source record"');
      expect(html).not.toContain("查看关联结果");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
