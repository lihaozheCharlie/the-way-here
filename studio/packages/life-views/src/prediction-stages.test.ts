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
