import type { LifeMapView, LifeStageView, TimelineItem, WikiPageSummary } from "@the-way-here/shared";
import { extractSectionBlocks, extractWikiLinks, type WikiIndex } from "@the-way-here/wiki-core";
import { resolveLink, uniquePages, stripMarkdown, splitMarkdownTableRow } from "./page-utils.js";

function yearRange(value: string): { start: number; end: number } | undefined {
  const years = [...value.matchAll(/(?:19|20)\d{2}/g)].map((match) => Number(match[0]));
  if (!years.length) return undefined;
  return { start: years[0]!, end: /至今|现在|current/i.test(value) ? 9999 : years[1] || years[0]! };
}

function eventOrder(page: WikiPageSummary): number {
  const prefix = page.title.match(/^(\d+)\s/)?.[1];
  return prefix ? Number(prefix) : Number.MAX_SAFE_INTEGER;
}

function stageYearRange(stage: LifeStageView): { start: number; end: number } | undefined {
  return yearRange(stage.range) || yearRange([stage.page.start, stage.page.end].filter(Boolean).join(" "));
}

function stageForEvent(index: WikiIndex, event: WikiPageSummary, stages: LifeStageView[]): LifeStageView | undefined {
  const eventPage = index.get(event.id);
  const representativeOwner = stages.find((stage) => stage.representative?.id === event.id);
  if (representativeOwner) return representativeOwner;
  const eventLinkedOwner = stages.find((stage) => eventPage?.outgoingLinks.some((link) => link.resolvedId === stage.page.id));
  if (eventLinkedOwner) return eventLinkedOwner;
  const stageLinkedOwner = stages.find((stage) => index.get(stage.page.id)?.outgoingLinks.some((link) => link.resolvedId === event.id));
  if (stageLinkedOwner) return stageLinkedOwner;

  const mainStages = stages.filter((stage) => stage.lane === 0);
  const eventYears = yearRange([event.start, event.end, event.title].filter(Boolean).join(" "));
  if (eventYears) {
    const datedOwner = mainStages.find((stage) => {
      const range = stageYearRange(stage);
      if (!range) return false;
      return eventYears.start >= range.start && (range.start === range.end ? eventYears.start === range.start : eventYears.start < range.end);
    });
    if (datedOwner) return datedOwner;
  }

  const orderedAnchors = mainStages
    .filter((stage) => stage.representative && eventOrder(stage.representative) !== Number.MAX_SAFE_INTEGER)
    .sort((a, b) => eventOrder(a.representative!) - eventOrder(b.representative!));
  const orderedOwner = [...orderedAnchors].reverse().find((stage) => eventOrder(stage.representative!) <= eventOrder(event));
  return orderedOwner || mainStages[0];
}

export function buildLifeMap(index: WikiIndex): LifeMapView {
  const overviewSummary = index.list({ category: "life-stages" }).find((page) => page.title.includes("总览"));
  const overview = overviewSummary ? index.get(overviewSummary.id) : undefined;
  const section = overview ? extractSectionBlocks(overview.markdown, 2).find((item) => item.heading.includes("阶段地图")) : undefined;
  const rows = section?.body.split(/\r?\n/).filter((line) => line.trim().startsWith("|")).slice(2) || [];
  const laneEnds: number[] = [];
  const stages: LifeStageView[] = [];

  for (const [order, line] of rows.entries()) {
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 3) continue;
    const stageLink = extractWikiLinks(cells[0] || "")[0];
    if (!stageLink) continue;
    const page = index.get(stageLink.target);
    if (!page) continue;
    const range = stripMarkdown(cells[1] || "待补充");
    const interval = yearRange(range);
    let lane = 0;
    if (interval) {
      lane = laneEnds.findIndex((end) => end <= interval.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = interval.end;
    }
    const representativeLink = extractWikiLinks(cells[3] || "")[0];
    const representative = representativeLink ? index.get(representativeLink.target) : undefined;
    stages.push({
      page,
      range,
      focus: stripMarkdown(cells[2] || page.excerpt),
      lane,
      order,
      current: /至今|现在|current/i.test(range),
      representative,
      relatedEvents: [],
      relatedPeople: [],
      relatedPlaces: [],
      relatedSystems: [],
      relatedLetters: [],
    });
  }

  if (!stages.length) {
    index.list({ category: "life-stages" }).filter((page) => !page.title.includes("总览")).forEach((page, order) => {
      stages.push({ page, range: [page.start, page.end].filter(Boolean).join(" — ") || "待补充", focus: page.excerpt, lane: 0, order, current: false, relatedEvents: [], relatedPeople: [], relatedPlaces: [], relatedSystems: [], relatedLetters: [] });
    });
  }

  const events = index.list({ category: "events" })
    .filter((page) => !page.title.includes("总览") && !page.title.includes("索引"))
    .sort((a, b) => eventOrder(a) - eventOrder(b) || (a.start || "9999").localeCompare(b.start || "9999"));

  for (const event of events) {
    const owner = stageForEvent(index, event, stages);
    if (owner) owner.relatedEvents.push(event);
  }
  for (const stage of stages) {
    const connected = uniquePages([stage.page, ...stage.relatedEvents].flatMap((item) => {
      const full = index.get(item.id);
      return (full?.outgoingLinks || []).map((link) => resolveLink(index, link));
    }));
    stage.relatedPeople = connected.filter((item) => item.category === "entities" && item.relativePath.split("/").includes("人物"));
    stage.relatedPlaces = connected.filter((item) => item.category === "entities" && !item.relativePath.split("/").includes("人物"));
    stage.relatedSystems = connected.filter((item) => item.category === "systems");
    stage.relatedLetters = connected.filter((item) => item.category === "letters");
  }
  return { overview: overviewSummary, stages, events };
}

export function buildTimeline(index: WikiIndex): TimelineItem[] {
  const stages: TimelineItem[] = index
    .list({ category: "life-stages" })
    .filter((page) => !page.title.includes("总览"))
    .map((page) => ({ id: page.id, title: page.title, kind: "stage", start: page.start, end: page.end, excerpt: page.excerpt }));
  const events: TimelineItem[] = index
    .list({ category: "events" })
    .filter((page) => !page.title.includes("总览"))
    .map((page) => ({ id: page.id, title: page.title, kind: "event", start: page.start, end: page.end, excerpt: page.excerpt }));
  return [...stages, ...events].sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
}
