import { buildCards, buildLifeMap, buildRelationships, buildToday, buildLetters } from '@the-way-here/life-views';
import type { WikiIndex } from '@the-way-here/wiki-core';
import type { WikiPageSummary, PageCategory } from '@the-way-here/shared';

/** Transport projection only: all interpretation and relationship selection stays in life-views. */
export function buildMobileUnderstandingProjection(index: WikiIndex) {
  const visible = (p: WikiPageSummary) => !p.externalSource;
  const ref = (p: WikiPageSummary) => ({ id: p.id, path: p.relativePath, title: p.title, date: p.start || p.modifiedAt, excerpt: p.excerpt, isSource: p.isSource });
  const evidence = (id: string) => {
    const page = index.get(id); if (!page) return [];
    const refs = [...page.incomingLinks, ...page.outgoingLinks.flatMap(l => l.resolvedId ? [index.get(l.resolvedId)].filter((x): x is NonNullable<typeof x> => !!x) : [])].filter(visible);
    return [...new Map(refs.filter(p => p.isSource).map(p => [p.id, ref(p)])).values()].sort((a,b) => a.date.localeCompare(b.date));
  };
  const categories: PageCategory[] = ['personal-lines', 'cycles', 'systems', 'mental-models'];
  const relationships = buildRelationships(index), life = buildLifeMap(index), today = buildToday(index);
  return {
    version: 1, knowledgeBaseId: index.config.knowledgeBaseId, updatedAt: index.lastIndexedAt,
    sourceCount: index.list().filter(p => p.isSource && visible(p)).length,
    coverageFrom: index.list().filter(p => p.isSource && visible(p)).map(p => p.start || p.modifiedAt).sort()[0] || '',
    cards: categories.flatMap(category => buildCards(index, category).map(card => ({ ...card, category, path: index.get(card.id)?.relativePath || '', evidence: evidence(card.id), cycle: category === "cycles" ? projectCycle(card.sections, index.get(card.id)?.properties || {}) : null, confidence: typeof index.get(card.id)?.properties.confidence === "string" ? String(index.get(card.id)?.properties.confidence) : null, hitCount: typeof index.get(card.id)?.properties.hit_count === "number" ? Number(index.get(card.id)?.properties.hit_count) : null }))),
    topics: today.conversationPrompts.map(t => ({ ...t, evidence: t.links.flatMap(l => l.resolvedId ? [index.get(l.resolvedId)].filter((x): x is NonNullable<typeof x> => !!x).filter(visible).map(ref) : []) })),
    nodes: index.list().filter(p => visible(p) && ["events", "life-stages"].includes(p.category)).map(p => ({ ...ref(p), start: p.start || "", end: p.end || "", lane: String(index.get(p.id)?.properties.line || index.get(p.id)?.properties.lane || "未分类"), turning: index.get(p.id)?.properties.turning_point === true, ...projectTurningComparison(index.get(p.id)?.sections || [], index.get(p.id)?.properties || {}), sections: index.get(p.id)?.sections.filter(s => s.level === 2).map(s => ({ heading: s.heading, body: s.body })) || [], evidence: evidence(p.id), people: (index.get(p.id)?.outgoingLinks || []).flatMap(l => l.resolvedId ? [index.get(l.resolvedId)].filter((x): x is NonNullable<typeof x> => !!x).filter(x => x.category === "entities" && visible(x)).map(ref) : []) })),
    people: relationships.groups.flatMap(group => group.people.filter(visible).map(person => ({ ...ref(person), group: group.name, mentionCount: person.mentionCount, lastMention: person.lastMention || '', evidence: evidence(person.id), events: index.get(person.id)?.incomingLinks.filter(p => p.category === 'events' && visible(p)).slice(0,5).map(ref) || [] }))),
    stages: life.stages.map(s => ({ ...ref(s.page), range: s.range, focus: s.focus, lane: s.lane, current: s.current, people: s.relatedPeople.filter(visible).map(ref), events: s.relatedEvents.filter(visible).map(ref) })),
    letters: buildLetters(index).letters.map(l => ({ ...ref(l.page), date: l.letterDate, evidence: evidence(l.page.id), voice: stringProperty(index.get(l.page.id)?.properties.voice), perspective: stringProperty(index.get(l.page.id)?.properties.perspective_name || index.get(l.page.id)?.properties.perspective), referenceCount: typeof index.get(l.page.id)?.properties.reference_count === "number" ? Number(index.get(l.page.id)?.properties.reference_count) : evidence(l.page.id).length })),
  };
}
export type MobileUnderstandingProjection = ReturnType<typeof buildMobileUnderstandingProjection>;

function stringProperty(value: unknown): string | null { return typeof value === "string" ? value : null; }
/** Exact display-field aliases only; never infer a missing causal step from narrative. */
function projectCycle(sections: Array<{heading:string;body:string}>, properties: Record<string,unknown>) {
  const field = (key: string, headings: string[]) => stringProperty(properties[key]) || sections.find(section => headings.includes(section.heading.trim().replace(/[：:]$/, "")))?.body || null;
  return {
    steps: [
      {id:"trigger",label:"触发",body:field("trigger",["触发","触发条件","触发情境"])},
      {id:"response",label:"反应",body:field("response",["反应","惯性反应","自动反应"])},
      {id:"relief",label:"暂时的缓解",body:field("relief",["暂时的缓解","短期缓解","暂时缓解"])},
      {id:"cost",label:"代价与结果",body:field("cost",["代价","长期代价","代价与结果","结果"])},
      {id:"return",label:"回到触发",body:field("return_to_trigger",["回到触发","循环如何维持","回到起点"])}
    ],
    occurrenceCount: Number.isInteger(properties.occurrence_count) && Number(properties.occurrence_count) >= 0 ? Number(properties.occurrence_count) : null,
    experiment: field("experiment",["小实验","打破它的小实验","打破循环的小实验"]),
  };
}

/** Transport explicitly named before/after statements; a missing side remains unknown. */
function projectTurningComparison(sections: Array<{heading:string;body:string}>, properties: Record<string,unknown>) {
  const field = (key:string, headings:string[]) => stringProperty(properties[key]) || sections.find(section => headings.includes(section.heading.trim().replace(/[：:]$/, "")))?.body || null;
  return { before: field("before", ["转折前", "之前", "改变之前"]), after: field("after", ["转折后", "之后", "改变之后"]) };
}
