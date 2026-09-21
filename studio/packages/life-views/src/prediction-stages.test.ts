import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {parseLifePredictionReport,parsePredictionOutline,parsePredictionDetail,PredictionValidationError} from "./life-predictions.js";
const report=JSON.parse(readFileSync(new URL("../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
const pages=report.evidence.map((e:any)=>({id:e.pageId,markdown:e.quote}));
const outlineOf=(input:any)=>{const r=structuredClone(input);return ({...r,scenarios:r.scenarios.map(({week,choice,dimensions,stages,actions,...s}:any)=>s)});};
const detailOf=({id,week,choice,dimensions,stages,actions}:any)=>({id,week,choice,dimensions,stages,actions});
it("validates a small outline then separate details and assembles the same report",()=>{
 const outline=parsePredictionOutline(JSON.stringify(outlineOf(report)),pages);
 const scenarios=report.scenarios.map((s:any,i:number)=>parsePredictionDetail(JSON.stringify(detailOf(s)),outline,i,pages));
 expect(parseLifePredictionReport(JSON.stringify({...outline,scenarios}),pages)).toEqual(report);
});
it("rejects full reports in the outline phase and changes to probabilities or IDs in details",()=>{
 expect(()=>parsePredictionOutline(JSON.stringify(report),pages)).toThrow("不支持的字段");
 const outline=parsePredictionOutline(JSON.stringify(outlineOf(report)),pages);
 expect(()=>parsePredictionDetail(JSON.stringify({...detailOf(report.scenarios[0]),probability:95}),outline,0,pages)).toThrow("只允许");
 expect(()=>parsePredictionDetail(JSON.stringify({...detailOf(report.scenarios[0]),id:"other"}),outline,0,pages)).toThrow("ID一致");
});
it("keeps quote and cross-scenario checks in the outline phase",()=>{
 const bad=outlineOf(report);bad.evidence[0]={...bad.evidence[0],quote:"不属于任何冻结资料的伪造引文"};
 expect(()=>parsePredictionOutline(JSON.stringify(bad),pages)).toThrow("连续原文");
 const noWildcard=outlineOf(report);noWildcard.scenarios=noWildcard.scenarios.filter((s:any)=>s.pathway!=="wildcard");
 expect(()=>parsePredictionOutline(JSON.stringify(noWildcard),pages)).toThrow("随机事件");
});
it("reports repairable detail errors against the fragment rather than the entire report",()=>{
 const outline=parsePredictionOutline(JSON.stringify(outlineOf(report)),pages);
 const detail={...detailOf(report.scenarios[0]),week:"长".repeat(141)};
 try{parsePredictionDetail(JSON.stringify(detail),outline,0,pages);throw new Error("should reject");}
 catch(error){expect(error).toBeInstanceOf(PredictionValidationError);expect((error as PredictionValidationError).issues).toContainEqual({path:"$.week",message:"最多140字符",repairable:true});}
});

const wrapped=(value:unknown)=>`已完成检索。\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n以上为当前阶段结果。`;
it("accepts a single wrapped outline, detail and full report without changing their contents",()=>{
 const outline=parsePredictionOutline(wrapped(outlineOf(report)),pages);
 expect(outline).toEqual(outlineOf(report));
 expect(parsePredictionDetail(wrapped(detailOf(report.scenarios[0])),outline,0,pages)).toEqual(report.scenarios[0]);
 expect(parseLifePredictionReport(wrapped(report),pages)).toEqual(report);
 expect(parsePredictionOutline(wrapped(outlineOf(report)).replace("```json","```JSON").replaceAll("\n","\r\n"),pages)).toEqual(outline);
 expect(parsePredictionOutline(wrapped(outlineOf(report)).replace("```json","```"),pages)).toEqual(outline);
});
it("still validates wrapped fields, source quotes and scenario identities",()=>{
 expect(()=>parsePredictionOutline(wrapped(report),pages)).toThrow("不支持的字段");
 const bad=outlineOf(report);bad.evidence[0].quote="不属于冻结资料的伪造原文";
 expect(()=>parsePredictionOutline(wrapped(bad),pages)).toThrow("连续原文");
 const outline=parsePredictionOutline(wrapped(outlineOf(report)),pages);
 expect(()=>parsePredictionDetail(wrapped({...detailOf(report.scenarios[0]),id:"wrong"}),outline,0,pages)).toThrow("ID一致");
});
it.each([
 ()=>wrapped(outlineOf(report))+"\n"+wrapped(outlineOf(report)),
 ()=>wrapped(outlineOf(report))+"\n```text\n第二个代码块\n```",
 ()=>wrapped(outlineOf(report)).replace("```json","```javascript"),
 ()=>"说明文字\n"+JSON.stringify(outlineOf(report)),
 ()=>"```json\n{\"current\":",
 ()=>"```json\n{broken}\n```",
 ()=>"",
])("rejects ambiguous, unsupported or truncated wrappers",makeText=>{
 expect(()=>parsePredictionOutline(makeText(),pages)).toThrow("需要纯JSON对象");
});
