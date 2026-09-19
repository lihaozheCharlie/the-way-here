import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {MemoryRouter} from "react-router-dom";
import {it,expect} from "vitest";
import {DimensionDashboard,LifeScenarios} from "./LifeScenarios";
const report=JSON.parse(readFileSync(new URL("../../../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
const render=(r=report)=>renderToStaticMarkup(<MemoryRouter><LifeScenarios report={r}/></MemoryRouter>);
it("renders current dimensions, direct title and one narrative",()=>{const html=render();for(const name of ["健康","工作","娱乐","爱","为什么可能这样走"])expect(html).toContain(name);expect(html).toContain(report.scenarios[0].overview);expect(html).not.toContain("这次什么改变了判断");});
it("renders each action once inside its dimension",()=>{const html=renderToStaticMarkup(<DimensionDashboard report={report} scenario={report.scenarios[0]}/>);expect(html.split(report.scenarios[0].actions[0].action)).toHaveLength(2);});
it.each([["inertia","顺从惯性"],["willed","遵从意愿"],["wildcard","随机事件"]])("labels %s without triggering an egg on load",(pathway,label)=>{const r=structuredClone(report);r.scenarios[0].pathway=pathway;const html=render(r);expect(html).toContain(label);expect(html).not.toContain("走法 ·");expect(html).not.toContain("愿你保持清醒");});
it("labels conditional probabilities on the node itself",()=>{const r=structuredClone(report);Object.assign(r.scenarios[0],{probability:65,probabilityBasis:"conditional",probabilityCondition:"有固定空闲时间"});expect(render(r)).toContain("65% · 假设成立时");});
it("supports five futures and current state",()=>{const r=structuredClone(report);r.scenarios=Array.from({length:5},(_,i)=>({...r.scenarios[0],id:`s${i}`,title:`未来${i}`}));expect(render(r)).toContain("共 5 种未来可能");expect(renderToStaticMarkup(<DimensionDashboard report={r}/>)).not.toContain(r.scenarios[0].dimensions[0].future);});

it("shows the random result as a regular node and removes the gaps panel",()=>{const html=render({...report,gaps:["旧报告缺口"]});expect(html).toContain(report.scenarios.find((s:any)=>s.pathway==="wildcard").title);expect(html).not.toContain("尚待了解");expect(html).not.toContain("旧报告缺口");expect(render({...report,scenarios:[]})).toContain("补充近期的工作、居住或生活安排");});
