import type { LifePredictionReport, WikiPage } from "@the-way-here/shared";
const dimensions = ["health", "work", "play", "love", "finance"];
/** Validate the readable explanation, not private reasoning or imagined future facts. */
export function parseLifePredictionReport(text: string, pages: Pick<WikiPage,"id"|"markdown">[], options: { requirePresentation?: boolean } = {}): LifePredictionReport {
  const r = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
  const fail = (): never => {throw new Error("完整生活情景的结构或依据不完整，请重新预测");};
  const str = (v: any, max = 180) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const list = (v: any, min=0, max=10) => Array.isArray(v) && v.length >= min && v.length <= max;
  const strings = (v: any, min=0, max=10) => list(v,min,max) && v.every((s: any)=>str(s));
  const four = (v: any) => list(v,4,4) && new Set(v.map((d: any)=>d?.id)).size === 4 && ["health","love","play"].every(id=>v.some((d:any)=>d?.id===id)) && v.every((d: any)=>dimensions.includes(d?.id));
  if (r?.version !== 5 || !str(r.summary,100) || !str(r.horizon,50) || !str(r.current,24) || !four(r.dimensions) || !list(r.evidence,0,40) || !list(r.scenarios,0,5) || !strings(r.gaps) || !strings(r.tensions) || !strings(r.changes) || !["independent","exclusive"].includes(r.probabilityMode) || !str(r.probabilityScope)) fail();
  const modern = options.requirePresentation || r.presentationVersion !== undefined;
  const fieldError = (field: string): never => { throw new Error(`预测结果的 ${field} 字段缺失或格式不正确，请重新预测`); };
  if (modern && r.presentationVersion !== 1) fieldError("presentationVersion");
  if (modern && r.dimensions.some((d:any)=>d.id === "work")) fieldError("dimensions（需包含独立财务维度）");
  const sources = new Map(pages.map(p=>[p.id,p.markdown]));
  const evidenceIds = new Set<string>();
  const quotes = new Set<string>();
  for (const e of r.evidence) {
    if (!str(e?.id,40) || evidenceIds.has(e.id) || !str(e.pageId,1000) || !str(e.cue,40) || !str(e.quote,240) || e.quote.trim().length < 8 || !str(e.interpretation,100) || !sources.get(e.pageId)?.includes(e.quote) || !["fact","wish","plan","action","outcome","hypothesis"].includes(e.kind) || !list(e.dimensions,1,4) || new Set(e.dimensions).size !== e.dimensions.length || !e.dimensions.every((d: any)=>dimensions.includes(d) && (!modern || d !== "work"))) fail();
    const quoteKey = JSON.stringify([e.pageId,e.quote]);
    if (quotes.has(quoteKey)) fail();
    quotes.add(quoteKey);
    evidenceIds.add(e.id);
  }
  const refs = (ids: any, min=0) => strings(ids,min,12) && new Set(ids).size===ids.length && ids.every((id: string)=>evidenceIds.has(id));
  for (const d of r.dimensions) if (!str(d.current) || !str(d.desired) || !strings(d.constraints,0,5) || !refs(d.evidenceIds) || d.evidenceIds.some((id:string)=>r.evidence.find((e:any)=>e.id===id)?.kind==="hypothesis")) fail();
  if (!r.scenarios.length && !r.gaps.length) fail();
  const ids = new Set(), titles = new Set();
  for (const s of r.scenarios) {
    if (modern) {
      if (!["inertia","willed","wildcard"].includes(s?.pathway)) fieldError("pathway（走法）");
      if (!Array.isArray(s.dimensions) || s.dimensions.some((d:any)=>d?.id === "work")) fieldError("scenario.dimensions");
      if (!Array.isArray(s.stages) || s.stages.length !== 4) fieldError("stages（四阶段）");
      for (const d of s.dimensions) {
        if (!d || !d.verdict || !Object.hasOwn(d,"gainShare") || !Array.isArray(d.gains) || !Array.isArray(d.costs) || !Array.isArray(d.notes)) fieldError(`dimensions.${d?.id ?? "unknown"}（结论、占比、收益、代价与注意点）`);
      }
      if (!Array.isArray(s.actions) || s.actions.some((a:any)=>!Array.isArray(a?.dimensions))) fieldError("actions.dimensions");
    }
    if (s?.pathway !== undefined && !str(s.pathway,40)) fail();
    if (!str(s?.id,40) || ids.has(s.id) || !str(s.title,20) || titles.has(s.title) || !(s.probability === null || Number.isInteger(s.probability) && s.probability >= 0 && s.probability <= 100 && s.probability % 5 === 0) || !str(s.probabilityReason) || !["low","medium","high"].includes(s.confidence) || !str(s.week,240) || !str(s.lenses?.work,140) || !str(s.lenses?.life,140) || !str(s.environment,140) || !str(s.choice,90) || !four(s.dimensions) || s.dimensions.some((d:any)=>!r.dimensions.some((current:any)=>current.id===d.id)) || !refs(s.evidenceIds,1) || !strings(s.assumptions,1,8) || !strings(s.counterEvidence,0,5) || !strings(s.unknowns,0,8) || !list(s.actions,1,3) || !list(s.forks,0,2) || !list(s.factors,1,5) || !list(s.stages,3,4)) fail();
    if (s.confidence !== "low" && s.evidenceIds.every((id:string)=>["wish","plan","hypothesis"].includes(r.evidence.find((e:any)=>e.id===id)?.kind))) fail();
    ids.add(s.id); titles.add(s.title);
    for (const d of s.dimensions) if (!str(d.future,140) || !str(d.gain,90) || !str(d.cost,90)) fail();
    for (const d of s.dimensions) {
      if (d.verdict !== undefined && (!str(d.verdict?.label,20) || !["up","mixed","down"].includes(d.verdict?.tone))) fail();
      if (d.gainShare != null && (!Number.isInteger(d.gainShare) || d.gainShare < 0 || d.gainShare > 100)) fail();
      if (d.gains !== undefined && !strings(d.gains,1,5)) fail();
      if (d.costs !== undefined && !strings(d.costs,1,5)) fail();
      if (d.notes !== undefined && (!list(d.notes,0,8) || d.notes.some((n:any)=>!["action","condition","risk"].includes(n?.kind) || !str(n.title,80) || !str(n.detail,240)))) fail();
    }
    const periods = s.stages.length === 4 ? ["months0_3","months3_12","years1_3","years3_5"] : ["year1","years2_3","years4_5"];
    s.stages.forEach((stage: any, i: number)=>{if(stage?.period !== periods[i] || !str(stage.change,140) || !str(stage.condition,140)) fail();});
    for (const a of s.actions) if (!str(a?.action,140) || !str(a.observation,140) || !str(a.reviewAfter,30) || (a.dimensions !== undefined && (!list(a.dimensions,1,4) || new Set(a.dimensions).size !== a.dimensions.length || !a.dimensions.every((d: any)=>dimensions.includes(d) && (!modern || d !== "work"))))) fail();
    for (const f of s.forks) if (!str(f?.condition,140) || !str(f.then,140) || !str(f.otherwise,140)) fail();
    for (const f of s.factors) if (!str(f?.label,30) || !str(f.mechanism,140) || !["support","risk"].includes(f.direction) || ![1,2,3].includes(f.strength)) fail();
  }
  if (r.probabilityMode === "exclusive" && r.scenarios.length && (r.scenarios.some((s: any)=>s.probability===null) || r.scenarios.reduce((sum:number,s:any)=>sum+s.probability,0)!==100)) fail();
  return r;
}
