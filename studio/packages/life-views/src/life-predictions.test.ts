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
    expect(r.dimensions).toHaveLength(4);
    expect(r.dimensions.map((d)=>d.id).sort()).toEqual(["health","love","play","work"]);
  });
  it("keeps finance-related context inside the health dimension", () => {
    const r = parseLifePredictionReport(JSON.stringify(sample), pages);
    const health = r.dimensions.find((d) => d.id === "health");
    expect(health?.current).toContain("收入");
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
  it.each(["quote","missing-dimension","duplicate-evidence","missing-stage","invalid-probability","missing-ref","invalid-action-dimension"])("rejects %s",kind=>{
    const r=structuredClone(sample);
    if(kind==="quote") r.evidence[0].quote="没有出现在资料中的事实";
    if(kind==="missing-dimension") r.scenarios[0].dimensions.pop();
    if(kind==="duplicate-evidence") r.evidence.push(r.evidence[0]);
    if(kind==="missing-stage") r.scenarios[0].stages.pop();
    if(kind==="invalid-probability") r.scenarios[0].probability=43;
    if(kind==="missing-ref") r.scenarios[0].evidenceIds=["invented"];
    if(kind==="invalid-action-dimension") r.scenarios[0].actions[0].dimensions=["invalid"];
    expect(()=>parseLifePredictionReport(JSON.stringify(r),pages)).toThrow();
  });
  it("keeps an action's tagged dimensions so the path's 'how to get there' is traceable",()=>{
    const r=parseLifePredictionReport(JSON.stringify(sample),pages);
    expect(r.scenarios[0].actions[0].dimensions).toEqual(["love"]);
  });
  it("accepts actions without a dimensions tag for backward compatibility",()=>{
    const r=structuredClone(sample);
    delete r.scenarios[0].actions[0].dimensions;
    expect(()=>parseLifePredictionReport(JSON.stringify(r),pages)).not.toThrow();
  });
});


describe("progressive dimension contract", () => {
  const modern = () => {
    const r = structuredClone(sample);
    r.dimensions.find((d:any)=>d.id === "work").id = "finance";
    const dim = r.scenarios[0].dimensions.find((d:any)=>d.id === "work");
    Object.assign(dim, {id:"finance", verdict:{label:"有得有失",tone:"mixed"}, gainShare:40, gains:["时间自主"], costs:["收入波动"], notes:[{kind:"condition",title:"先确认储备",detail:"确认生活成本是否够用。"}]});
    r.scenarios[0].stages = ["months0_3","months3_12","years1_3","years3_5"].map(period=>({period,change:"验证生活安排",condition:"条件仍成立"}));
    return r;
  };
  it("accepts independent finance with nested notes and honest proportions", () => {
    const r = parseLifePredictionReport(JSON.stringify(modern()), pages);
    expect(r.scenarios[0].dimensions.find(d=>d.id === "finance")?.notes?.[0].kind).toBe("condition");
  });
  it.each(["share", "tone", "note", "mismatch"])("rejects invalid presentation field %s", kind => {
    const r = modern(); const dim = r.scenarios[0].dimensions.find((d:any)=>d.id === "finance");
    if (kind === "share") dim.gainShare = 101;
    if (kind === "tone") dim.verdict.tone = "certain";
    if (kind === "note") dim.notes[0].kind = "unknown";
    if (kind === "mismatch") dim.id = "work";
    expect(()=>parseLifePredictionReport(JSON.stringify(r),pages)).toThrow();
  });
});

 describe("scenario pathway compatibility",()=>{
   it("preserves the edge attribute and accepts older reports without it",()=>{
     expect(parseLifePredictionReport(JSON.stringify(sample),pages).scenarios[0].pathway).toBe(sample.scenarios[0].pathway);
     const old=structuredClone(sample); delete old.scenarios[0].pathway;
     expect(parseLifePredictionReport(JSON.stringify(old),pages).scenarios[0].pathway).toBeUndefined();
   });
   it.each(["", " ", 42, null, "路".repeat(41)])("rejects invalid pathway %s",pathway=>{
     const r=structuredClone(sample); r.scenarios[0].pathway=pathway;
     expect(()=>parseLifePredictionReport(JSON.stringify(r),pages)).toThrow();
   });
 });

describe("required current presentation",()=>{
  const modern = () => JSON.parse(readFileSync(new URL("../../../test/fixtures/life-prediction-presentation.json",import.meta.url),"utf8"));
  it.each(["inertia","willed","wildcard"])("accepts pathway %s and explicit unknown shares",pathway=>{
    const r=modern();r.scenarios[0].pathway=pathway;
    expect(parseLifePredictionReport(JSON.stringify(r),pages,{requirePresentation:true}).scenarios[0].dimensions[0].gainShare).toBeNull();
  });
  it.each([0,35,100])("preserves known share %s",gainShare=>{
    const r=modern();r.scenarios[0].dimensions[0].gainShare=gainShare;
    expect(parseLifePredictionReport(JSON.stringify(r),pages,{requirePresentation:true}).scenarios[0].dimensions[0].gainShare).toBe(gainShare);
  });
  it.each(["pathway","verdict","gainShare","gains","costs","notes","stages","revision"])("rejects incomplete %s from new generations",field=>{
    const r=modern();const s=r.scenarios[0];
    if(field==="pathway")s.pathway="随便走";
    else if(field==="stages")s.stages.pop();
    else if(field==="revision")delete r.presentationVersion;
    else delete s.dimensions[0][field];
    expect(()=>parseLifePredictionReport(JSON.stringify(r),pages,{requirePresentation:true})).toThrow();
  });
  it("accepts old archives only through compatibility parsing",()=>{
    expect(()=>parseLifePredictionReport(JSON.stringify(sample),pages)).not.toThrow();
    expect(()=>parseLifePredictionReport(JSON.stringify(sample),pages,{requirePresentation:true})).toThrow("presentationVersion");
  });
});
