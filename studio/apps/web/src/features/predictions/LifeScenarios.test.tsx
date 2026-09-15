import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {MemoryRouter} from "react-router-dom";
import {describe,it,expect} from "vitest";
import {LifeScenarios} from "./LifeScenarios";
const report=JSON.parse(readFileSync(new URL("../../../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
describe("whole life scenarios",()=>{
  it("has two lenses over one scenario and five readable dimensions",()=>{
    const html=renderToStaticMarkup(<MemoryRouter><LifeScenarios report={report}/></MemoryRouter>);
    expect(html).toContain("同一组五年生活");
    expect(html).toContain("暂不能估计");
    expect(html).toContain("五个方面会怎样变化");
    for(const label of ["健康","工作","玩乐","关系","财务"]) expect(html).toContain(label);
    expect(html).not.toContain("下一级为所选路线");
    expect(html).not.toContain("可能改变方向的分岔");
  });
});
