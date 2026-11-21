import { createHash } from "node:crypto";
import type { DreamGroundFact, DreamPoint, WikiPage } from "@the-way-here/shared";
import { datesIn } from "./evidence-metadata.js";
import { createEvidenceSnapshot } from "./evidence-snapshot.js";
import type { RetrievalPolicy } from "./evidence-retrieval.js";

export function dreamRecordDate(page: Pick<WikiPage, "id" | "start" | "isSource" | "externalSource">) {
  if (!page.isSource || page.externalSource?.status === "unavailable") return;
  const names = datesIn(page.id.split("/").at(-1) ?? "");
  const date = page.start ?? names[0];
  if (!date || datesIn(date)[0] !== date || names.length > 1 || (names[0] && names[0] !== date)) return;
  return date;
}

export function buildDreamEvidence(knowledgeBaseId: string, pages: WikiPage[], cutoff: string, policy: RetrievalPolicy, point?: DreamPoint) {
  const sourceIds: Record<string, string> = {};
  const decisionPages = pages.flatMap(page => {
    if (page.importChannel && page.importChannel !== "files") return [];
    const recordedDate = dreamRecordDate(page);
    if (!recordedDate || recordedDate >= cutoff || (page.end && page.end >= cutoff)) return [];

    // Use an opaque ID and suppress derived navigation. Preserve original line positions for citations.
    const id = "record-" + createHash("sha256").update(page.id).digest("hex").slice(0, 24);
    const withoutComments = page.markdown.replace(/<!--[^]*?(?:-->|$)/g, comment => comment.replace(/[^\r\n]/g, " "));
    const lines = withoutComments.split(/\r?\n/);
    const frontmatterEnd = lines[0]?.trim() === "---" ? lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line)) : -1;
    if (lines[0]?.trim() === "---" && frontmatterEnd < 0) return [];
    sourceIds[id] = page.id;
    const markdown = lines.map((line, i) => {
      if (i <= frontmatterEnd || /^\s*#/.test(line) || /^\s*\[[^\]]+\]:/.test(line)) return "";
      // Mask link targets and labels, retaining adjacent prose and its original line number.
      return line.replace(/!?\[\[[^\]]*\]\]|!?\[[^\]]*\]\([^)]*\)|<[^>]*>/g, link => " ".repeat(link.length));
    }).join("\n");
    return [{ id, markdown, isSource: true, start: recordedDate, title: `同期记录 ${recordedDate}` }];
  });
  const beforeText = point?.situation ?? "";
  const before = { id: "dream-user-before", title: "你描述的入梦处境", isSource: true as const, start: cutoff, end: undefined, markdown: beforeText };
  const after = { id: "dream-user-after", title: "你补充的真实经历", isSource: true as const, start: undefined, end: undefined,
    markdown: [point?.actualChoice, point?.aftermath, point?.supplement].filter(Boolean).join("\n") };
  return {
    decision: createEvidenceSnapshot(knowledgeBaseId, [...decisionPages, ...(beforeText ? [before] : [])], policy),
    review: createEvidenceSnapshot(knowledgeBaseId, [
      ...pages.filter(page => page.externalSource?.status !== "unavailable"),
      ...[before, after].filter(page => page.markdown),
    ], policy),
    sourceIds,
  };
}

export const dreamGroundPageId = "dream-grounded-facts";
export const dreamStoryBiblePageId = "dream-story-bible";

function withDreamOverlayPage(snapshot: ReturnType<typeof createEvidenceSnapshot>, page: { id: string; title: string; markdown: string }) {
  const overlay = createEvidenceSnapshot(snapshot.knowledgeBaseId, [{
    id: page.id, title: page.title, isSource: false, markdown: page.markdown, start: undefined, end: undefined,
  }], { version: 1, roles: [], signals: [] });
  return {
    ...snapshot,
    inputHash: createHash("sha256").update(snapshot.inputHash + overlay.inputHash).digest("hex"),
    catalogue: [...overlay.catalogue, ...snapshot.catalogue],
    pages: [...overlay.pages, ...snapshot.pages],
    retrieval: { ...snapshot.retrieval, profiles: [...overlay.retrieval.profiles, ...snapshot.retrieval.profiles] },
  };
}

export function withDreamGroundFacts(snapshot: ReturnType<typeof createEvidenceSnapshot>, facts: DreamGroundFact[]) {
  if (!facts.length) return snapshot;
  return withDreamOverlayPage(snapshot, {
    id: dreamGroundPageId, title: "入梦时已经知道的事实", markdown: facts.map(fact => fact.text).join("\n"),
  });
}

/** The plan-stage setting shared by every branch; readable like a page, but not evidence for citations. */
export function withDreamStoryBible(snapshot: ReturnType<typeof createEvidenceSnapshot>, bible: Array<{ aspect: string; text: string }>) {
  if (!bible.length) return snapshot;
  return withDreamOverlayPage(snapshot, {
    id: dreamStoryBiblePageId, title: "梦境共享设定",
    markdown: bible.map(entry => `${entry.aspect}：${entry.text}`).join("\n"),
  });
}
