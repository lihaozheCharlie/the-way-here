import type { GraphData, RelationshipsView } from "@the-way-here/shared";
import { type WikiIndex } from "@the-way-here/wiki-core";
import { intrinsicDate, resolveLink, uniquePages } from "./page-utils.js";
import { buildCards } from "./collections.js";

export function buildRelationships(index: WikiIndex): RelationshipsView {
  const people = index.list({ category: "entities" }).filter((page) => {
    const segments = page.relativePath.split("/");
    return page.type === "entity" && segments.some((segment) => segment === "人物") && !page.title.includes("总览");
  });
  const grouped = new Map<string, RelationshipsView["groups"][number]["people"]>();
  for (const person of people) {
    const segments = person.relativePath.replace(/\.md$/i, "").split("/");
    const group = segments.at(-2) || "其他";
    const entries = grouped.get(group) || [];
    const full = index.get(person.id);
    const mentions = full?.incomingLinks || [];
    const datedMentions = mentions.filter((page) => page.isSource || ["letters", "events"].includes(page.category));
    const related = uniquePages([...(full?.outgoingLinks || []).map((link) => resolveLink(index, link)), ...mentions]);
    entries.push({
      ...person,
      mentionCount: mentions.length,
      lastMention: datedMentions.map(intrinsicDate).filter(Boolean).sort().at(-1),
      relatedStages: related.filter((page) => page.category === "life-stages").slice(0, 6),
      relatedRoles: related.filter((page) => page.category === "relationship-roles").slice(0, 6),
      relatedSystems: related.filter((page) => page.category === "systems").slice(0, 6),
    });
    grouped.set(group, entries);
  }
  const groups = [...grouped.entries()]
    .map(([name, entries]) => ({ name, people: entries.sort((a, b) => (b.lastMention || "").localeCompare(a.lastMention || "") || b.mentionCount - a.mentionCount || a.title.localeCompare(b.title, "zh-CN")) }))
    .sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name, "zh-CN"));
  return { roles: buildCards(index, "relationship-roles"), groups, totalPeople: people.length };
}

export function buildGraph(index: WikiIndex, maxNodes = 120, focusId?: string): GraphData {
  const limit = focusId ? Math.min(maxNodes, 48) : maxNodes;
  const allPages = index.list({ sources: false }).filter((page) => !["maintenance", "other", "sources"].includes(page.category));
  const allIds = new Set(allPages.map((page) => page.id));
  const allLinks: GraphData["links"] = [];
  const degree = new Map<string, number>();
  for (const summary of allPages) {
    for (const link of index.get(summary.id)?.outgoingLinks || []) if (link.resolvedId && allIds.has(link.resolvedId)) {
      allLinks.push({ source: summary.id, target: link.resolvedId });
      degree.set(summary.id, (degree.get(summary.id) || 0) + 1);
      degree.set(link.resolvedId, (degree.get(link.resolvedId) || 0) + 1);
    }
  }
  let selectedIds: Set<string>;
  const distance = new Map<string, number>();
  if (focusId && allIds.has(focusId)) {
    selectedIds = new Set([focusId]);
    distance.set(focusId, 0);
    let frontier = [focusId];
    for (let depth = 1; depth <= 2 && selectedIds.size < limit; depth += 1) {
      const next: string[] = [];
      for (const link of allLinks) if (frontier.includes(link.source) || frontier.includes(link.target)) {
        const candidate = frontier.includes(link.source) ? link.target : link.source;
        if (!selectedIds.has(candidate) && selectedIds.size < limit) { selectedIds.add(candidate); distance.set(candidate, depth); next.push(candidate); }
      }
      frontier = next;
    }
  } else {
    const anchors = allPages.filter((page) => ["state", "personal-lines", "cycles", "systems", "life-stages"].includes(page.category));
    const ranked = [...allPages].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
    selectedIds = new Set([...anchors, ...ranked].slice(0, limit).map((page) => page.id));
  }
  const pages = allPages.filter((page) => selectedIds.has(page.id)).sort((a, b) => focusId ? (distance.get(a.id) ?? 99) - (distance.get(b.id) ?? 99) || (degree.get(b.id) || 0) - (degree.get(a.id) || 0) : 0).slice(0, limit);
  const allowed = new Set(pages.map((page) => page.id));
  return {
    focusId,
    nodes: pages.map((page) => ({ id: page.id, title: page.title, category: page.category, degree: degree.get(page.id) || 0, distance: distance.get(page.id) })),
    links: allLinks.filter((link) => allowed.has(link.source) && allowed.has(link.target)),
  };
}
