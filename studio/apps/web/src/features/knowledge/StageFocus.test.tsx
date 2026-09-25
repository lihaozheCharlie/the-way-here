import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { LifeStageView, WikiPageSummary } from "@the-way-here/shared";
import { StageFocus } from "./StageFocus";

const page = (id: string): WikiPageSummary => ({ id, title: id, relativePath: `wiki/${id}.md`, excerpt: `关于${id}的描述`, category: "events", aliases: [], tags: [], locations: [], sources: [], modifiedAt: "2026-09-22", isSource: false });
const stage = (count: number): LifeStageView => ({ page: page("匿名阶段"), range: "2024—2026", focus: "一段经历", current: true, lane: 0, order: 0, relatedPeople: [page("示例人物")], relatedPlaces: [page("示例地点")], relatedSystems: [page("示例系统")], relatedLetters: [], relatedEvents: Array.from({length:count}, (_,i) => page(`事件${i+1}`)) });
const renderStage = (view: LifeStageView) => renderToStaticMarkup(<MemoryRouter><StageFocus stage={view} revision={0} /></MemoryRouter>);
describe("stage relationships and events", () => {
  it("retains every event in the dense scrolling layout", () => {
    const html = renderStage(stage(9));
    expect(html).toContain('aria-label="9 条关键事件"');
    expect(html.match(/class="stage-event"/g)).toHaveLength(9);
    expect(html).not.toContain('stage-events is-sparse');
    expect(html).not.toContain('转折坐标');
    expect(html).not.toContain('<a ');
  });
  it("includes descriptions and sparse layout for two events and all three graph branches", () => {
    const html = renderStage(stage(2));
    expect(html).toContain('stage-events is-sparse');
    for (const text of ['相关的人', '地点', '生活系统', '示例人物', '示例地点', '示例系统', '关于事件1的描述']) expect(html).toContain(text);
  });
  it("shows honest empty branches and an empty event state", () => {
    const html = renderStage({...stage(0), relatedPeople:[], relatedPlaces:[], relatedSystems:[]});
    expect(html).toContain('这个阶段还没有关联的关键事件');
    expect(html.match(/暂无关联/g)).toHaveLength(3);
  });
});
