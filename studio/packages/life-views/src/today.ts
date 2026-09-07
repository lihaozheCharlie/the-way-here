import type { ConversationPrompt, FocusWorkspaceView, GraphData, PageCategory, StateSignal, TodayView, WikiLink, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { extractWikiLinks, type WikiIndex } from "@the-way-here/wiki-core";
import { semanticDate, resolveLink, uniquePages, stripMarkdown, splitMarkdownTableRow } from "./page-utils.js";
import { buildLifeMap } from "./life-map.js";

function latestDateIn(value: string, fallbackYear: string): string | undefined {
  const dates = [...value.matchAll(/(?:19|20)\d{2}[-年/.](?:1[0-2]|0?[1-9])(?:[-月/.](?:3[01]|[12]\d|0?[1-9])日?)?/g)]
    .map((match) => match[0].replace(/[年/.]/g, "-").replace(/月/g, "-").replace(/日/g, ""))
    .map((date) => date.split("-").map((part, index) => index === 0 ? part : part.padStart(2, "0")).join("-"));
  const partialDates = [...value.matchAll(/(?<!\d)(?:1[0-2]|0?[1-9])[./月](?:3[01]|[12]\d|0?[1-9])日?(?!\d)/g)].map((match) => {
    const [month, day] = match[0].replace(/月/g, ".").replace(/日/g, "").split(".");
    return `${fallbackYear}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  });
  return [...dates, ...partialDates].sort().at(-1);
}

export function parseStateSignals(page?: WikiPage): StateSignal[] {
  if (!page) return [];
  const section = page.sections.find((item) => item.heading === "当前追踪面板");
  if (!section) return [];
  const lines = section.body.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  if (lines.length < 3) return [];
  return lines.slice(2).flatMap((line) => {
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 4) return [];
    const links: WikiLink[] = [];
    for (const match of cells.slice(4).join("|").matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      links.push({ raw: match[0], target: match[1]!, label: match[2] || match[1]! });
    }
    return [{
      id: stripMarkdown(cells[0] || ""),
      name: stripMarkdown(cells[0] || ""),
      kind: stripMarkdown(cells[1] || ""),
      judgment: stripMarkdown(cells[2] || ""),
      observation: stripMarkdown(cells[3] || ""),
      links,
    }];
  });
}

function labeledValue(body: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`^\\s*-\\s*${escaped}[：:]\\s*(.+)$`, "m"))?.[1]?.trim() || "";
}

export function parseConversationPrompts(page?: WikiPage): ConversationPrompt[] {
  if (!page) return [];
  return page.sections.flatMap((section) => {
    if (section.level !== 2) return [];
    const question = stripMarkdown(labeledValue(section.body, "问题"));
    const currentUnderstanding = stripMarkdown(labeledValue(section.body, "当前理解"));
    const reason = stripMarkdown(labeledValue(section.body, "为什么现在"));
    const unknown = stripMarkdown(labeledValue(section.body, "仍然未知"));
    if (!question || !currentUnderstanding || !reason || !unknown) return [];
    const statusValue = stripMarkdown(labeledValue(section.body, "状态")).toLowerCase();
    const status: ConversationPrompt["status"] = statusValue === "paused" || statusValue === "archived" ? statusValue : "active";
    if (status !== "active") return [];
    const parsedWeight = Number(labeledValue(section.body, "权重"));
    const weight = Number.isFinite(parsedWeight) ? Math.max(1, Math.min(5, Math.round(parsedWeight))) : 1;
    const rawLinks = extractWikiLinks(labeledValue(section.body, "相关知识"));
    const links = rawLinks.map((link) => page.outgoingLinks.find((candidate) => candidate.raw === link.raw || candidate.target === link.target) || link);
    return [{
      id: `${page.id}#${stripMarkdown(section.heading)}`,
      title: stripMarkdown(section.heading),
      question,
      currentUnderstanding,
      reason,
      unknown,
      observation: stripMarkdown(labeledValue(section.body, "观察信号")) || undefined,
      links,
      status,
      weight,
    }];
  });
}

