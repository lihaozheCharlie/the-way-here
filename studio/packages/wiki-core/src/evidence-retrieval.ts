import { bodyLines, evidenceTime, type EvidencePage } from "./evidence-metadata.js";

export interface RetrievalPolicy {
  version: 1;
  roles: Array<{ id: string; patterns: string[] }>;
  signals: Array<{ id: string; terms: string[] }>;
}
export function parseRetrievalPolicy(value: unknown): RetrievalPolicy {
  const p = value as RetrievalPolicy;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(t => typeof t === "string" && t.trim());
  if (!p || p.version !== 1 || !Array.isArray(p.roles) || !Array.isArray(p.signals)
    || p.roles.some(r => !r || typeof r.id !== "string" || !r.id.trim() || !strings(r.patterns))
    || p.signals.some(r => !r || typeof r.id !== "string" || !r.id.trim() || !strings(r.terms))) throw new Error("共享检索配置无效");
  for (const role of p.roles) for (const pattern of role.patterns) new RegExp(pattern,"i");
  return p;
}
export function buildEvidenceProfiles(pages: EvidencePage[], policy: RetrievalPolicy = {version:1,roles:[],signals:[]}) {
  const pageIds = new Set(pages.map(p => p.id));
  const profiles = pages.map(page => {
    const role = policy.roles.find(r => r.patterns.some(pattern => new RegExp(pattern, "i").test(page.id)))?.id
      || (page.isSource ? "source" : "synthesis");
    const lines = bodyLines(page.markdown);
    const signals = (policy.signals || []).map(signal => ({
      id: signal.id,
      lines: lines.filter(row => signal.terms.some(term => row.text.toLowerCase().includes(term.toLowerCase()))).map(row => row.line),
    })).filter(signal => signal.lines.length);
    return {
      pageId: page.id, title: page.title || page.id.split("/").at(-1)!, aliases: page.aliases || [], isSource: page.isSource,
      role, time: evidenceTime(page), signals,
      links: (page.outgoingLinks || []).filter(link => link.resolvedId && pageIds.has(link.resolvedId)).map(link => ({ pageId: link.resolvedId!, label: link.label, target: link.target })),
      backlinks: (page.incomingLinks || []).filter(link => pageIds.has(link.id)).map(link => link.id),
      unresolvedLinks: (page.outgoingLinks || []).filter(link => !link.resolvedId).map(link => ({ target: link.target, ambiguous: link.ambiguous })),
    };
  });
  return profiles;
}

export function searchEvidenceGroups(pages: EvidencePage[], profiles: ReturnType<typeof buildEvidenceProfiles>, groups: Array<{id:string; terms:string[]}>) {
  const byId = new Map(profiles.map(p => [p.pageId,p]));
  const hits = pages.flatMap(page => {
    const lines = bodyLines(page.markdown);
    const matches = groups.flatMap(group => group.terms.flatMap(term => {
      const needle = term.toLowerCase();
      const positions = lines.filter(row => row.text.toLowerCase().includes(needle)).map(row => row.line);
      const profile = byId.get(page.id)!;
      const titleMatch = [profile.title, ...profile.aliases].some(title => title.toLowerCase().includes(needle));
      return positions.length || titleMatch ? [{ groupId: group.id, term, lines: positions, ...(titleMatch ? { titleMatch: true } : {}) }] : [];
    }));
    return matches.length ? [{ pageId: page.id, isSource: page.isSource, matches }] : [];
  });
  return hits;
}
