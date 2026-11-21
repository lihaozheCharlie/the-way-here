import type { DreamDateRange, DreamPoint, DreamPointCandidate, DreamPointDescription, DreamPointNotes, DreamStartInput, WikiPage, WikiPageSummary, WikiRun } from "@the-way-here/shared";
import { bodyLines, datesIn, type WikiIndex } from "@the-way-here/wiki-core";
import { buildLifeMap } from "./life-map.js";

export class DreamInputError extends Error {}

export function isDreamDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new DreamInputError("入梦请求包含无效字段");
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length > max) throw new DreamInputError(`这项内容最多 ${max} 字`);
  return value.trim() || undefined;
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function notes(input: Record<string, unknown>, preserveEmpty = false): DreamPointNotes {
  const text = (value: unknown, max: number) => optionalText(value, max) ?? (preserveEmpty && typeof value === "string" ? "" : undefined);
  return { situation: text(input.situation, 2400), actualChoice: text(input.actualChoice, 1200), aftermath: text(input.aftermath, 2400), scenario: text(input.scenario, 2400) };
}

function readDateRange(value: unknown): DreamDateRange {
  const { earliest, latest } = object(value, ["earliest", "latest"]);
  if (!isDreamDate(earliest) || !isDreamDate(latest) || earliest > latest) throw new DreamInputError("请提供有效的决策日期区间");
  return { earliest, latest };
}

export function parseDreamPointDescription(value: unknown): DreamPointDescription {
  const input = object(value, ["title", "decisionAt", "situation", "actualChoice", "aftermath", "scenario"]);
  const title = optionalText(input.title, 300);
  if (!title) throw new DreamInputError("请描述你想回到的时刻");
  return { title, decisionAt: input.decisionAt === undefined ? undefined : readDateRange(input.decisionAt), ...notes(input) };
}

export function parseDreamStart(value: unknown): DreamStartInput {
  const { knowledgeBaseId, point, runtimeId, previousRunId } = object(value, ["knowledgeBaseId", "point", "runtimeId", "previousRunId"]);
  if (typeof knowledgeBaseId !== "string" || !knowledgeBaseId.trim() || knowledgeBaseId.length > 150) throw new DreamInputError("请指定知识库");
  if (runtimeId !== undefined && runtimeId !== "codex" && runtimeId !== "pi" && runtimeId !== "auto") throw new DreamInputError("梦境运行方式无效");
  if (previousRunId !== undefined && (typeof previousRunId !== "string" || !uuid.test(previousRunId))) throw new DreamInputError("上一版梦境无效");
  const input = object(point, ["kind", "pageId", "pointId", "decisionAt", "question", "situation", "actualChoice", "aftermath", "scenario", "alternatives", "horizon", "supplement", "reviewFocus"]);
  const { kind, pageId, pointId, decisionAt, question, horizon, alternatives } = input;
  let source: DreamPoint["source"];
  if ((kind === "self-described" || kind === "conversation") && typeof pointId === "string" && uuid.test(pointId)) source = { kind, pointId };
  else if ((kind === "life-stage" || kind === "decision") && typeof pageId === "string" && pageId.trim() && pageId.length <= 1024) source = { kind, pageId };
  else throw new DreamInputError("请选择有效的入梦点");
  if (horizon !== undefined && horizon !== "one-year" && horizon !== "three-years" && horizon !== "now") throw new DreamInputError("梦境时间范围无效");
  let chosen: string[] | undefined;
  if (alternatives !== undefined) {
    if (!Array.isArray(alternatives) || !alternatives.length || alternatives.length > 3) throw new DreamInputError("请选择 1 至 3 条备选路径");
    chosen = alternatives.map(option => {
      const text = optionalText(option, 240);
      if (!text) throw new DreamInputError("备选路径不能为空");
      return text;
    });
    if (new Set(chosen).size !== chosen.length) throw new DreamInputError("备选路径重复");
  }
  return { knowledgeBaseId, runtimeId, previousRunId, point: {
    ...source, decisionAt: decisionAt === undefined ? undefined : readDateRange(decisionAt), question: optionalText(question, 1200),
    ...notes(input, true), alternatives: chosen, horizon, supplement: optionalText(input.supplement, 2400), reviewFocus: optionalText(input.reviewFocus, 300),
  } };
}

