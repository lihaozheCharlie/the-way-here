import type { PredictionReport, UnderstandingScore, WikiPage } from "@the-way-here/shared";

export interface UnderstandingPolicy {
  assessment?: { version: number; threshold: number; facets: Array<{id:string;label:string;max:number}> };
  version: number; threshold: number; minimumBodyLength: number; excludedCategories: string[]; recentWindowDays: number; decisionCategories: string[];
  facets: Array<{ id: string; label: string; max: number; target: number; metric: string }>;
}

/** Record dates may live in metadata or diary filenames; file modification time is not evidence. */
function sourceDate(page: WikiPage): number | undefined {
  for (const value of [page.end, page.start, page.title || page.id.split("/").at(-1)]) {
    const match = value?.trim().match(/^(\d{4})[-./,，年](\d{1,2})[-./,，月](\d{1,2})(?!\d)/);
    if (!match) continue;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.getTime();
  }
  return undefined;
}

/** Policy belongs to knowledge-engine; this evaluator only measures its declared evidence metrics. */
export function scoreUnderstanding(pages: WikiPage[], policy: UnderstandingPolicy, now = Date.now()): UnderstandingScore {
  const byId = new Map(pages.map(page => [page.id, page]));
  const sources = new Map<string, WikiPage>();
  for (const page of pages.filter(page => page.isSource && page.markdown.trim().length >= policy.minimumBodyLength)) {
    const normalized = page.markdown.replace(/\s+/g, " ").trim();
    if (!sources.has(normalized)) sources.set(normalized, page);
  }
  const sourceIds = new Set([...sources.values()].map(page => page.id));
  const unique = new Map<string, WikiPage>();
  for (const page of pages.filter(page => !page.isSource && !policy.excludedCategories.includes(page.category))) {
    if (page.markdown.trim().length < policy.minimumBodyLength) continue;
    if (!page.outgoingLinks.some(link => link.resolvedId && sourceIds.has(link.resolvedId) && !link.ambiguous)) continue;
    unique.set(page.markdown.replace(/\s+/g, " ").trim(), page);
  }
  const grounded = [...unique.values()];
  const referenced = new Set(grounded.flatMap(page => page.outgoingLinks.flatMap(link => link.resolvedId && sourceIds.has(link.resolvedId) && !link.ambiguous ? [link.resolvedId] : [])));
  const current = new Date(now);
  const today = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
  const dates = [...referenced].flatMap(id => {
    const page = byId.get(id)!;
    const date = sourceDate(page);
    return date !== undefined && date <= today ? [date] : [];
  });
  const metrics: Record<string, number> = {
    categories: new Set(grounded.map(page => page.category)).size,
    groundedPages: grounded.length,
    spanDays: dates.length > 1 ? Math.floor((Math.max(...dates) - Math.min(...dates)) / 86400000) : 0,
    decisions: grounded.filter(page => policy.decisionCategories.includes(page.category)).length,
    recentSources: dates.filter(date => today - date <= policy.recentWindowDays * 86400000).length,
  };
  const facets = policy.facets.map(facet => ({ ...facet, observed: metrics[facet.metric] || 0, value: Math.floor(facet.max * Math.min(1, (metrics[facet.metric] || 0) / facet.target)) }));
  const score = facets.reduce((sum, facet) => sum + facet.value, 0);
  return { version: policy.version, score, threshold: policy.threshold, unlocked: score > policy.threshold, facets };
}

