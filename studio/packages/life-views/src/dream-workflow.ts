import type { DreamCitation, DreamFinding, DreamGroundFact, DreamReport } from "@the-way-here/shared";
import { bodyLines } from "@the-way-here/wiki-core";
import { isDreamDate } from "./dream-points.js";

type DreamGate = { checkId: string; verdict: DreamFinding["verdict"] };

export interface DreamCheck {
  id: string;
  question: string;
  when?: DreamGate;
}

export interface DreamBranch {
  id: string;
  title: string;
  intervention: string;
  divergence?: string;
  checks: DreamCheck[];
  stopWhen?: DreamGate;
}

export interface DreamStoryBibleEntry {
  aspect: string;
  text: string;
}

export interface DreamPlan {
  title?: string;
  decision: string;
  branches: DreamBranch[];
  branchLimitReason?: string;
  storyBible?: DreamStoryBibleEntry[];
}

export interface DreamDraft {
  outcome?: string;
  timeline: Array<{ horizon: string; date?: string; possibility: string; condition: string; basis: DreamCitation[] }>;
  gaps: string[];
}

export interface DreamReview extends Pick<DreamReport, "actualTimeline" | "unchanged" | "changed" | "takeaways" | "comparison" | "backtest"> {
  summary: string;
  actualPath: DreamFinding;
  reviews: Array<{ branchId: string; claims: DreamFinding[] }>;
  calibration?: DreamFinding[];
}

type Corpus = { pages: Array<{ pageId: string; markdown: string }> };

function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
    throw new Error("工作流输出的字段不符合约定");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("工作流输出缺少有效的文本");
  return value.trim();
}

function id(value: unknown): string {
  const key = string(value, 32);
  if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error("工作流标识无效");
  return key;
}

/** Display lists tolerate a model writing past the cap: keep the first max entries instead of failing the run. */
function capped(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value)) throw new Error("工作流输出的列表不符合约定");
  return value.slice(0, max);
}

function verdict(value: unknown): DreamFinding["verdict"] {
  if (value !== "supported" && value !== "partial" && value !== "contradicted" && value !== "unknown") throw new Error("工作流核验结论无效");
  return value;
}

function gate(value: unknown, availableChecks: ReadonlySet<string>): DreamGate | undefined {
  if (value === undefined) return;
  const input = record(value, ["checkId", "verdict"]);
  const checkId = id(input.checkId);
  if (!availableChecks.has(checkId)) throw new Error("梦境检查必须依赖同一分支的前置检查");
  return { checkId, verdict: verdict(input.verdict) };
}

function citations(value: unknown, corpus: Corpus): DreamCitation[] {
  return capped(value, 6).map(item => {
    const input = record(item, ["pageId", "line", "quote"]);
    const pageId = string(input.pageId, 1024);
    const quote = string(input.quote, 300);
    const line = input.line;
    const page = corpus.pages.find(candidate => candidate.pageId === pageId);
    if (typeof line !== "number" || !Number.isSafeInteger(line) || !page ||
      !bodyLines(page.markdown).some(row => row.line === line && row.text.includes(quote))) {
      throw new Error("梦境引文与绑定的原文及行号不一致");
    }
    return { pageId, quote, line };
  });
}

export function parseDreamJson(answer: string): unknown {
  if (answer.length > 64_000) throw new Error("工作流输出超过大小限制");
  const text = answer.trim();
  return JSON.parse(/^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i.exec(text)?.[1] ?? text);
}