function stageDreamPoint(page: WikiPageSummary): DreamPointCandidate {
  const stageStart = isDreamDate(page.start) ? page.start : undefined;
  const stageEnd = isDreamDate(page.end) ? page.end : undefined;
  return {
    source: { kind: "life-stage", pageId: page.id },
    title: page.title, stageStart, stageEnd,
    suggestedDecisionAt: stageEnd ? { earliest: stageEnd, latest: stageEnd } : undefined,
  };
}

export function listDreamPoints(index: WikiIndex): DreamPointCandidate[] {
  return buildLifeMap(index).stages.map(stage => stageDreamPoint(stage.page));
}

const decisionCue = /如果当时|如果那时|如果当年|最终选择|放弃|决定|辞职|离职|转岗|入职|签约|搬家|结婚|分手|报考|录取|留学|住校|转学|入学|搬迁|毕业选择/;
const clean = (value: string) => value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$1").replace(/^[-#*\s]+/, "").trim();

function suggestedDecisionDate(page: WikiPage): DreamDateRange | undefined {
  const titleDate = datesIn(page.title).find(isDreamDate);
  const start = isDreamDate(page.start) ? page.start : undefined;
  const end = isDreamDate(page.end) ? page.end : undefined;
  const references = page.properties.evidence_sources;
  const within = (date: string) => (!start || date >= start) && (!end || date <= end);
  const datedReferences = Array.isArray(references) ? [...new Set(references.flatMap(ref =>
    typeof ref === "string" ? datesIn(ref.split("/").at(-1) ?? "").filter(isDreamDate).filter(within) : []))] : [];
  const exact = titleDate && within(titleDate) ? titleDate : datedReferences.length === 1 ? datedReferences[0] : undefined;
  if (exact) return { earliest: exact, latest: exact };
  if (start) return { earliest: start, latest: end && end >= start ? end : start };
}

export function discoverDreamPoints(index: WikiIndex, includeSources = false): DreamPointCandidate[] {
  const { stages, events } = buildLifeMap(index);
  const stageByEvent = new Map(stages.flatMap(stage => stage.relatedEvents.map(event => [event.id, stage.page] as const)));
  const pages = includeSources ? [...events, ...index.list({ sources: true })] : events;
  return pages.flatMap(page => {
    if (/总览|索引|时间线/.test(page.title)) return [];
    const full = index.get(page.id);
    if (!full) return [];
    const text = page.isSource ? bodyLines(full.markdown).map(row => row.text).join("\n") : page.excerpt;
    const clue = text.split("\n").find(line => decisionCue.test(line) && !line.startsWith("#") && !/^\s*[- ]*\[\[.+\]\]\s*$/.test(line));
    if (page.isSource && !clue) return [];
    const range = suggestedDecisionDate(full);
    if (!range) return [];
    const date = range.earliest;
    const stage = stageByEvent.get(page.id) ?? (page.isSource ? stages.filter(({ page: stage }) =>
      isDreamDate(stage.start) && stage.start <= date && (!isDreamDate(stage.end) || date <= stage.end)).at(-1)?.page : undefined);
    return [{
      source: { kind: "decision" as const, pageId: page.id }, title: page.title,
      suggestedDecisionAt: range, stageId: stage?.id, stageTitle: stage?.title, stageStart: stage?.start, stageEnd: stage?.end,
      reason: clean(clue ?? text).slice(0, 240),
    }];
  }).slice(0, 100);
}

