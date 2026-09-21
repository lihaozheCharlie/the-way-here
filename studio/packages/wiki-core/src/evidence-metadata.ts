import type { WikiPage } from "@the-way-here/shared";

export type EvidencePage = Pick<WikiPage, "id" | "markdown" | "isSource" | "start" | "end"> &
  Partial<Pick<WikiPage, "title" | "aliases" | "outgoingLinks" | "incomingLinks">>;

// Dates are retrieval clues. They do not establish who experienced an event or whether it happened.
export function datesIn(text: string) {
  const found: string[] = [];
  const pattern = /(?<!\d)((?:19|20)\d{2})[.年,，/\-](\d{1,2})[.月,，/\-](\d{1,2})(?:日)?(?!\d)/g;
  for (const match of text.matchAll(pattern)) {
    const [, y, m, d] = match;
    const date = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) found.push(date);
  }
  return [...new Set(found)];
}

export function bodyLines(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const end = lines[0]?.trim() === "---" ? lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line)) : -1;
  return lines.map((text, index) => ({ line: index + 1, text })).filter(row => row.line > end + 1);
}

export function evidenceTime(page: EvidencePage) {
  const filenameDates = datesIn(page.id.split("/").at(-1) || "");
  const metadataDates = [page.start, page.end].filter((date): date is string => Boolean(date));
  // A synthesis end date describes coverage, not the time every claim became true.
  const recordedDate = page.isSource ? (page.start || filenameDates[0]) : undefined;
  const bodyDateClues = bodyLines(page.markdown).flatMap(({ text, line }) => {
    const dates = datesIn(text);
    const years = [...text.matchAll(/(?<!\d)((?:19|20)\d{2})年(?!\d)/g)].map(m => m[1]!);
    const relative = [...text.matchAll(/去年|前年|今年|明年|后年|昨天|今天|明天/g)].map(m => m[0]);
    return dates.length || years.length || relative.length ? [{ line, dates, years: [...new Set(years)], relative: [...new Set(relative)] }] : [];
  });
  return {
    recordedDate, metadataDates, filenameDates, coverageEnd: page.isSource ? undefined : page.end || page.start,
    conflict: Boolean(page.isSource && page.start && filenameDates[0] && page.start !== filenameDates[0]),
    bodyDateClues,
  };
}
