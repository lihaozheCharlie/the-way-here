import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {MemoryRouter} from "react-router-dom";
import {describe,it,expect} from "vitest";
import {DimensionDashboard, LifeScenarios} from "./LifeScenarios";
const report=JSON.parse(readFileSync(new URL("../../../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
describe("whole life scenarios",()=>{
  it("has two lenses over one scenario and four readable dimensions, defaulting to current state",()=>{
    const html=renderToStaticMarkup(<MemoryRouter><LifeScenarios report={report}/></MemoryRouter>);
    expect(html).toContain("同一组五年生活");
    expect(html).toContain("暂不能估计");
    for(const label of ["健康","工作","玩乐","爱"]) expect(html).toContain(label);
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
    expect(withScenario).not.toContain(report.dimensions[0].current);
  });
});
