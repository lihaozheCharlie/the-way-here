import { buildEvidenceProfiles, searchEvidenceGroups, type EvidencePage, type RetrievalPolicy } from "@the-way-here/wiki-core";

interface LifeSearchPolicy {
  version: 1;
  groups: Array<{ id: string; label: string; terms: string[] }>;
  retrieval?: {
    perGroup: number;
    perLane: number;
  };
}

export function parseLifeSearchPolicy(value: unknown): LifeSearchPolicy {
  const policy = value as LifeSearchPolicy;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(t => typeof t === "string" && t.trim());
  if (!policy || policy.version !== 1 || !Array.isArray(policy.groups) || !policy.groups.length
    || policy.groups.some(g => !g || typeof g.id !== "string" || !g.id.trim() || typeof g.label !== "string" || !g.label.trim() || !strings(g.terms))
    || new Set(policy.groups.map(g => g.id)).size !== policy.groups.length) throw new Error("生活线索搜索配置无效");
  const r = policy.retrieval;
  if (r && ![r.perGroup, r.perLane].every(n => Number.isInteger(n) && n >= 2 && n <= 20)) throw new Error("预测检索预算无效");
  return policy;
}

/** Literal recall and navigation only; the skill interprets personal meaning, chronology and support. */
export function searchPredictionLifeEvidence(pages: EvidencePage[], policy: LifeSearchPolicy, retrievalPolicy?: RetrievalPolicy) {
  const profiles = buildEvidenceProfiles(pages, retrievalPolicy);
  const byId = new Map(profiles.map(p => [p.pageId, p]));
  const current = pages.find(p => p.id === "prediction-input/current")?.markdown.toLowerCase() || "";
  const concernTerms = [...new Set([
    ...policy.groups.flatMap(g => g.terms).filter(term => current.includes(term.toLowerCase())),
    ...profiles.flatMap(p => [p.title, ...p.aliases]).filter(term => term.length >= 2 && term.length <= 30 && current.includes(term.toLowerCase())),
  ])];
  const searchGroups = [...policy.groups, ...(concernTerms.length ? [{ id: "current-input", label: "本次关注", terms: concernTerms }] : [])];
  const hits = searchEvidenceGroups(pages, profiles, searchGroups);
  const date = (id: string) => { const p = byId.get(id)!; return p.time.recordedDate || p.time.coverageEnd || ""; };
  const direct = (id: string) => !["navigation", "reflection"].includes(byId.get(id)!.role);
  const relevance = (hit: typeof hits[number], group: string) => {
    const matches = hit.matches.filter(m => m.groupId === group);
    // Distinct terms with saturation, not raw occurrences or document length.
    return Math.min(matches.length, 4) + (matches.some(m => "titleMatch" in m) ? 3 : 0);
  };
  const candidates = searchGroups.map(group => {
    const ranked = hits.filter(h => h.matches.some(m => m.groupId === group.id) && direct(h.pageId))
      .sort((a, b) => relevance(b, group.id) - relevance(a, group.id) || date(b.pageId).localeCompare(date(a.pageId)) || a.pageId.localeCompare(b.pageId));
    const limit = policy.retrieval?.perGroup || 6;
    // Reading material has its own lane; it remains available here when it contains self-reference clues.
    const eligible = ranked.filter(h => byId.get(h.pageId)!.role !== "reading" || byId.get(h.pageId)!.signals.some(s => s.id === "identification"));
    const selected = [...eligible.filter(h => h.isSource).slice(0, Math.ceil(limit / 2)), ...eligible.filter(h => !h.isSource).slice(0, Math.floor(limit / 2))];
    const ids = new Set(selected.map(h => h.pageId));
    for (const hit of eligible) { if (ids.size >= limit) break; ids.add(hit.pageId); }
    return { groupId: group.id, pageIds: [...ids] };
  });
  const limit = policy.retrieval?.perLane || 6;
  const chronological = (items: typeof profiles) => [...items].sort((a, b) => date(b.pageId).localeCompare(date(a.pageId)) || a.pageId.localeCompare(b.pageId));
  const primary = profiles.filter(p => ["personal", "source"].includes(p.role));
  const lanes = [
    { id: "recent", pageIds: chronological(primary.filter(p => p.time.recordedDate)).slice(0, limit).map(p => p.pageId) },
    { id: "synthesis", pageIds: chronological(profiles.filter(p => p.role === "synthesis")).slice(0, limit).map(p => p.pageId) },
    ...["change", "counter"].map(id => {
      const items = chronological(primary.filter(p => p.signals.some(s => s.id === id)));
      // Retain older episodes as well as recent statements; the skill follows their outcomes.
      const selected = [...items.slice(0, Math.ceil(limit / 2)), ...items.slice().reverse().slice(0, Math.floor(limit / 2))];
      return { id, pageIds: [...new Set(selected.map(p => p.pageId))] };
    }),
    { id: "reading-identification", pageIds: chronological(profiles.filter(p => p.role === "reading" && p.signals.some(s => s.id === "identification"))).slice(0, limit).map(p => p.pageId) },
    { id: "current-input", pageIds: candidates.find(g => g.groupId === "current-input")?.pageIds || [] },
  ];
  return {
    retrievalVersion: 2, candidates, lanes, profiles, concernTerms, policyVersion: policy.version,
    scanned: { sources: pages.filter(p => p.isSource).length, wiki: pages.filter(p => !p.isSource).length },
    groups: searchGroups.map(group => {
      const found = hits.filter(hit => hit.matches.some(match => match.groupId === group.id));
      return { ...group, matchedSources: found.filter(h => h.isSource).length, matchedWiki: found.filter(h => !h.isSource).length };
    }), hits,
  };
}