function prioritizeSignals(signals: StateSignal[]): StateSignal[] {
  const years = signals.flatMap((signal) => [...`${signal.judgment} ${signal.observation}`.matchAll(/(?:19|20)\d{2}/g)].map((match) => match[0]));
  const fallbackYear = years.sort().at(-1) || String(new Date().getFullYear());
  const dated = signals.map((signal) => latestDateIn(`${signal.judgment} ${signal.observation}`, fallbackYear));
  const newest = dated.filter(Boolean).sort().at(-1);
  return signals.map((signal, index) => {
    const evidenceDate = dated[index];
    const score = (signal.kind.includes("需要关注") ? 40 : signal.kind.includes("优势") ? 6 : 18)
      + (evidenceDate && evidenceDate === newest ? 40 : evidenceDate ? 15 : 0)
      + Math.min(signal.links.length * 3, 15);
    const reason = evidenceDate && evidenceDate === newest
      ? `最近证据更新于 ${evidenceDate}，并连接 ${signal.links.length} 个知识页面`
      : signal.kind.includes("需要关注")
        ? `状态面板标记为需要关注，并连接 ${signal.links.length} 个知识页面`
        : `来自当前状态面板的持续观察`;
    return { ...signal, score, reason };
  }).sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function buildToday(index: WikiIndex): TodayView {
  const stages = index.list({ category: "life-stages" }).filter((page) => !page.title.includes("总览"));
  const letters = index.list({ category: "letters" }).filter((page) => !page.title.includes("总览"));
  const events = index.list({ category: "events" }).filter((page) => !page.title.includes("总览"));
  const lifeMap = buildLifeMap(index);
  const currentStages = lifeMap.stages.filter((stage) => stage.current).map((stage) => ({
    page: stage.page,
    range: stage.range,
    focus: stage.focus,
    lane: stage.lane,
  }));
  const currentStage = currentStages[0]?.page || stages.sort((a, b) => semanticDate(b).localeCompare(semanticDate(a)))[0];
  const latestLetter = letters.sort((a, b) => semanticDate(b).localeCompare(semanticDate(a)))[0];
  const latestEvent = events.sort((a, b) => semanticDate(b).localeCompare(semanticDate(a)))[0];
  const stateSummary = index.list({ category: "state" }).find((page) => page.title === "状态追踪总览");
  const conversationPromptPage = index.list({ category: "state" }).find((page) => page.type === "conversation_prompts" || page.title === "值得聊聊");
  const stateSignals = parseStateSignals(stateSummary ? index.get(stateSummary.id) : undefined);
  const focusCandidates = prioritizeSignals(stateSignals);
  const conversationPrompts = parseConversationPrompts(conversationPromptPage ? index.get(conversationPromptPage.id) : undefined);
  const focusPages = uniquePages((focusCandidates[0]?.links || [])
    .map((link) => resolveLink(index, link)))
    .filter((page) => !page.isSource && !["home", "maintenance", "state"].includes(page.category))
    .slice(0, 6);
  const recentPages = index
    .list({ sources: false })
    .filter((page) => !["home", "maintenance", "sources"].includes(page.category))
    .sort((a, b) => semanticDate(b).localeCompare(semanticDate(a)))
    .slice(0, 8);
  const guidingQuestion = focusCandidates[0]?.judgment;
  return { currentStage, currentStages, latestLetter, latestEvent, stateSignals, focusCandidates, conversationPrompts, focusPages, recentPages, guidingQuestion };
}

const focusCategoryLabels: Partial<Record<PageCategory, string>> = {
  "personal-lines": "长期主线", cycles: "反复循环", systems: "现实系统", "mental-models": "可用模型",
  "life-stages": "人生阶段", events: "关键事件", entities: "相关人物与地点", letters: "近况回信", sources: "原始证据",
};

export function buildFocusWorkspace(index: WikiIndex, signalId?: string): FocusWorkspaceView | undefined {
  const today = buildToday(index);
  const signal = today.focusCandidates.find((item) => item.id === signalId) || today.focusCandidates[0];
  if (!signal) return undefined;
  const directlyLinked = uniquePages(signal.links.map((link) => resolveLink(index, link)));
  const related = new Map<string, WikiPageSummary>();
  for (const pageSummary of directlyLinked) {
    const page = index.get(pageSummary.id);
    related.set(pageSummary.id, pageSummary);
    for (const link of page?.outgoingLinks || []) {
      const linked = resolveLink(index, link);
      if (linked && !["home", "maintenance"].includes(linked.category)) related.set(linked.id, linked);
    }
    for (const incoming of page?.incomingLinks || []) {
      if (!["home", "maintenance"].includes(incoming.category)) related.set(incoming.id, incoming);
    }
  }
  const grouped = [...related.values()].reduce<Map<PageCategory, WikiPageSummary[]>>((result, page) => {
    const entries = result.get(page.category) || [];
    entries.push(page);
    result.set(page.category, entries);
    return result;
  }, new Map());
  const relatedGroups = [...grouped.entries()]
    .filter(([category]) => focusCategoryLabels[category])
    .map(([category, pages]) => ({ category, label: focusCategoryLabels[category]!, pages: pages.sort((a, b) => semanticDate(b).localeCompare(semanticDate(a))).slice(0, 8) }))
    .sort((a, b) => Number(["personal-lines", "cycles", "systems", "mental-models"].includes(b.category)) - Number(["personal-lines", "cycles", "systems", "mental-models"].includes(a.category)));
  const kindFor = (page: WikiPageSummary): "source" | "letter" | "event" | "wiki" => page.isSource ? "source" : page.category === "letters" ? "letter" : page.category === "events" ? "event" : "wiki";
  const evidenceTimeline = [...related.values()]
    .filter((page) => page.isSource || ["letters", "events"].includes(page.category) || directlyLinked.some((direct) => direct.id === page.id))
    .map((page) => ({ date: semanticDate(page), label: page.title, excerpt: page.excerpt, kind: kindFor(page), page }))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const focusNodeId = `focus:${signal.id}`;
  const allowed = new Set([...related.keys(), ...directlyLinked.map((page) => page.id)]);
  const graphLinks: GraphData["links"] = directlyLinked.map((page) => ({ source: focusNodeId, target: page.id }));
  for (const id of allowed) {
    const page = index.get(id);
    for (const link of page?.outgoingLinks || []) if (link.resolvedId && allowed.has(link.resolvedId)) graphLinks.push({ source: id, target: link.resolvedId });
  }
  const graphPages = [...related.values()].slice(0, 45);
  const graph: GraphData = {
    focusId: focusNodeId,
    nodes: [{ id: focusNodeId, title: signal.name, category: "state", degree: directlyLinked.length, distance: 0 }, ...graphPages.map((page) => ({ id: page.id, title: page.title, category: page.category, distance: directlyLinked.some((item) => item.id === page.id) ? 1 : 2 }))],
    links: [...new Map(graphLinks.map((link) => [`${link.source}|${link.target}`, link])).values()].filter((link) => link.source === focusNodeId || graphPages.some((page) => page.id === link.source)).filter((link) => graphPages.some((page) => page.id === link.target)),
  };
  return { signal, candidates: today.focusCandidates, related: relatedGroups, evidenceTimeline, graph };
}
