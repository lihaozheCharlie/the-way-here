import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiPageSummary } from "@the-way-here/shared";
import { UnderstandingDigest } from "./UnderstandingDigest";

const mocks = vi.hoisted(() => ({ useApi: vi.fn() }));
vi.mock("../../shared/use-api", () => ({ useApi: mocks.useApi }));
const page: WikiPageSummary = {
  id: "model-selected", title: "当前模型", category: "mental-models", modifiedAt: "2026-09-13",
  relativePath: "wiki/model-selected.md", excerpt: "当前模型摘要", tags: [], aliases: [],
  locations: [], sources: [], isSource: false,
};
const render = () => renderToStaticMarkup(<MemoryRouter><UnderstandingDigest revision={0} /></MemoryRouter>);

beforeEach(() => mocks.useApi.mockReset());
describe("understanding digest provenance", () => {
  it("loads model content from the same page as its title, not the first overview", () => {
    mocks.useApi.mockImplementation((url: string) => ({ loading: false, data:
      url === "/api/pages?sources=false" ? [page, { ...page, id: "overview", title: "模型总览", modifiedAt: "2026-09-14" }]
      : url === "/api/views/cards/cycles" ? []
      : url === "/api/pages/model-selected" ? { sections: [{ heading: "说明", body: "只属于当前模型的内容。" }] }
      : { sections: [{ heading: "一、另一模型", body: "不应串入的其他模型。" }] },
    }));
    const html = render();
    expect(html).toContain("只属于当前模型的内容");
    expect(html).not.toContain("不应串入");
    expect(mocks.useApi).toHaveBeenCalledWith("/api/pages/model-selected", 0);
  });

  it("does not put another cycle's stages under an overview title", () => {
    mocks.useApi.mockImplementation((url: string) => ({ loading: false, data:
      url === "/api/pages?sources=false" ? [{ ...page, id: "cycle-overview", title: "循环总览", category: "cycles" }]
      : [{ id: "unrelated-cycle", title: "其他循环", sections: [{ heading: "触发", body: "其他证据" }] }],
    }));
    expect(render()).not.toContain("展开循环");
  });
});
