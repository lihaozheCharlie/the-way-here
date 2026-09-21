import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {evaluatePredictionRuns} from "./prediction-evaluation.js";
const report=JSON.parse(readFileSync(new URL("../../../test/fixtures/life-prediction.json",import.meta.url),"utf8"));
it("measures first pass, repair, missing cases and invalid evidence without claiming semantic quality",()=>{
 const pages=report.evidence.map((e:any)=>({id:e.pageId,markdown:e.quote}));
 const c={id:"sample",input:"匿名资料",pages,checks:{requireInertia:false,requireWildcard:true,requireConditional:false}};
 const runs=[{caseId:c.id,elapsedMs:1000,repairCount:0 as const,answer:JSON.stringify(report)},{caseId:c.id,elapsedMs:2000,repairCount:1 as const,answer:JSON.stringify(report)},{caseId:c.id,elapsedMs:3000,repairCount:0 as const,answer:"bad json"}];
 const result=evaluatePredictionRuns([c,{...c,id:"unrun"}],runs);
 expect(result.firstPassSuccessRate).toBe(1/3);expect(result.finalSuccessRate).toBe(2/3);expect(result.unrunCases).toEqual(["unrun"]);expect(result.medianElapsedMs).toBe(2000);expect(result.results[0].unknownTradeoff).toBe(8);
});
