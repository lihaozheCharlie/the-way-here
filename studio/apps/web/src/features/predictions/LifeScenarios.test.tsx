import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {MemoryRouter} from "react-router-dom";
import {describe,it,expect} from "vitest";
import {DimensionDashboard, LifeScenarios} from "./LifeScenarios";
const report=JSON.parse(readFileSync(new URL("../../../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
describe("whole life scenarios",()=>{
  it("has one integrated perspective and four progressive dimensions",()=>{
    const html=renderToStaticMarkup(<MemoryRouter><LifeScenarios report={report}/></MemoryRouter>);
    expect(html).not.toContain("同一组五年生活");
    expect(html).not.toContain("综合视角");
    expect(html).toContain("暂不能估计");
    for(const label of ["健康","财务","玩乐","爱 / 关系"]) expect(html).toContain(label);
    expect(html).toContain(report.dimensions[0].current);
    expect(html).not.toContain("下一级为所选路线");
    expect(html).not.toContain("可能改变方向的分岔");
  });
  it("switches the dashboard cards to the selected scenario's future/gain/cost",()=>{
    const scenario=report.scenarios[0];
    const withoutScenario=renderToStaticMarkup(<DimensionDashboard report={report}/>);
    const withScenario=renderToStaticMarkup(<DimensionDashboard report={report} scenario={scenario}/>);
    expect(withoutScenario).toContain(report.dimensions[0].current);
    expect(withoutScenario).not.toContain(scenario.dimensions[0].future);
    expect(withScenario).toContain(scenario.dimensions[0].future);
    expect(withScenario).toContain(report.dimensions[0].current);
  });
  it("shows the tagged action under the matching dimension card once a scenario is focused",()=>{
    const scenario=report.scenarios[0];
    const html=renderToStaticMarkup(<DimensionDashboard report={report} scenario={scenario}/>);
    expect(html).toContain(scenario.actions[0].action);
    expect(html).toContain("点开看详情");
  });
  it("keeps dimensions out of branch tiles and shows the selected scenario below",()=>{
    const html=renderToStaticMarkup(<MemoryRouter><LifeScenarios report={report}/></MemoryRouter>);
    expect(html).not.toContain("life-branch-highlights");
    expect(html).toContain("整体节奏");
    expect(html).not.toContain("预测领域");
    expect(html.indexOf("prediction-top-lines")).toBeLessThan(html.indexOf("prediction-branches"));
    expect(html.indexOf("life-scenario-detail")).toBeLessThan(html.indexOf("life-dimensions"));
  });
});


it("preserves actions when optional notes are empty and omits the removed legacy section", () => {
  const scenario = structuredClone(report.scenarios[0]);
  scenario.dimensions.find((d:any)=>d.id === "love").notes = [];
  const html = renderToStaticMarkup(<DimensionDashboard report={report} scenario={scenario}/>);
  expect(html).toContain(scenario.actions[0].action);
  expect(html).toContain(scenario.actions[0].observation);
  expect(html).not.toContain("原报告的工作分析");
});

 it("connects every future to its own pathway, including more than three futures", () => {
   const many = structuredClone(report);
   many.scenarios = Array.from({length:5}, (_,i)=>({...report.scenarios[0],id:`future-${i}`,title:`未来可能${i}`,pathway:`走法${i}`}));
   const html = renderToStaticMarkup(<MemoryRouter><LifeScenarios report={many}/></MemoryRouter>);
   for (let i=0;i<5;i++) {
     expect(html).toContain(`未来可能${i}`);
     expect(html).toContain(`aria-describedby="pathway-future-${i}"`);
     expect(html).toContain(`走法${i}`);
   }
   expect(html).toContain("共 5 种未来可能");
 });
 it("does not invent a pathway for old reports", () => {
   const old = structuredClone(report);
   delete old.scenarios[0].pathway;
   const html = renderToStaticMarkup(<MemoryRouter><LifeScenarios report={old}/></MemoryRouter>);
   expect(html).toContain("走法 · 尚未说明");
 });

it.each([["inertia","按惯性走"],["willed","按意愿改变"],["wildcard","小概率事件"]])("renders %s as a readable edge label",(pathway,label)=>{
  const r=structuredClone(report);r.scenarios[0].pathway=pathway;
  const html=renderToStaticMarkup(<MemoryRouter><LifeScenarios report={r}/></MemoryRouter>);
  expect(html).toContain(`走法 · ${label}`);
});
