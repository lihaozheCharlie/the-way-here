import type { UnderstandingScore, WikiPage } from "@the-way-here/shared";
export interface UnderstandingPolicy { assessment: { version:number; threshold:number; facets:Array<{id:string;label:string;max:number}> } }

export function parseUnderstandingScan(text: string, pages: Pick<WikiPage, "id" | "markdown" | "isSource">[], policy: UnderstandingPolicy): UnderstandingScore {
  const config = policy.assessment!;
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
  const fail = (): never => { throw new Error("了解度扫描结果或依据不完整，请重新扫描"); };
  if (!config || value?.version !== config.version || !Array.isArray(value.facets) || value.facets.length !== config.facets.length) fail();
  const wiki = new Map(pages.filter(p => !p.isSource).map(p => [p.id,p.markdown]));
  const facets = config.facets.map(rule => {
    const matches = value.facets.filter((f: any) => f?.id === rule.id);
    if (matches.length !== 1) fail();
    const f = matches[0];
    if (!Number.isInteger(f.level) || f.level < 0 || f.level > 4 || typeof f.reason !== "string" || !f.reason.trim() || f.reason.length > 120 || !Array.isArray(f.gaps) || f.gaps.length > 3 || f.gaps.some((g: any) => typeof g !== "string" || !g.trim() || g.length > 180) || !Array.isArray(f.evidence) || f.evidence.length > 3 || (f.level > 0 && !f.evidence.length)) fail();
    for (const e of f.evidence) if (typeof e?.quote !== "string" || e.quote.trim().length < 8 || e.quote.length > 240 || !wiki.get(e.pageId)?.includes(e.quote)) fail();
    return {...rule,value:Math.floor(rule.max*f.level/4),observed:f.level,target:4,reason:f.reason,gaps:f.gaps,evidence:f.evidence};
  });
  const score = facets.reduce((n,f)=>n+f.value,0);
  return {version:config.version,score,threshold:config.threshold,unlocked:score >= config.threshold,facets};
}
