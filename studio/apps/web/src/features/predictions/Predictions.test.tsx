import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { PredictionView, PredictionReport } from "@the-way-here/shared";
import { PredictionContent } from "./Predictions";
const view: PredictionView = { knowledgeBaseId: "demo", understanding: {version:1,score:60,threshold:60,unlocked:false,facets:[]},status:"locked",stale:false };
const render = (data: PredictionView) => renderToStaticMarkup(<MemoryRouter><PredictionContent view={data} refresh={() => undefined} busy={false} /></MemoryRouter>);
describe("prediction page states", () => {
  it("uses the server gate and offers records, without a review state switch", () => {
    const html=render(view);
    expect(html).toContain('href="/sources"');
    expect(html).not.toContain('重新预测');
    expect(html).not.toContain('已解锁');
    expect(html).not.toContain('超过 60 分');
    expect(html).not.toContain('写满 40 字');
    expect(html).toContain('扫描 Wiki 了解度');
    expect(html).toContain('textarea');
  });
  it("shows a manual update reminder and restores thoughts without starting a run", () => {
    const html=render({...view,status:"ready",stale:true,thoughts:"已有的当前想法",understanding:{...view.understanding,unlocked:true}});
    expect(html).toContain("有更新，可以重新预测了");
    expect(html).toContain("暂时不用");
    expect(html).toContain("已有的当前想法");
    expect(html).not.toContain("正在预测…");
  });
  it("disables prediction during generation and displays preserved data on failure", () => {
    const ready = {...view, understanding:{...view.understanding,score:76,unlocked:true}};
    expect(render({...ready,status:"running"})).toContain('disabled=""');
    const html=render({...ready,status:"failed",error:"模型不可用"});
    expect(html).toContain('class="prediction-notice prediction-error" role="alert"');
    expect(html).toContain('模型不可用');
    expect(html).toContain('预测自己');
  });
});


describe("concrete work and life paths", () => {
  it("shows only two selectors, five paths, a short root and the imagined daily scene", () => {
    const report: PredictionReport = {
      version: 4, summary: "看看两种生活重心下的选择。", horizon: "未来五年", tensions: [], changes: [],
      domains: (["work", "life"] as const).map(id => ({
        id, title: id === "work" ? "工作" : "生活", current: "正在寻找下一份工作", currentDetail: "更完整的背景单独展开。", gaps: [],
        branches: ["资深工程师", "技术负责人", "独立开发者", "技术顾问", "小团队主管"].map(title => ({ probability: 20, probabilityReason: "当前资料下的相对估计", title, choice: "亲自做产品，减少管理职责", summary: "来自已有经验。", dailyLife: "每天与同事讨论方案，完成产品功能，并跟进使用反馈。", outcomes: ["负责一个完整产品", "继续接零散任务"].map(title => ({probability: 50, probabilityReason: "条件估计", title, summary:"可能的日常状态。", confidence:"medium" as const, conditions:["有实践机会"], factors:[], evidence:[], counterEvidence:[], unknowns:[], actions:[]})) }))
      }))
    };
    const html = render({...view, understanding:{...view.understanding,unlocked:true},status:"ready",report});
    const selectors = html.split('aria-label="预测领域"')[1]!.split('</div>')[0]!;
    expect((selectors.match(/<button/g) || []).length).toBe(2);
    expect(html).toContain('独立开发者');
    expect(html).toContain('20%');
    expect(html).toContain('50%');
    expect(html).toContain('情景概率（估计）');
    expect(html).toContain('每天与同事讨论方案');
    expect(html).not.toContain('想成为的人');
    const root = html.split('class="prediction-root"')[1]!.split('</div>')[0]!;
    expect(root).toContain('正在寻找下一份工作');
    expect(root).not.toContain('更完整的背景');
  });
});