export function getDreamSuggestions(index: WikiIndex, pageId: string) {
  const page = index.get(pageId);
  const sections = page?.sections ?? [];
  const choiceLabel = /^(?:最终选择|最终决定|实际选择)[：:]\s*(\S.*)$/;
  const decisionBody = sections.find(s => /最终决策|实际选择/.test(s.heading))?.body ?? "";
  const actualChoice = decisionBody.split("\n")
    .map(line => clean(line).replace(/\*\*/g, ""))
    .filter(line => !/[？?]$/.test(line))
    .map(line => line.match(choiceLabel)?.[1]).find(Boolean) ??
    (`${decisionBody}\n${page?.excerpt ?? ""}`.match(/[^。！？!?\n]+[。！？!?]?/g) ?? [])
      .filter(sentence => !/[？?]$/.test(sentence))
      .map(sentence => clean(sentence).match(/(?:最终|最后)[^。！？\n]{0,80}?(?:选择了?|决定了?)[：:]?([^。！？\n]{2,120})/)?.[1]?.trim())
      .find(Boolean);
  const alternatives = sections.filter(s => /可选方案|如果重新来过|备选方案/.test(s.heading)).flatMap(section =>
    section.body.split("\n").flatMap(line => {
      if (line.trim().startsWith("|")) {
        const cells = line.split("|").slice(1,-1).map(clean);
        return cells.some(cell => /未选择|备选|考虑过|未采纳/.test(cell)) && cells[0] ? [cells[0]] : [];
      }
      return /^\s*[-*]\s/.test(line) && !/已选择|最终选择/.test(line) ? [clean(line)] : [];
    }));
  return { actualChoice: actualChoice?.slice(0, 1200), suggestions: [...new Set(alternatives)].filter(Boolean).slice(0, 3).map(text => text.slice(0, 240)) };
}

export function resolveDreamPoint(index: WikiIndex, input: DreamStartInput["point"], today: string, saved?: DreamPointDescription): DreamPoint {
  const { decisionAt, question, alternatives, horizon, supplement, reviewFocus, situation, actualChoice, aftermath, scenario } = input;
  const preparation = { question, alternatives, horizon, supplement, reviewFocus };
  if ("pointId" in input) {
    if (!saved) throw new DreamInputError("当前知识库没有这个自述入梦点");
    const at = decisionAt ?? saved.decisionAt;
    if (!at || at.latest > today) throw new DreamInputError("请确认不晚于今天的入梦日期");
    return { source: { kind: input.kind, pointId: input.pointId }, title: saved.title, decisionAt: at, ...preparation,
      situation: situation ?? saved.situation, actualChoice: actualChoice ?? saved.actualChoice, aftermath: aftermath ?? saved.aftermath, scenario: scenario ?? saved.scenario };
  }
  const { kind, pageId } = input;
  const page = index.get(pageId);
  const stage = kind === "life-stage" && page && (page.category === "life-stages" && !page.title.includes("总览") ||
    buildLifeMap(index).stages.some(item => item.page.id === pageId)) ? stageDreamPoint(page) : undefined;
  if (kind === "life-stage" ? !stage : !page || !page.isSource && page.category !== "events") throw new DreamInputError("当前知识库没有这个入梦点");
  const at = decisionAt ?? stage?.suggestedDecisionAt ?? (kind === "decision" && page ? suggestedDecisionDate(page) : undefined);
  if (!at || at.latest > today || (stage?.stageStart && at.earliest < stage.stageStart) ||
    (stage?.stageEnd && at.latest > stage.stageEnd)) throw new DreamInputError("请确认历史决策日期");
  return { source: { kind, pageId }, title: stage?.title ?? page!.title, stageStart: stage?.stageStart, decisionAt: at, ...preparation,
    situation, actualChoice, aftermath, scenario };
}

export function discoverDreamConversations(runs: WikiRun[], today: string): Array<{ id: string; point: DreamPointDescription }> {
  return runs.filter(run => run.status === "completed" && !run.outputTarget && !run.sourceContext && run.mode !== "validate")
    .flatMap(run => {
      const text = run.displayPrompt || run.prompt;
      const line = text.split("\n").find(line => decisionCue.test(line) && datesIn(line).length);
      const date = line && datesIn(line)[0];
      if (!line || !date || date > today) return [];
      return [{ id: run.id, point: { title: clean(run.title || line).slice(0, 300), situation: line.slice(0, 2400), decisionAt: { earliest: date, latest: date } } }];
    }).slice(0, 50);
}
