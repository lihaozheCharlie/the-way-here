import { describe, expect, it } from "vitest";
import type { SectionedPageView, StructuredCard } from "@the-way-here/shared";
import { resolveThinkingModels } from "./thinking-models";

const card = (id: string, title: string, headings: string[]): StructuredCard => ({
  id, title, excerpt: title, sections: headings.map((heading) => ({ heading, body: `${heading}的说明。` })),
});

describe("thinking models", () => {
  it("lists each model page and skips the index", () => {
    const models = resolveThinkingModels([
      card("wiki/09 思维模型/思维模型总览", "思维模型", []),
      card("wiki/09 思维模型/先确认责任链，再补位", "先确认责任链，再补位", ["模型定义", "边界与反例"]),
      card("wiki/09 思维模型/把评价当信息，不当判决", "把评价当信息，不当判决", ["模型定义"]),
    ], undefined);
    expect(models.map((model) => model.title)).toEqual(["先确认责任链，再补位", "把评价当信息，不当判决"]);
    expect(models[0]?.key).toBe("wiki/09 思维模型/先确认责任链，再补位");
  });

  it("keeps an older overview that numbers models inside one page", () => {
    const legacy = { page: { id: "wiki/09 思维模型/思维模型总览" }, sections: [{ heading: "一、先确认责任链", body: "机制。" }, { heading: "说明", body: "不是模型。" }] } as SectionedPageView;
    const models = resolveThinkingModels([card("wiki/09 思维模型/思维模型总览", "思维模型总览", ["一、先确认责任链"])], legacy);
    expect(models.map((model) => model.title)).toEqual(["先确认责任链"]);
    expect(models[0]?.pageId).toBe("wiki/09 思维模型/思维模型总览");
  });
});