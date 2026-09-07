import type { WikiLink, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { type WikiIndex } from "@the-way-here/wiki-core";

function normalizeDate(value?: string): string {
  if (!value) return "";
  const match = value.match(/((?:19|20)\d{2})[-./年](1[0-2]|0?[1-9])(?:[-./月](3[01]|[12]\d|0?[1-9]))?/);
  if (!match) return "";
  return `${match[1]}-${match[2]!.padStart(2, "0")}-${(match[3] || "01").padStart(2, "0")}`;
}

export function semanticDate(page: WikiPageSummary): string {
  const filenameDate = normalizeDate(page.title);
  if (page.category === "letters") return filenameDate || normalizeDate(page.end) || normalizeDate(page.start) || normalizeDate(page.modifiedAt);
  return normalizeDate(page.end) || normalizeDate(page.start) || filenameDate || normalizeDate(page.modifiedAt);
}

export function intrinsicDate(page: WikiPageSummary): string {
  return normalizeDate(page.end) || normalizeDate(page.start) || normalizeDate(page.title);
}

export function resolveLink(index: WikiIndex, link: WikiLink): WikiPage | undefined {
  return index.get(link.resolvedId || link.target);
}

export function uniquePages(pages: Array<WikiPageSummary | undefined>): WikiPageSummary[] {
  return [...new Map(pages.filter(Boolean).map((page) => [page!.id, page!])).values()];
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitMarkdownTableRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let wikiDepth = 0;
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pair === "[[") wikiDepth += 1;
    if (pair === "]]" && wikiDepth > 0) wikiDepth -= 1;
    if (value[index] === "|" && wikiDepth === 0) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += value[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}