/** Reject malformed output and citations that do not exist verbatim in the bound input. */
export function parsePredictionReport(text: string, pages: Pick<WikiPage, "id" | "markdown">[]): PredictionReport {
  const clean = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const value = JSON.parse(clean);
  const fail = (): never => { throw new Error("预测结果结构或证据不完整，请重新预测"); };
  const str = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= 5000;
  const strings = (s: unknown): s is string[] => Array.isArray(s) && s.length <= 20 && s.every(str);
  const list = (s: unknown, min: number, max: number): s is any[] => Array.isArray(s) && s.length >= min && s.length <= max;
  if (!value || value.version !== 4 || !str(value.summary) || !str(value.horizon) || !strings(value.tensions) || !strings(value.changes) || !list(value.domains, 2, 2)) fail();
  const probability = (node: any) => Number.isInteger(node?.probability) && node.probability >= 0 && node.probability <= 100 && str(node.probabilityReason) && node.probabilityReason.length <= 180;
  const distribution = (nodes: any[]) => nodes.reduce((total, node) => total + node?.probability, 0) === 100;
  const ids = new Set(["work", "life"]);
  if (value.summary.length > 100 || value.horizon.length > 50) fail();
  const byId = new Map(pages.map(page => [page.id, page]));
  for (const domain of value.domains) {
    if (!domain || !ids.delete(domain.id) || !str(domain.title) || !str(domain.current) || !strings(domain.gaps) || !list(domain.branches, 0, 5)) fail();
    if (domain.current.length > 24 || !str(domain.currentDetail) || domain.currentDetail.length > 240) fail();
    if (domain.title !== (domain.id === "work" ? "工作" : "生活")) fail();
    if (!domain.branches.length && !domain.gaps.length) fail();
    if (new Set(domain.branches.map((branch: any) => branch?.title)).size !== domain.branches.length) fail();
    if (domain.branches.length && !distribution(domain.branches)) fail();
    for (const branch of domain.branches) {
      if (!probability(branch)) fail();
      if (!branch || !str(branch.title) || !str(branch.summary) || !list(branch.outcomes, 2, 2)) fail();
      if (!str(branch.choice) || branch.choice.length > 45) fail();
      if (branch.title.length > 14 || branch.summary.length > 140 || !str(branch.dailyLife) || branch.dailyLife.length > 140) fail();
      if (new Set(branch.outcomes.map((outcome: any) => outcome?.title)).size !== 2) fail();
      if (!distribution(branch.outcomes)) fail();
      for (const outcome of branch.outcomes) {
        if (!probability(outcome)) fail();
        if (!outcome || !str(outcome.title) || !str(outcome.summary) || !["low", "medium", "high"].includes(outcome.confidence)
          || !strings(outcome.conditions) || !outcome.conditions.length || !strings(outcome.counterEvidence) || !strings(outcome.unknowns)
          || !list(outcome.factors, 1, 5) || !list(outcome.evidence, 1, 8) || !list(outcome.actions, 1, 3)) fail();
        if (outcome.title.length > 20 || outcome.summary.length > 90) fail();
        for (const factor of outcome.factors) if (!factor || !str(factor.label) || !str(factor.mechanism) || !["support", "risk"].includes(factor.direction) || ![1, 2, 3].includes(factor.strength)) fail();
        for (const evidence of outcome.evidence) {
          if (!evidence || !str(evidence.pageId) || !str(evidence.quote) || evidence.quote.trim().length < 8 || evidence.quote.length > 240 || !str(evidence.cue) || evidence.cue.length > 40 || !str(evidence.interpretation) || evidence.interpretation.length > 100) fail();
          const page = byId.get(evidence.pageId);
          if (!page || !page.markdown.includes(evidence.quote)) fail();
        }
        for (const action of outcome.actions) if (!action || !str(action.action) || !str(action.observation) || !str(action.reviewAfter)) fail();
      }
    }
  }
  return value as PredictionReport;
}


/** Give each observed category a turn, retaining space for original evidence. */
export function predictionExcerpts(pages: WikiPage[]) {
  const ordered = [...pages].sort((a, b) => (b.end || b.start || "").localeCompare(a.end || a.start || "") || a.id.localeCompare(b.id));
  const groups = new Map<string, WikiPage[]>();
  for (const page of ordered.filter(page => !page.isSource && page.category !== "maintenance" && page.category !== "home")) {
    const group = groups.get(page.category) || []; group.push(page); groups.set(page.category, group);
  }
  const wiki: WikiPage[] = [];
  while ([...groups.values()].some(group => group.length)) for (const group of groups.values()) { const page = group.shift(); if (page) wiki.push(page); }
  const selected: Array<Pick<WikiPage, "id" | "markdown" | "category" | "start" | "end" | "isSource">> = [];
  const referenced = new Set<string>();
  const append = (entries: WikiPage[]) => {
    let budget = 60000;
    for (const page of entries) {
      const markdown = page.markdown.slice(0, Math.min(6000, budget)); budget -= markdown.length;
      if (markdown.length < 100) continue;
      selected.push({ id: page.id, markdown, category: page.category, start: page.start, end: page.end, isSource: page.isSource });
      for (const link of page.outgoingLinks) if (link.resolvedId) referenced.add(link.resolvedId);
    }
  };
  append(wiki);
  append(ordered.filter(page => page.isSource).sort((a, b) => Number(referenced.has(b.id)) - Number(referenced.has(a.id))));
  return selected;
}

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
