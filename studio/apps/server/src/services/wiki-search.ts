import type { WikiPageSummary } from "@the-way-here/shared";
import type { WikiIndex } from "@the-way-here/wiki-core";

export type WikiSearchHit = {
  id: string;
  path: string;
  title: string;
  isSource: boolean;
  matchedQueries: string[];
  snippets: string[];
};

export function searchWiki(index: WikiIndex, proposedQueries: string[], limit = 8): WikiSearchHit[] {
  const queries = [...new Set(proposedQueries.map((query) => query.trim()).filter(Boolean))].slice(0, 3);
  if (!queries.length || queries.some((query) => query.length > 100)) throw new Error("请提供 1–3 个不超过 100 字的检索短语");
  const candidates = new Map<string, { page: WikiPageSummary; rank: number; matchedQueries: string[] }>();
  for (const query of queries) {
    for (const [position, page] of index.search(query, 16).entries()) {
      const existing = candidates.get(page.id);
      if (existing) {
        existing.rank += Math.max(1, 16 - position);
        existing.matchedQueries.push(query);
      } else {
        candidates.set(page.id, { page, rank: Math.max(1, 16 - position), matchedQueries: [query] });
      }
    }
  }
  return [...candidates.values()]
    .sort((a, b) => b.rank - a.rank || Number(a.page.isSource) - Number(b.page.isSource) || a.page.title.localeCompare(b.page.title, "zh-CN"))
    .slice(0, Math.max(1, Math.min(limit, 12)))
    .map(({ page, matchedQueries }) => {
      const markdown = index.get(page.id)?.markdown || "";
      const lines = markdown.split(/\r?\n/);
      const frontmatterEnd = lines[0]?.trim() === "---" ? lines.findIndex((line, position) => position > 0 && line.trim() === "---") : -1;
      const snippets = lines.flatMap((line, position) => {
        const clean = line.trim();
        if (position <= frontmatterEnd || !clean || clean.startsWith("# ")) return [];
        if (!matchedQueries.some((query) => clean.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) return [];
        return [`${position + 1}: ${clean.slice(0, 240)}`];
      }).slice(0, 2);
      return {
        id: page.id,
        path: page.relativePath,
        title: page.title,
        isSource: page.isSource,
        matchedQueries,
        snippets: snippets.length ? snippets : [page.excerpt.slice(0, 240)],
      };
    });
}
