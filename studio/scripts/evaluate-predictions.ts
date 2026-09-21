import {readFile} from "node:fs/promises";
import {evaluatePredictionRuns,type PredictionEvaluationCase,type PredictionEvaluationRun} from "../packages/life-views/src/prediction-evaluation.js";
const [casesFile,runsFile]=process.argv.slice(2);
if(!casesFile||!runsFile)throw new Error("用法：evaluate-predictions.ts <cases.json> <runs.jsonl>");
const cases=JSON.parse(await readFile(casesFile,"utf8")) as PredictionEvaluationCase[];
const runs=(await readFile(runsFile,"utf8")).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)) as PredictionEvaluationRun[];
const result=evaluatePredictionRuns(cases,runs);process.stdout.write(JSON.stringify(result,null,2)+"\n");
if(result.results.some(r=>!r.passed))process.exitCode=1;