export function parseDreamGrounding(value: unknown, corpus: Corpus & { catalogue: Array<{ pageId: string; isSource: boolean }> }, cutoff: string): { facts: DreamGroundFact[] } {
  const input = record(value, ["facts"]);
  const primaryIds = new Set(corpus.catalogue.filter(page => page.isSource).map(page => page.pageId));
  const primary = { pages: corpus.pages.filter(page => primaryIds.has(page.pageId)) };
  const facts = capped(input.facts, 8).map(item => {
    const fact = record(item, ["text", "knownBy", "evidence"]);
    const knownBy = fact.knownBy;
    const text = string(fact.text, 280);
    const evidence = citations(fact.evidence, primary);
    if (!isDreamDate(knownBy) || knownBy > cutoff || !evidence.length || /[\r\n]/.test(text) ||
      text === "---" || /\[\[|\]\(|<[^>]*>/.test(text)) {
      throw new Error("入梦事实必须有原始引文、单行摘要和符合入梦时点的日期");
    }
    return { text, knownBy, evidence };
  });
  return { facts };
}

export function parseDreamPlan(value: unknown, expanded = false, selectedCount?: number): DreamPlan {
  const input = record(value, ["title", "decision", "branches", "branchLimitReason", "storyBible"]);
  const branchIds = new Set<string>();
  const interventions = new Set<string>();
  const branches = capped(input.branches, 3).map(item => {
    const branch = record(item, ["id", "title", "intervention", "divergence", "checks", "stopWhen"]);
    const branchId = id(branch.id);
    const intervention = string(branch.intervention, 300);
    if (branchIds.has(branchId) || interventions.has(intervention)) throw new Error("梦境分支重复");
    branchIds.add(branchId);
    interventions.add(intervention);
    const divergence = branch.divergence === undefined ? undefined : string(branch.divergence, 240);
    const previous = new Set<string>();
    const checks = capped(branch.checks, 4).map(item => {
      const check = record(item, ["id", "question", "when"]);
      const checkId = id(check.id);
      if (previous.has(checkId)) throw new Error("梦境检查项重复");
      const when = gate(check.when, previous);
      previous.add(checkId);
      return { id: checkId, question: string(check.question), when };
    });
    const stopWhen = gate(branch.stopWhen, previous);
    if (expanded && stopWhen) throw new Error("备选分支必须完成条件推演，不能用现实路径的核验结果终止");
    return { id: branchId, title: string(branch.title, 120), intervention, divergence, checks, stopWhen };
  });
  const storyBible = input.storyBible === undefined ? undefined : capped(input.storyBible, 8).map(item => {
    const entry = record(item, ["aspect", "text"]);
    return { aspect: string(entry.aspect, 24), text: string(entry.text, 280) };
  });
  const branchLimitReason = input.branchLimitReason === undefined ? undefined : string(input.branchLimitReason);
  if (selectedCount !== undefined && branches.length !== selectedCount) throw new Error("推演分支必须逐条对应你选择的假如");
  if (expanded && selectedCount === undefined && branches.length < 2 && !branchLimitReason) throw new Error("需要至少两条备选路径，或说明无法展开的具体约束");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  return {
    title: title.length <= 60 ? title || undefined : undefined,
    decision: string(input.decision), branches, branchLimitReason, storyBible: storyBible?.length ? storyBible : undefined,
  };
}

export function parseDreamFinding(value: unknown, corpus: Corpus): DreamFinding {
  const input = record(value, ["text", "verdict", "evidence", "revision"]);
  const assessment = verdict(input.verdict);
  const evidence = citations(input.evidence, corpus);
  if (assessment !== "unknown" && !evidence.length) throw new Error("支持或反驳必须有原文证据");
  const revision = assessment === "contradicted" && input.revision !== undefined ? string(input.revision, 1000) : undefined;
  return { text: string(input.text, 1000), verdict: assessment, evidence, revision };
}

export function parseDreamDraft(value: unknown, corpus: Corpus, since?: string, until?: string, allowUncited = false): DreamDraft {
  const input = record(value, ["outcome", "timeline", "gaps"]);
  const timeline = capped(input.timeline, 5).map(item => {
    const entry = record(item, ["horizon", "date", "possibility", "condition", "basis"]);
    const basis = citations(entry.basis, corpus);
    if (!basis.length && !allowUncited) throw new Error("分支推演缺少决策时证据");
    const date = entry.date;
    if (date !== undefined && (!isDreamDate(date) || (since && date < since) || (until && date > until))) throw new Error("推演节点日期超出梦境范围");
    const condition = entry.condition === "" ? "" : string(entry.condition);
    return { horizon: string(entry.horizon, 100), date, possibility: string(entry.possibility, 1000), condition, basis };
  });
  const gaps = capped(input.gaps, 6).map(item => string(item));
  if (!timeline.length && !gaps.length) throw new Error("没有可推演的路径时必须说明缺口");
  const outcome = typeof input.outcome === "string" ? input.outcome.trim() : "";
  return { outcome: timeline.length && outcome.length <= 240 ? outcome || undefined : undefined, timeline, gaps };
}

export function parseDreamReview(value: unknown, corpus: Corpus, expected: Array<{ id: string; count: number }>, until?: string, blind: string[] = [], comparisonBranches = expected): DreamReview {
  const input = record(value, ["summary", "actualPath", "reviews", "actualTimeline", "unchanged", "changed", "takeaways", "comparison", "calibration", "backtest"]);
  const ids = new Set<string>();
  const reviews = capped(input.reviews, expected.length).map(item => {
    const review = record(item, ["branchId", "claims"]);
    const branchId = id(review.branchId);
    const branch = expected.find(candidate => candidate.id === branchId);
    if (!branch || ids.has(branchId)) throw new Error("事后验证包含未知或重复分支");
    ids.add(branchId);
    const claims = capped(review.claims, branch.count).map(claim => parseDreamFinding(claim, corpus));
    if (claims.length !== branch.count) throw new Error("事后验证必须逐条覆盖该分支的推演");
    return { branchId, claims };
  });
  if (reviews.length !== expected.length) throw new Error("事后验证缺少分支");
  const actualTimeline = input.actualTimeline === undefined ? undefined : capped(input.actualTimeline, 8).map(item => {
    const entry = record(item, ["date", "finding"]);
    if (!isDreamDate(entry.date) || (until && entry.date > until)) throw new Error("现实节点日期超出梦境范围");
    return { date: entry.date, finding: parseDreamFinding(entry.finding, corpus) };
  });
  const comparison = input.comparison === undefined ? undefined : capped(input.comparison, 6).map(item => {
    const row = record(item, ["dimension", "actual", "branches"]);
    const keys = new Set<string>();
    const branches = capped(row.branches, comparisonBranches.length).map(item => {
      const cell = record(item, ["id", "text", "relation", "claimIndex"]);
      const key = id(cell.id);
      const branch = comparisonBranches.find(candidate => candidate.id === key);
      if (!branch || keys.has(key)) throw new Error("对比包含无效的梦境分支");
      keys.add(key);
      const claimIndex = cell.claimIndex;
      if (claimIndex !== undefined && (typeof claimIndex !== "number" || !Number.isInteger(claimIndex) || claimIndex < 0 || claimIndex >= branch.count)) {
        throw new Error("对比依据必须对应本分支的推演节点");
      }
      return { id: key, text: string(cell.text, 280), claimIndex,
        relation: cell.relation === undefined ? undefined : string(cell.relation, 24) };
    });
    return { dimension: string(row.dimension, 80), actual: string(row.actual, 280), branches };
  });
  const calibration = input.calibration === undefined ? undefined : capped(input.calibration, blind.length).map(item => parseDreamFinding(item, corpus));
  if ((calibration?.length ?? 0) !== blind.length) throw new Error("回测需要覆盖所有盲推节点");
  return { summary: string(input.summary, 1600), actualPath: parseDreamFinding(input.actualPath, corpus), reviews,
    actualTimeline, comparison,
    unchanged: input.unchanged === undefined ? undefined : string(input.unchanged, 360),
    changed: input.changed === undefined ? undefined : string(input.changed, 360),
    takeaways: input.takeaways === undefined ? undefined : capped(input.takeaways, 3).map(item => string(item, 500)),
    backtest: calibration?.map((review, index) => ({ claim: blind[index]!, review })),
    ...(calibration ? { calibration } : {}),
  };
}
