import type { LettersView, PageCategory, QuoteGroup, QuotesView, SectionedPageView, StructuredCard, WikiPageSummary } from "@the-way-here/shared";
import { extractSectionBlocks, type WikiIndex } from "@the-way-here/wiki-core";
import { semanticDate, resolveLink, uniquePages } from "./page-utils.js";

export function buildCards(index: WikiIndex, category: PageCategory): StructuredCard[] {
  return index
    .list({ category })
    .filter((summary) => !summary.title.includes("总览"))
    .map((summary) => {
      const page = index.get(summary.id)!;
      return {
        id: page.id,
        title: page.title,
        excerpt: page.excerpt,
        updatedAt: page.end,
        sections: extractSectionBlocks(page.renderedMarkdown, 2).map((section) => ({
          heading: section.heading,
          body: section.body,
        })),
      };
    });
}

export function buildMentalModels(index: WikiIndex): SectionedPageView | undefined {
  const summary = index.list({ category: "mental-models" })[0];
  const page = summary ? index.get(summary.id) : undefined;
  return page ? { page, sections: extractSectionBlocks(page.markdown, 2) } : undefined;
}

function cleanWikiText(value: string): string {
  return value.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_raw, target, label) => label || target).replace(/\*\*/g, "").trim();
}

export function parseQuoteGroups(markdown: string): QuoteGroup[] {
  const groups: QuoteGroup[] = [];
  let group: QuoteGroup | undefined;
  let entry: QuoteGroup["entries"][number] | undefined;
  const finishEntry = () => {
    if (group && entry?.quote) {
      entry.quote = entry.quote.trim();
      entry.confirmed = !entry.identity.includes("推断候选");
      group.entries.push(entry);
    }
    entry = undefined;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const groupHeading = line.match(/^##\s+(.+)/);
    if (groupHeading) {
      finishEntry();
      group = { title: groupHeading[1]!.trim(), entries: [] };
      groups.push(group);
      continue;
    }
    const entryHeading = line.match(/^###\s+(.+)/);
    if (entryHeading && group) {
      finishEntry();
      entry = { title: entryHeading[1]!.trim(), quote: "", source: "", identity: "", usage: "", confirmed: false };
      continue;
    }
    if (!entry) continue;
    if (line.startsWith(">")) entry.quote += `${line.replace(/^>\s?/, "")}\n`;
    else if (line.startsWith("- 来源：")) entry.source = cleanWikiText(line.slice(5));
    else if (line.startsWith("- 身份：")) entry.identity = cleanWikiText(line.slice(5));
    else if (line.startsWith("- 适用：")) entry.usage = cleanWikiText(line.slice(5));
  }
  finishEntry();
  return groups.filter((item) => item.entries.length > 0);
}

export function buildQuotes(index: WikiIndex): QuotesView | undefined {
  const summary = index.list({ category: "quotes" })[0];
  const page = summary ? index.get(summary.id) : undefined;
  return page ? { page, groups: parseQuoteGroups(page.markdown) } : undefined;
}

export function buildLetters(index: WikiIndex): LettersView {
  const pages = index
    .list({ category: "letters" })
    .filter((page) => !page.title.includes("总览"))
    .sort((a, b) => semanticDate(b).localeCompare(semanticDate(a)));
  const themeCategories: PageCategory[] = ["personal-lines", "cycles", "systems", "mental-models", "life-stages", "relationship-roles", "entities"];
  const letters = pages.map((page) => {
    const full = index.get(page.id);
    return {
      page,
      letterDate: semanticDate(page),
      evidenceFrom: page.start,
      evidenceTo: page.end,
      themes: uniquePages((full?.outgoingLinks || []).map((link) => resolveLink(index, link))).filter((linked) => themeCategories.includes(linked.category)).slice(0, 10),
    };
  });
  const threads = new Map<string, { id: string; title: string; category: PageCategory | "uncategorized"; letters: string[]; latestDate: string }>();
  for (const letter of letters) {
    const themes = letter.themes.length ? letter.themes : [{ id: "uncategorized", title: "尚未归入主题", category: "other" as PageCategory } as WikiPageSummary];
    for (const theme of themes) {
      const entry = threads.get(theme.id) || { id: theme.id, title: theme.title, category: theme.id === "uncategorized" ? "uncategorized" : theme.category, letters: [], latestDate: letter.letterDate };
      entry.letters.push(letter.page.id);
      if (letter.letterDate > entry.latestDate) entry.latestDate = letter.letterDate;
      threads.set(theme.id, entry);
    }
  }
  return { letters, threads: [...threads.values()].sort((a, b) => b.letters.length - a.letters.length || b.latestDate.localeCompare(a.latestDate)), years: [...new Set(letters.map((letter) => letter.letterDate.slice(0, 4)))].filter(Boolean).sort().reverse() };
}
