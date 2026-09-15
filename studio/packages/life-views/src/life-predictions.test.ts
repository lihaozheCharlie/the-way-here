import { readFileSync } from "node:fs";
import { describe,it,expect } from "vitest";
import {parseLifePredictionReport} from "./life-predictions.js";
const sample=JSON.parse(readFileSync(new URL("../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
const pages=[{id:"s",markdown:sample.evidence[0].quote}];
describe("whole-life report boundary",()=>{
  it("supports one shared scenario, honest unknowns and no forced forks",()=>{
    const r=parseLifePredictionReport(JSON.stringify(sample),pages);
    expect(r.scenarios[0].probability).toBeNull();
    expect(r.scenarios[0].forks).toHaveLength(0);
    expect(r.dimensions).toHaveLength(5);
  });
  it("does not force coexisting scenarios to sum to 100",()=>{
    const r=structuredClone(sample);
    r.scenarios[0].probability=60;
    r.scenarios.push({...r.scenarios[0],id:"second",title:"另一种生活安排",probability:70});
    expect(parseLifePredictionReport(JSON.stringify(r),pages).scenarios).toHaveLength(2);
    r.probabilityMode="exclusive";
    expect(()=>parseLifePredictionReport(JSON.stringify(r),pages)).toThrow();
    r.scenarios[1].probability=40;
    expect(parseLifePredictionReport(JSON.stringify(r),pages).scenarios).toHaveLength(2);
  });
  it.each(["quote","missing-dimension","duplicate-evidence","missing-stage","invalid-probability","missing-ref"])("rejects %s",kind=>{
    const r=structuredClone(sample);
    if(kind==="quote") r.evidence[0].quote="没有出现在资料中的事实";
    if(kind==="missing-dimension") r.scenarios[0].dimensions.pop();
    if(kind==="duplicate-evidence") r.evidence.push(r.evidence[0]);
    if(kind==="missing-stage") r.scenarios[0].stages.pop();
    if(kind==="invalid-probability") r.scenarios[0].probability=43;
    if(kind==="missing-ref") r.scenarios[0].evidenceIds=["invented"];
    expect(()=>parseLifePredictionReport(JSON.stringify(r),pages)).toThrow();
  });
});
