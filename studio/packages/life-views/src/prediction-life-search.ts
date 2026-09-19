import type { WikiPage } from "@the-way-here/shared";

interface LifeSearchPolicy {
  version: 1;
  groups: Array<{ id: string; label: string; terms: string[] }>;
}

export function parseLifeSearchPolicy(value: unknown): LifeSearchPolicy {
  const policy = value as LifeSearchPolicy;
  if (!policy || policy.version !== 1 || !Array.isArray(policy.groups) || !policy.groups.length
    || policy.groups.some(g => !g || typeof g.id !== "string" || !g.id.trim() || typeof g.label !== "string" || !g.label.trim()
      || !Array.isArray(g.terms) || !g.terms.length || g.terms.some(t => typeof t !== "string" || !t.trim()))
    || new Set(policy.groups.map(g => g.id)).size !== policy.groups.length) throw new Error("生活线索搜索配置无效");
  return policy;
}

/** Exhaustive literal recall only. The shared skill decides whose intent a hit expresses. */
export function searchPredictionLifeEvidence(pages: Array<Pick<WikiPage, "id" | "markdown" | "isSource" | "start" | "end">>, policy: LifeSearchPolicy) {
  const hits = pages.flatMap(page => {
    const lines = page.markdown.split(/\r?\n/).map(line => line.toLowerCase());
    const matches = policy.groups.flatMap(group => group.terms.flatMap(term => {
      const needle = term.toLowerCase();
      const positions = lines.flatMap((line, index) => line.includes(needle) ? [index + 1] : []);
      return positions.length ? [{ groupId: group.id, term, lines: positions }] : [];
    }));
    return matches.length ? [{ pageId: page.id, isSource: page.isSource, matches }] : [];
  });
  const dates=new Map(pages.map(p=>[p.id,p.end||p.start||""]));
  const candidates = policy.groups.map(group=>{
    const ranked=hits.filter(h=>h.matches.some(m=>m.groupId===group.id)).sort((a,b)=>(dates.get(b.pageId)||"").localeCompare(dates.get(a.pageId)||"") || b.matches.filter(m=>m.groupId===group.id).length-a.matches.filter(m=>m.groupId===group.id).length || a.pageId.localeCompare(b.pageId));
    const selected=[...ranked.filter(h=>h.isSource).slice(0,3),...ranked.filter(h=>!h.isSource).slice(0,3)];
    const ids=new Set(selected.map(h=>h.pageId));
    for(const hit of ranked){if(ids.size===6)break;ids.add(hit.pageId);}
    return {groupId:group.id,pageIds:[...ids]};
  });
  return {
    candidates,
    policyVersion: policy.version,
    scanned: { sources: pages.filter(p => p.isSource).length, wiki: pages.filter(p => !p.isSource).length },
    groups: policy.groups.map(group => {
      const found = hits.filter(hit => hit.matches.some(match => match.groupId === group.id));
      return { ...group, matchedSources: found.filter(h => h.isSource).length, matchedWiki: found.filter(h => !h.isSource).length };
    }),
    hits,
  };
}
