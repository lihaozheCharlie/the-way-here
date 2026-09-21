import { parseLifePredictionReport } from "./life-predictions.js";
export interface PredictionEvaluationCase {
 id:string; input:string;
 pages:Array<{id:string;markdown:string}>;
 checks:{ requireInertia:boolean; requireWildcard:boolean; requireConditional:boolean };
}
export interface PredictionEvaluationRun {caseId:string; elapsedMs:number; repairCount:0|1; answer:string}
/** Deterministic acceptance and cost signals; does not pretend to grade narrative truth or calibration. */
export function evaluatePredictionRuns(cases:PredictionEvaluationCase[],runs:PredictionEvaluationRun[]) {
 const results=runs.map(run=>{
  const errors:string[]=[];const c=cases.find(c=>c.id===run.caseId);
  let report:ReturnType<typeof parseLifePredictionReport>|undefined;
  if(!c)errors.push("未知案例");
  if(!Number.isFinite(run.elapsedMs)||run.elapsedMs<0||![0,1].includes(run.repairCount))errors.push("缺少有效耗时或修复次数");
  if(c)try{report=parseLifePredictionReport(run.answer,c.pages);}catch(e){errors.push((e as Error).message);}
  if(report&&c){
   if(c.checks.requireInertia&&!report.scenarios.some(s=>s.pathway==="inertia"))errors.push("缺少惯性基准");
   if(c.checks.requireWildcard&&!report.scenarios.some(s=>s.pathway==="wildcard"))errors.push("缺少随机事件分支");
   if(c.checks.requireConditional&&!report.scenarios.some(s=>s.probabilityBasis==="conditional"))errors.push("未明确条件推演");
  }
  const scenarios=report?.scenarios??[],ds=scenarios.flatMap(s=>s.dimensions);
  return {caseId:run.caseId,passed:errors.length===0,errors,elapsedMs:run.elapsedMs,repairCount:run.repairCount,outputCharacters:run.answer.length,
   unknownProbability:scenarios.filter(s=>s.probability===null).length,probabilities:scenarios.length,
   unknownTradeoff:ds.filter(d=>d.gainShare===null).length,tradeoffs:ds.length,
   signature:scenarios.map(s=>({title:s.title,pathway:s.pathway,probability:s.probability,basis:s.probabilityBasis}))};
 });
 const times=results.map(r=>r.elapsedMs).sort((a,b)=>a-b);
 return {runCount:runs.length,unrunCases:cases.filter(c=>!runs.some(r=>r.caseId===c.id)).map(c=>c.id),
  firstPassSuccessRate:runs.length?results.filter(r=>r.passed&&r.repairCount===0).length/runs.length:null,
  finalSuccessRate:runs.length?results.filter(r=>r.passed).length/runs.length:null,
  medianElapsedMs:times.length?(times[Math.floor((times.length-1)/2)]!+times[Math.floor(times.length/2)]!)/2:null,
  results, note:"签名用于人工比较重复运行的走法与概率；通过不代表概率已校准、语义准确或文案自然。"};
}
