import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { AgentAnswer } from "./AgentAnswer";
import { citationFromHref, citationPageId } from "./answer-citations";

const run = { status: "completed", changes: [] } as unknown as WikiRun;

describe("agent answer citations", () => {
  it("replaces a bracketed source path with one compact citation button and its file-name tooltip", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AgentAnswer answer="这段记录可以核对（[[sources/日记/2025.01.02 示例记录]]）。" run={run} /></MemoryRouter>);
    expect(html).toContain('class="agent-citation-button"');
    expect(html).toContain('role="tooltip">2025.01.02 示例记录</span>');
    expect(html).not.toContain("[[sources/日记/");
    expect(html).not.toContain("（<button");
  });

  it("keeps code examples and ordinary links intact", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AgentAnswer answer={'`[[sources/example]]` 和 [普通链接](/page/wiki/example)'} run={run} /></MemoryRouter>);
    expect(html).toContain("[[sources/example]]");
    expect(html).toContain("普通链接");
    expect(html).not.toContain('class="agent-citation-button"');
  });

  it("uses indexed page ids for vault paths and rejects traversal", () => {
    expect(citationPageId("vault/demo/sources/日记/示例.md:12|示例")).toBe("sources/日记/示例");
    expect(citationFromHref("/page/sources/%E6%97%A5%E8%AE%B0/%E7%A4%BA%E4%BE%8B?agentCitation=%E7%A4%BA%E4%BE%8B")).toEqual({ pageId: "sources/日记/示例", fileName: "示例" });
    expect(citationPageId("../other-library/secret")).toBeUndefined();
  });
});
