import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {parseLifePredictionReport,PredictionValidationError,applyPredictionRepairs} from "./life-predictions.js";
const sample=JSON.parse(readFileSync(new URL("../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
const pages=sample.evidence.map((e:any)=>({id:e.pageId,markdown:e.quote}));
const parse=(r:any)=>parseLifePredictionReport(JSON.stringify(r),pages);
describe("current prediction contract",()=>{
 it("accepts four dimensions, exact quotes and explicit unknowns",()=>{expect(parse(sample)).toEqual(sample);});
 it.each(["presentationVersion","pathwayAssessment","changes","tensions","summary","domains"])("rejects removed field %s",field=>{expect(()=>parse({...sample,[field]:[]})).toThrow(field);});
 it.each([undefined,1,6,7,999,"unknown"])("ignores obsolete version metadata %s",version=>{expect(parse({...sample,version,gaps:["旧缺口"]})).toEqual(sample);});
 it.each(["gain","cost"])("rejects obsolete dimension field %s",field=>{const r=structuredClone(sample);r.scenarios[0].dimensions[0][field]="旧数据";expect(()=>parse(r)).toThrow(field);});
 it.each(["finance","other"])("rejects non-HWPL dimension %s",id=>{const r=structuredClone(sample);r.dimensions[0].id=id;expect(()=>parse(r)).toThrow("dimensions");});
 it("keeps overall and conditional probabilities distinct without forcing a sum",()=>{const r=structuredClone(sample);r.scenarios[0].probability=65;const s={...structuredClone(r.scenarios[0]),id:"s2",title:"不同生活",probability:80,probabilityBasis:"conditional",probabilityCondition:"每周能腾出两天"};r.scenarios.push(s);expect(parse(r).scenarios).toHaveLength(3);s.probabilityCondition=null as any;expect(()=>parse(r)).toThrow("probabilityCondition");});
 it.each([20,35,50,65,80,null])("accepts subjective tradeoff band %s",gainShare=>{const r=structuredClone(sample);r.scenarios[0].dimensions[0].gainShare=gainShare;expect(parse(r).scenarios[0].dimensions[0].gainShare).toBe(gainShare);});
 it("rejects fake precision and duplicated action notes",()=>{const r=structuredClone(sample);r.scenarios[0].dimensions[0].gainShare=61;expect(()=>parse(r)).toThrow("gainShare");r.scenarios[0].dimensions[0].gainShare=null;r.scenarios[0].dimensions[0].notes=[{kind:"action",title:"做事",detail:"试一试"}];expect(()=>parse(r)).toThrow("kind");});
 it("rejects hallucinated sources, nonexistent references and hypothetical current facts",()=>{const r=structuredClone(sample);r.evidence[0].pageId="missing";expect(()=>parse(r)).toThrow("quote");r.evidence[0].pageId=sample.evidence[0].pageId;r.scenarios[0].evidenceIds=["missing"];expect(()=>parse(r)).toThrow("evidenceIds");r.scenarios[0].evidenceIds=[r.evidence[0].id];r.evidence[0].kind="hypothesis";r.dimensions[0].evidenceIds=[r.evidence[0].id];expect(()=>parse(r)).toThrow("当前状态不得引用假设");});
 it("reports multiple exact paths and repairs only identified text leaves",()=>{const r=structuredClone(sample);r.scenarios[0].title="长".repeat(25);r.scenarios[0].week="长".repeat(150);let issues:any[]=[];try{parse(r);}catch(e){expect(e).toBeInstanceOf(PredictionValidationError);issues=(e as PredictionValidationError).issues;}expect(issues.map(i=>i.path)).toEqual(["$.scenarios[0].title","$.scenarios[0].week"]);const fixed=applyPredictionRepairs(JSON.stringify(r),JSON.stringify({repairs:[{path:issues[0].path,value:"回到本地工作"},{path:issues[1].path,value:"平日工作，周末陪家人。"}]}),issues);expect(parseLifePredictionReport(fixed,pages).scenarios[0].probability).toBe(r.scenarios[0].probability);expect(()=>applyPredictionRepairs(JSON.stringify(r),JSON.stringify({repairs:[{path:"$.scenarios[0].probability",value:"100"}]}),issues)).toThrow();});
 it("requires a random branch but permits an empty report",()=>{const r=structuredClone(sample);r.scenarios=r.scenarios.filter((s:any)=>s.pathway!=="wildcard");expect(()=>parse(r)).toThrow("随机事件");r.scenarios=[];expect(parse(r).scenarios).toEqual([]);});
 it.each([null,[],{}, {version:6,evidence:[null]}, {version:6,scenarios:[null]}])("fails malformed output with actionable validation errors",r=>{expect(()=>parse(r)).toThrow(PredictionValidationError);});
});

it("can repair a wrapped candidate with a wrapped patch while retaining the field allowlist",()=>{
 const wrap=(value:unknown)=>"说明\n```json\n"+JSON.stringify(value)+"\n```\n结束";
 const candidate={...structuredClone(sample),current:"长".repeat(181)};
 const issues=[{path:"$.current",message:"过长",repairable:true}];
 const fixed=applyPredictionRepairs(wrap(candidate),wrap({repairs:[{path:"$.current",value:sample.current}]}),issues);
 expect(parseLifePredictionReport(fixed,pages)).toEqual(sample);
 expect(()=>applyPredictionRepairs(wrap(candidate),wrap({repairs:[{path:"$.scenarios[0].probability",value:"100"}]}),issues)).toThrow("修复越过字段边界");
});
