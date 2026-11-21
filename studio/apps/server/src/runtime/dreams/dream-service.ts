import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DreamInputError, discoverDreamConversations, discoverDreamPoints, getDreamSuggestions, listDreamPoints, parseDreamDraft, parseDreamFinding, parseDreamGrounding, parseDreamJson, parseDreamPlan,
  parseDreamReview, resolveDreamPoint, type DreamBranch, type DreamDraft, type DreamPlan, type DreamReview, type DreamStoryBibleEntry,
} from "@the-way-here/life-views";
import type { DreamCitation, DreamFinding, DreamGroundFact, DreamPoint, DreamPointCandidate, DreamPointDescription, DreamReport, WikiPageSummary, WikiRun, DreamRun, DreamRunListItem, DreamStartInput } from "@the-way-here/shared";
import { dreamTitle } from "@the-way-here/shared";
import { buildDreamEvidence, datesIn, dreamGroundPageId, dreamRecordDate, dreamStoryBiblePageId, parseRetrievalPolicy, withDreamGroundFacts, withDreamStoryBible } from "@the-way-here/wiki-core";
import { executableTool } from "../../services/bundled-tools.js";
import type { AgentExecutionRef, AgentRuntimeProvider } from "../agent-runtime/types.js";
import type { KnowledgeRuntime } from "../knowledge-runtime.js";
import { executeDreamTurn } from "./dream-execution.js";
import { DreamStore, dreamDigest, isActiveDream, isDreamRunId, type DreamLibraryState, type StoredDream } from "../../modules/dreams/dream-store.js";

const skillRoot = "knowledge-engine/skills";
const retrieval = skillRoot + "/common/retrieval";
const dreaming = skillRoot + "/consume/dreaming";
const turnTimeoutMinutes = 20;
const cancelled = new Error("用户已取消本次梦境");
const shutdown = new Error("Studio 已关闭");
const transientFiles = ["decision-evidence.json", "review-evidence.json", "grounded-evidence.json", "bible-evidence.json", "inputs.json", "evidence-reader.py"];

type Evidence = ReturnType<typeof buildDreamEvidence>;
type Phase = "ground" | "plan" | "verify" | "enrich" | "organize" | "refine" | "calibrate" | "review";
const phaseLabels: Record<Phase, string> = {
  ground: "还原当时", plan: "规划分岔", verify: "查找分支依据", enrich: "补充分支依据",
  organize: "推演分支", refine: "审梦修订", calibrate: "盲推实际选择以回测", review: "核对并整理结果",
};
interface BranchAnalysis {
  draft: DreamDraft;
  verified: DreamFinding;
  checks: Record<string, DreamFinding>;
  stoppingFinding?: DreamFinding;
}
type BranchResult = { branch: DreamBranch; analysis?: BranchAnalysis; error?: string };

interface DreamInputs {
  protocolVersion?: 2;
  fingerprint: string;
  instructions: string;
  sourceIds: Record<string, string>;
  sourceDates?: Record<string, string>;
  postDecisionEvidence?: boolean;
  decisionDigest: string;
  reviewDigest: string;
  readerDigest: string;
}

interface Context {
  state: StoredDream;
  decision: Evidence["decision"];
  review: Evidence["review"];
  inputs: DreamInputs;
  signal: AbortSignal;
  groundedFacts?: DreamGroundFact[];
  storyBible?: DreamStoryBibleEntry[];
}

class DreamStepError extends Error {}
export class DreamBusyError extends Error {}
export class DreamRuntimeError extends Error {}

function localDate() {
  const today = new Date();
  return [today.getFullYear(), today.getMonth() + 1, today.getDate()].map(n => String(n).padStart(2, "0")).join("-");
}

function horizonDate(start: string, horizon: DreamStartInput["point"]["horizon"]) {
  const today = localDate();
  if (!horizon || horizon === "now") return today;
  const [year, month, day] = start.split("-").map(Number) as [number, number, number];
  const endYear = year + (horizon === "one-year" ? 1 : 3);
  const lastDay = new Date(Date.UTC(endYear, month, 0)).getUTCDate();
  const end = new Date(Date.UTC(endYear, month - 1, Math.min(lastDay, day))).toISOString().slice(0, 10);
  return end < today ? end : today;
}

function evidenceAvailability(point: DreamPoint, pages: WikiPageSummary[], until: string) {
  const { earliest, latest } = point.decisionAt;
  const sources = pages.flatMap(page => {
    const date = dreamRecordDate(page);
    return date ? [{ page, date }] : [];
  });
  const later = (date: string) => date > latest && date <= until;
  const supplement = datesIn(point.supplement ?? "").some(later);
  const aftermathDates = datesIn(point.aftermath ?? "");
  const aftermath = !!point.aftermath && (aftermathDates.length ? aftermathDates.some(later) : latest < until);
  return {
    before: sources.filter(({ page, date }) => (!page.importChannel || page.importChannel === "files") && date < earliest && (!page.end || page.end < earliest)).length + Number(!!point.situation),
    after: sources.filter(({ date }) => later(date)).length + Number(aftermath) + Number(supplement),
    sourceDates: Object.fromEntries(sources.map(({ page, date }) => [page.id, date])),
  };
}

function checkDreamTopic(point: DreamPoint) {
  if (/自杀|自伤|自残|亲人离世|重病去世|重大疾病/.test([point.title, point.question, ...point.alternatives ?? []].join(" "))) {
    throw new DreamInputError("这个时刻更适合聊聊。你可以从现在最想说的事开始。");
  }
}

const discoveryKey = ({ source }: DreamPointCandidate) => source.kind + ":" + ("pageId" in source ? source.pageId : source.pointId);
const unavailableReview: DreamFinding = { text: "入梦点之后缺少可核对的记录。", verdict: "unknown", evidence: [] };

export class DreamService {
  private readonly active = new Map<string, { id: string; controller: AbortController; work: Promise<void> }>();
  private readonly previews = new Map<string, { controller: AbortController; work: Promise<string[]> }>();
  private readonly runWrites = new Map<string, Promise<unknown>>();
  private readonly collectionWrites = new Map<string, Promise<unknown>>();
  private closed = false;

  constructor(
    private readonly knowledge: KnowledgeRuntime,
    private readonly runtimes: AgentRuntimeProvider,
    private readonly log: { error: (error: unknown) => void },
    private readonly store = new DreamStore(knowledge.vaultRoot),
    private readonly conversations?: (knowledgeBaseId: string) => Promise<WikiRun[]>,
  ) {}

  async candidates(knowledgeBaseId: string) {
    return listDreamPoints((await this.knowledge.resolve(knowledgeBaseId)).index);
  }

  async workspacePoints(knowledgeBaseId: string) {
    const [{ index }, collection] = await Promise.all([this.knowledge.resolve(knowledgeBaseId), this.store.collection(knowledgeBaseId)]);
    const defaultPoints = discoverDreamPoints(index);
    const recent = collection.discovered.length ? discoverDreamPoints(index, true)
      .filter(point => "pageId" in point.source && collection.discovered.includes(point.source.pageId)) : [];
    return {
      decisions: [...defaultPoints, ...recent.filter(point => !defaultPoints.some(item =>
        "pageId" in item.source && "pageId" in point.source && item.source.pageId === point.source.pageId)),
        ...Object.entries(collection.conversations ?? {}).map(([id, point]) => this.conversationPoint(id, point))]
        .map(point => ({ ...point, fresh: collection.freshPoints?.includes(discoveryKey(point)) || undefined })),
      described: Object.entries(collection.descriptions).map(([pointId, point]) => ({
        source: { kind: "self-described" as const, pointId }, title: point.title, suggestedDecisionAt: point.decisionAt,
        notes: { actualChoice: point.actualChoice, aftermath: point.aftermath, situation: point.situation, scenario: point.scenario },
      })),
      collection: { favorites: collection.favorites, insights: collection.insights.map(item => ({
        ...item, sourceDeleted: collection.deletedRuns?.includes(item.runId) || undefined,
      })), pointPreferences: collection.pointPreferences },
    };
  }

  async discover(knowledgeBaseId: string) {
    const { index } = await this.knowledge.resolve(knowledgeBaseId);
    const beforeScan = discoverDreamPoints(index).map(discoveryKey);
    const [, runs] = await Promise.all([index.rebuild(), this.conversations?.(knowledgeBaseId) ?? []]);
    const conversations = discoverDreamConversations(runs.filter(run => run.knowledgeBaseId === knowledgeBaseId), localDate());
    const wiki = discoverDreamPoints(index);
    const defaults = new Set(wiki.flatMap(point => "pageId" in point.source ? [point.source.pageId] : []));
    const candidates = discoverDreamPoints(index, true).filter(point => "pageId" in point.source && !defaults.has(point.source.pageId));
    return this.updateCollection(knowledgeBaseId, collection => {
      const known = new Set(collection.discovered);
      const fresh = candidates.filter(point => "pageId" in point.source && !known.has(point.source.pageId));
      collection.discovered = candidates.flatMap(point => "pageId" in point.source ? [point.source.pageId] : []);
      const newConversations = conversations.filter(item => !collection.conversations?.[item.id]);
      collection.conversations = Object.fromEntries(conversations.map(item => [item.id, item.point]));
      const seenWiki = new Set(collection.scannedWiki ?? beforeScan);
      collection.scannedWiki = wiki.map(discoveryKey);
      const found = [...wiki.filter(point => !seenWiki.has(discoveryKey(point))), ...fresh,
        ...newConversations.map(item => this.conversationPoint(item.id, item.point))];
      collection.freshPoints = found.map(discoveryKey);
      return found.map(point => ({ ...point, fresh: true }));
    });
  }

  private conversationPoint(id: string, point: DreamPointDescription) {
    return { source: { kind: "conversation" as const, pointId: id }, title: point.title, notes: { situation: point.situation },
      reason: point.situation?.slice(0, 240), suggestedDecisionAt: point.decisionAt };
  }

  async describe(knowledgeBaseId: string, description: DreamPointDescription) {
    if (description.decisionAt && description.decisionAt.latest > localDate()) throw new DreamInputError("入梦日期不能晚于今天");
    return this.updateCollection(knowledgeBaseId, collection => {
      const pointId = randomUUID();
      collection.descriptions[pointId] = description;
      return { source: { kind: "self-described" as const, pointId }, title: description.title,
        notes: { situation: description.situation, actualChoice: description.actualChoice, aftermath: description.aftermath, scenario: description.scenario },
        suggestedDecisionAt: description.decisionAt };
    });
  }

  async environment(input: DreamStartInput) {
    const { index } = await this.knowledge.resolve(input.knowledgeBaseId);
    const point = await this.resolvePoint(input, index);
    const until = horizonDate(point.decisionAt.latest, point.horizon);
    const { before, after } = evidenceAvailability(point, index.list(), until);
    const suggestions = "pageId" in point.source ? getDreamSuggestions(index, point.source.pageId) : { suggestions: [] };
    return { before, after, until, ...suggestions };
  }

  recommend(input: DreamStartInput, signal: AbortSignal) {
    const { knowledgeBaseId } = input;
    if (this.closed) throw shutdown;
    if (this.previews.has(knowledgeBaseId)) throw new DreamBusyError("这个知识库正在推荐备选");
    const controller = new AbortController();
    const bounded = AbortSignal.any([controller.signal, signal, AbortSignal.timeout(90_000)]);
    const work = this.recommendChoices(input, bounded).finally(() => this.previews.delete(knowledgeBaseId));
    this.previews.set(knowledgeBaseId, { controller, work });
    return work;
  }

  private async recommendChoices(input: DreamStartInput, signal: AbortSignal) {
    const { knowledgeBaseId } = input;
    const { index, config } = await this.knowledge.resolve(knowledgeBaseId);
    const point = await this.resolvePoint(input, index);
    checkDreamTopic(point);
    const root = this.knowledge.vaultRoot;
    const readerPath = process.env.TWH_BUNDLED_ENGINE
      ? executableTool(retrieval + "/scripts/evidence_reader.py", root)
      : path.join(root, retrieval, "scripts/evidence_reader.py");
    const [policy, reader, selection] = await Promise.all([
      readFile(path.join(root, retrieval, "references/source-policy.json"), "utf8"),
      readFile(readerPath, "utf8"),
      this.runtimes.resolve(input.runtimeId, undefined, undefined).catch(error => { throw new DreamRuntimeError(this.message(error)); }),
    ]);
    signal.throwIfAborted();
    const pages = index.list().map(page => index.get(page.id)!);
    const { decision } = buildDreamEvidence(knowledgeBaseId, pages, point.decisionAt.earliest, parseRetrievalPolicy(JSON.parse(policy)), point);
    const id = randomUUID();
    try {
      await this.store.writeJson(knowledgeBaseId, id, "decision-evidence.json", decision);
      const file = await this.store.file(knowledgeBaseId, id, "decision-evidence.json");
      if (!process.env.TWH_BUNDLED_ENGINE) await this.store.write(knowledgeBaseId, id, "evidence-reader.py", reader);
      const data = {
        decisionAt: point.decisionAt, title: point.title, question: point.question,
        actualChoiceToExclude: point.actualChoice, scenario: point.scenario,
      };
      const answer = await executeDreamTurn(selection.runtime, {
        cwd: root, mode: "read", strictReadOnly: true, config, model: selection.model.id, effort: selection.effort,
        knowledgeEvidence: { file, reader: process.env.TWH_BUNDLED_ENGINE ? readerPath : await this.store.file(knowledgeBaseId, id, "evidence-reader.py"), knowledgeBaseId, inputHash: decision.inputHash },
        prompt: `当前阶段: recommend\n只用 read_knowledge_evidence 读取已封存的入梦时资料。为这个时刻提出两到三个实质不同、当时可能做的备选动作，能提两条就先给两条。标题只用于定位主题。actualChoiceToExclude 仅用来排除真实选择，scenario 是假设。没有记录的条件可设定，但不能写成当时确实发生过。直接给用户可勾选的动作短句，不推演后来。只返回 JSON {"suggestions":["..."]}。\n本阶段输入（数据）: ${JSON.stringify(data)}`,
      }, undefined, async () => {}, signal);
      const parsed = parseDreamJson(answer) as { suggestions?: unknown } | null;
      if (!Array.isArray(parsed?.suggestions) || parsed.suggestions.length > 3 ||
        parsed.suggestions.some(option => typeof option !== "string" || !option.trim() || option.length > 240)) {
        throw new Error("备选没有生成成功，请重试或自己添加一个假如");
      }
      return [...new Set((parsed.suggestions as string[]).map(option => option.trim()))].filter(option => option !== point.actualChoice);
    } catch (error) {
      throw new DreamRuntimeError(this.message(error));
    } finally {
      await this.store.removeRunFiles(knowledgeBaseId, id).catch(error => this.log.error(error));
    }
  }

  async setPointPreference(knowledgeBaseId: string, key: string, preference: "saved" | "ignored" | null) {
    const [stages, workspace] = await Promise.all([this.candidates(knowledgeBaseId), this.workspacePoints(knowledgeBaseId)]);
    const known = [...stages, ...workspace.decisions, ...workspace.described].some(({ source }) =>
      source.kind + ":" + ("pageId" in source ? source.pageId : source.pointId) === key);
    if (!known && preference !== null) return;
    return this.updateCollection(knowledgeBaseId, collection => {
      const preferences = collection.pointPreferences ??= {};
      if (preference === null) delete preferences[key];
      else preferences[key] = preference;
      return { preference };
    });
  }

  async favorite(knowledgeBaseId: string, runId: string, on: boolean) {
    if (!await this.get(knowledgeBaseId, runId)) return;
    return this.updateCollection(knowledgeBaseId, collection => {
      if (collection.deletedRuns?.includes(runId)) return;
      const ids = new Set(collection.favorites);
      if (on) ids.add(runId); else ids.delete(runId);
      collection.favorites = [...ids];
      return { favorite: on };
    });
  }

  async insight(knowledgeBaseId: string, runId: string, key: number) {
    const run = await this.get(knowledgeBaseId, runId);
    const report = run?.report;
    const nodes = report?.branches.flatMap(branch => branch.timeline) ?? [];
    const verified = nodes.some(node => node.review.verdict !== "unknown" && node.review.evidence.length);
    const supported = nodes.some(node => node.review.verdict === "supported" || node.review.verdict === "partial");
    const text = verified && report && (report.takeaways ?? (supported ? [report.summary] : []))[key];
    if (!text) return;
    return this.updateCollection(knowledgeBaseId, collection => {
      if (collection.deletedRuns?.includes(runId)) return;
      const existing = collection.insights.find(item => item.runId === runId && item.key === key && item.text === text);
      if (existing) return existing;
      const item = { runId, key, text, savedAt: new Date().toISOString() };
      collection.insights.push(item);
      return item;
    });
  }

  private updateCollection<T>(id: string, change: (collection: DreamLibraryState) => T): Promise<T> {
    const task = (this.collectionWrites.get(id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const collection = await this.store.collection(id);
      const result = change(collection);
      await this.store.saveCollection(id, collection);
      return result;
    });
    this.collectionWrites.set(id, task);
    void task.finally(() => {
      if (this.collectionWrites.get(id) === task) this.collectionWrites.delete(id);
    }).catch(() => undefined);
    return task;
  }

  private async resolvePoint(input: DreamStartInput, index: Awaited<ReturnType<KnowledgeRuntime["resolve"]>>["index"]) {
    let saved: DreamPointDescription | undefined;
    if ("pointId" in input.point) {
      const library = await this.store.collection(input.knowledgeBaseId);
      saved = (input.point.kind === "conversation" ? library.conversations : library.descriptions)?.[input.point.pointId];
    }
    return resolveDreamPoint(index, input.point, localDate(), saved);
  }

  async list(knowledgeBaseId: string): Promise<DreamRunListItem[]> {
    return (await this.store.list(knowledgeBaseId)).map(({ run: { report, ...run } }) => {
      if (!report) return run;
      const verified = report.branches.some(branch => branch.timeline.some(node => node.review.verdict !== "unknown" && node.review.evidence.length));
      return { ...run, branchCount: report.branches.length, verification: report.verification === "unreviewed" || !verified ? "unreviewed" : "reviewed" };
    });
  }

  async get(knowledgeBaseId: string, id: string) {
    return (await this.store.load(knowledgeBaseId, id))?.run;
  }

  async hasActive(knowledgeBaseId: string) {
    return this.runWrites.has(knowledgeBaseId) || this.active.has(knowledgeBaseId) || this.previews.has(knowledgeBaseId) ||
      (await this.store.list(knowledgeBaseId)).some(({ run }) => isActiveDream(run));
  }

  start(input: DreamStartInput): Promise<DreamRun> {
    return this.changeRun(input.knowledgeBaseId, () => this.prepare(input));
  }

  private changeRun<T>(knowledgeBaseId: string, change: () => Promise<T>): Promise<T> {
    const task = (this.runWrites.get(knowledgeBaseId) ?? Promise.resolve()).catch(() => undefined).then(change);
    this.runWrites.set(knowledgeBaseId, task);
    void task.finally(() => {
      if (this.runWrites.get(knowledgeBaseId) === task) this.runWrites.delete(knowledgeBaseId);
    }).catch(() => undefined);
    return task;
  }

  cancel(knowledgeBaseId: string, id: string) {
    return this.changeRun(knowledgeBaseId, () => this.cancelRun(knowledgeBaseId, id));
  }

  private async cancelRun(knowledgeBaseId: string, id: string) {
    const state = await this.store.load(knowledgeBaseId, id);
    if (!state || !isActiveDream(state.run)) return state?.run;
    const execution = this.active.get(knowledgeBaseId);
    if (execution?.id === id) {
      execution.controller.abort(cancelled);
      await execution.work;
      return this.get(knowledgeBaseId, id);
    }
    await this.finish(state, "cancelled", cancelled.message);
    return state.run;
  }

  resume(knowledgeBaseId: string, id: string) {
    return this.changeRun(knowledgeBaseId, () => this.resumeRun(knowledgeBaseId, id));
  }

  private async resumeRun(knowledgeBaseId: string, id: string) {
    const state = await this.store.load(knowledgeBaseId, id);
    if (!state || !state.run.resumable) return;
    const finishing = this.active.get(knowledgeBaseId);
    if (finishing?.id === id && !isActiveDream(state.run)) await finishing.work;
    if (this.closed || this.active.has(knowledgeBaseId)) throw new DreamBusyError("这个知识库已有梦境正在生成");
    if ((await this.store.list(knowledgeBaseId)).some(item => isActiveDream(item.run))) throw new DreamBusyError("这个知识库已有梦境正在生成");
    state.retrying = true;
    state.run = { ...state.run, status: "queued", error: undefined, finishedAt: undefined, resumable: undefined };
    // Persist the queued state before launching: a concurrent resume reads disk and
    // would otherwise restart this run from the stale failed snapshot.
    await this.store.save(state);
    if (this.closed) throw shutdown;
    this.launch(state);
    return structuredClone(state.run);
  }

  delete(knowledgeBaseId: string, id: string) {
    return this.changeRun(knowledgeBaseId, async () => {
      const state = await this.store.load(knowledgeBaseId, id);
      if (!state) return (await this.store.collection(knowledgeBaseId)).deletedRuns?.includes(id) ?? false;
      if (isActiveDream(state.run)) await this.cancelRun(knowledgeBaseId, id);
      else {
        const finishing = this.active.get(knowledgeBaseId);
        if (finishing?.id === id) await finishing.work;
      }
      // Publish the deletion and favorite cleanup together before removing files.
      await this.updateCollection(knowledgeBaseId, collection => {
        (collection.deletedRuns ??= []).push(id);
        collection.favorites = collection.favorites.filter(runId => runId !== id);
      });
      await this.store.removeRunFiles(knowledgeBaseId, id).catch(error => this.log.error(error));
      this.knowledge.events.broadcast("dream", { id, knowledgeBaseId, deleted: true });
      return true;
    });
  }

  async reconcile() {
    const libraries = this.knowledge.index.config.knowledgeBases;
    await Promise.all(libraries.map(async ({ id }) => {
      try {
        const { deletedRuns = [] } = await this.store.collection(id);
        await Promise.all(deletedRuns.filter(isDreamRunId).map(runId =>
          this.store.removeRunFiles(id, runId).catch(error => this.log.error(error))));
        const active = (await this.store.list(id)).filter(({ run }) => isActiveDream(run));
        const [current, ...superseded] = active;
        for (const stale of superseded) await this.finish(stale, "failed", "此知识库已有更新的梦境任务");
        if (current) this.launch(current);
      } catch (error) {
        this.log.error(error);
      }
    }));
  }

  async close() {
    this.closed = true;
    for (const { controller } of this.previews.values()) controller.abort(shutdown);
    await Promise.allSettled([...this.runWrites.values(), ...this.collectionWrites.values()]);
    for (const { controller } of this.active.values()) controller.abort(shutdown);
    await Promise.allSettled([...Array.from(this.active.values(), ({ work }) => work), ...Array.from(this.previews.values(), ({ work }) => work)]);
  }

  private async prepare(input: DreamStartInput): Promise<DreamRun> {
    if (this.closed) throw shutdown;
    const { knowledgeBaseId } = input;
    const { index, config } = await this.knowledge.resolve(knowledgeBaseId);
    if (config.knowledgeBaseId !== knowledgeBaseId) throw new DreamInputError("知识库不匹配");
    const point = await this.resolvePoint(input, index);
    checkDreamTopic(point);
    if (input.previousRunId && !await this.get(knowledgeBaseId, input.previousRunId)) throw new DreamInputError("当前知识库没有这份梦境");
    const until = horizonDate(point.decisionAt.latest, point.horizon);
    const pages = index.list().map(page => index.get(page.id)!);
    const root = this.knowledge.vaultRoot;
    const readerPath = process.env.TWH_BUNDLED_ENGINE
      ? executableTool(retrieval + "/scripts/evidence_reader.py", root)
      : path.join(root, retrieval, "scripts/evidence_reader.py");
    const read = (file: string) => readFile(path.join(root, file), "utf8");
    const [policy, guide, shared, skill, protocol, reader, previous] = await Promise.all([
      read(retrieval + "/references/source-policy.json"),
      read(retrieval + "/references/tools.md"),
      read(retrieval + "/SKILL.md"),
      read(dreaming + "/SKILL.md"),
      read(dreaming + "/references/workflow.md"),
      readFile(readerPath, "utf8"),
      this.store.list(knowledgeBaseId),
    ]);
    const evidence = buildDreamEvidence(knowledgeBaseId, pages, point.decisionAt.earliest, parseRetrievalPolicy(JSON.parse(policy)), point);
    const { before, after, sourceDates } = evidenceAvailability(point, pages, until);
    const instructions = [shared, guide, skill, protocol].join("\n\n");
    const decision = JSON.stringify(evidence.decision);
    const review = JSON.stringify(evidence.review);
    const selection = await this.runtimes.resolve(input.runtimeId, undefined, undefined).catch(error => {
      throw new DreamRuntimeError(this.message(error));
    });
    const fingerprint = dreamDigest(JSON.stringify([
      2, point, input.previousRunId, until, evidence.decision.inputHash, evidence.review.inputHash, after, sourceDates, instructions, reader,
      selection.runtimeId, selection.model.id, selection.effort,
    ]));
    const duplicate = previous.find(item => item.fingerprint === fingerprint &&
      item.run.status !== "failed" && item.run.status !== "cancelled");
    if (duplicate) return duplicate.run;
    if (previous.some(({ run }) => isActiveDream(run)) || this.active.has(knowledgeBaseId)) {
      throw new DreamBusyError("这个知识库已有梦境正在生成");
    }
    if (this.closed) throw shutdown;
    const id = randomUUID();
    const state: StoredDream = {
      version: 1, config, fingerprint, effort: selection.effort,
      run: { id, knowledgeBaseId, point, runtimeId: selection.runtimeId, model: selection.model.id, status: "queued", previousRunId: input.previousRunId,
        until, environment: { before, after }, createdAt: new Date().toISOString() },
    };
    const inputs: DreamInputs = {
      protocolVersion: 2,
      fingerprint, instructions, sourceIds: evidence.sourceIds, sourceDates, postDecisionEvidence: after > 0,
      decisionDigest: dreamDigest(decision), reviewDigest: dreamDigest(review), readerDigest: dreamDigest(reader),
    };
    const frozen = await Promise.allSettled([
      this.store.write(knowledgeBaseId, id, "decision-evidence.json", decision),
      this.store.write(knowledgeBaseId, id, "review-evidence.json", review),
      this.store.write(knowledgeBaseId, id, "evidence-reader.py", reader),
      this.store.writeJson(knowledgeBaseId, id, "inputs.json", inputs),
    ]);
    const failedWrite = frozen.find(result => result.status === "rejected");
    try {
      if (failedWrite) throw failedWrite.reason;
      await this.store.save(state);
    } catch (error) {
      await this.store.remove(knowledgeBaseId, id, transientFiles).catch(cleanupError => this.log.error(cleanupError));
      throw error;
    }
    const accepted = structuredClone(state.run);
    if (!this.closed) this.launch(state);
    return accepted;
  }

  private launch(state: StoredDream) {
    const { knowledgeBaseId } = state.run;
    if (this.active.has(knowledgeBaseId) || this.closed) return;
    const controller = new AbortController();
    const work = this.process(state, controller).catch(error => this.log.error(error)).finally(() => this.active.delete(knowledgeBaseId));
    this.active.set(knowledgeBaseId, { id: state.run.id, controller, work });
  }

  private async save(state: StoredDream) {
    await this.store.save(state);
    const { id, knowledgeBaseId, status, phase, progress, finishedAt } = state.run;
    this.knowledge.events.broadcast("dream", { id, knowledgeBaseId, status, phase, progress, finishedAt });
  }

  private async finish(state: StoredDream, status: DreamRun["status"], error?: string) {
    state.run = { ...state.run, status, error, finishedAt: new Date().toISOString(), phase: undefined };
    await this.save(state);
    if (!state.run.resumable) await this.store.remove(state.run.knowledgeBaseId, state.run.id, transientFiles).catch(error => this.log.error(error));
  }

  private async loadContext(state: StoredDream, signal: AbortSignal): Promise<Context> {
    const { knowledgeBaseId, id } = state.run;
    const read = async (name: string) => readFile(await this.store.file(knowledgeBaseId, id, name), "utf8");
    const [inputs, decision, review, reader] = await Promise.all([
      this.store.readJson<DreamInputs>(knowledgeBaseId, id, "inputs.json"),
      read("decision-evidence.json"), read("review-evidence.json"), read("evidence-reader.py"),
    ]);
    if (inputs?.fingerprint !== state.fingerprint || inputs.decisionDigest !== dreamDigest(decision) ||
      inputs.reviewDigest !== dreamDigest(review) || inputs.readerDigest !== dreamDigest(reader)) throw new Error("梦境冻结资料已损坏或被替换");
    return { state, inputs, decision: JSON.parse(decision), review: JSON.parse(review), signal };
  }

  private async process(state: StoredDream, controller: AbortController) {
    try {
      state.run.status = "running";
      state.run.updates = [];
      const context = await this.loadContext(state, controller.signal);
      if (context.inputs.protocolVersion === 2) {
        state.run.phase = "ground";
        await this.save(state);
        context.groundedFacts = (await this.step(context, "ground", "ground", { point: state.run.point },
          output => parseDreamGrounding(output, context.review, state.run.point.decisionAt.earliest))).facts;
        if (context.groundedFacts.length) state.run.updates.push({ label: "还原当时", text: `找到 ${context.groundedFacts.length} 条当时已知、有原文可查的事实。` });
        if (context.groundedFacts.length) {
          context.decision = withDreamGroundFacts(context.decision, context.groundedFacts);
          await this.store.writeJson(state.run.knowledgeBaseId, state.run.id, "grounded-evidence.json", context.decision);
        }
      }
      state.run.phase = "plan";
      await this.save(state);
      const { decisionAt, question, stageStart, alternatives } = state.run.point;
      const { source, title, scenario } = state.run.point;
      const description = source.kind === "self-described" || source.kind === "conversation" ? title : undefined;
      // Keep the retrospective stage title and ID out of all decision-time prompts.
      const plan: DreamPlan = context.decision.pages.length || description || question || alternatives?.length
        ? await this.step(context, "plan", "plan", {
          decisionAt, question, description, stageStart, alternatives, scenario, until: state.run.until, groundedFactsPageId: context.groundedFacts?.length ? dreamGroundPageId : undefined,
        }, output => parseDreamPlan(output, context.inputs.protocolVersion === 2, alternatives?.length))
        : { decision: "没有可用于还原该时点的同期记录", branches: [] };
      state.run.title = dreamTitle({ point: state.run.point, title: plan.title ?? state.run.title });
      if (plan.storyBible?.length) {
        context.storyBible = plan.storyBible;
        context.decision = withDreamStoryBible(context.decision, plan.storyBible);
        await this.store.writeJson(state.run.knowledgeBaseId, state.run.id, "bible-evidence.json", context.decision);
      }
      state.run.phase = "analyze";
      state.run.progress = { finished: 0, total: plan.branches.length };
      if (plan.branches.length) state.run.updates.push({ label: "规划分岔", text: plan.branches.map(branch => branch.title).join("、") });
      await this.save(state);
      const results: BranchResult[] = [];
      for (let i = 0; i < plan.branches.length; i += 2) {
        controller.signal.throwIfAborted();
        const batch = await Promise.allSettled(plan.branches.slice(i, i + 2)
          .map((branch, offset) => this.analyze(context, plan, branch, i + offset)));
        for (const result of batch) {
          if (result.status === "rejected") throw result.reason;
          results.push(result.value);
          const first = result.value.analysis?.draft.timeline[0];
          if (first) state.run.updates.push({ label: result.value.branch.title, text: first.horizon });
        }
        state.run.progress.finished = results.length;
        await this.save(state);
      }
      if (results.length && results.every(result => result.error)) throw new DreamStepError(results[0]!.error!);
      const prior = state.retrying ? state.run.report : undefined;
      const choice = state.run.point.actualChoice;
      let blind: string[] = [];
      if (choice && context.decision.pages.length && context.inputs.postDecisionEvidence !== false && !prior?.backtest) {
        state.run.phase = "calibrate";
        await this.save(state);
        const draft = await this.step(context, "calibrate", "calibrate", {
          decisionAt, until: state.run.until, actualChoice: choice,
        }, output => parseDreamDraft(output, context.decision, decisionAt.earliest, state.run.until));
        blind = draft.timeline.map(row => row.possibility);
      }
      state.run.phase = "review";
      await this.save(state);
      const expected = results.flatMap(({ branch, analysis }) => analysis?.draft.timeline.length
        ? [{ id: branch.id, count: analysis.draft.timeline.length }] : []);
      const retained = expected.flatMap(({ id, count }) => {
        const previous = prior?.branches.find(branch => branch.id === id && branch.status === "reviewed" && branch.timeline.length === count);
        return previous ? [{ branchId: id, claims: previous.timeline.map(node => node.review) }] : [];
      });
      const pending = expected.filter(item => !retained.some(entry => entry.branchId === item.id));
      if (!prior || pending.length) {
        const review: DreamReview = context.inputs.postDecisionEvidence === false ? {
          summary: "", actualPath: unavailableReview,
          reviews: pending.map(branch => ({ branchId: branch.id, claims: Array<DreamFinding>(branch.count).fill(unavailableReview) })),
        } : await this.step(context, "review-" + pending.map(item => item.id + "-" + item.count).join("-").slice(0, 150), "review", {
          point: state.run.point, until: state.run.until, decision: plan.decision, branchLimitReason: plan.branchLimitReason,
          results: results.filter(result => !retained.some(entry => entry.branchId === result.branch.id)),
          priorReview: prior && { findings: retained, branches: prior.branches.filter(branch => branch.status === "reviewed"), backtest: prior.backtest },
          sourceIds: context.inputs.sourceIds, groundedFacts: context.groundedFacts, blind,
        }, output => parseDreamReview(output, context.review, pending, state.run.until, blind, expected));
        controller.signal.throwIfAborted();
        state.run.report = this.report(context, plan, results, {
          ...review, reviews: [...retained, ...review.reviews], backtest: review.backtest ?? prior?.backtest,
          actualPath: prior && prior.actualPath.verdict !== "unknown" ? prior.actualPath : review.actualPath,
          actualTimeline: review.actualTimeline?.length ? review.actualTimeline : prior?.actualTimeline,
          comparison: review.comparison?.length ? review.comparison : prior?.comparison,
        });
      } else {
        state.run.report = this.report(context, plan, results, { ...prior, reviews: retained });
      }
      controller.signal.throwIfAborted();
      state.retrying = undefined;
      const hasIncomplete = results.some(({ analysis }) => !analysis?.draft.timeline.length);
      state.run.resumable = results.some(result => !!result.error) || undefined;
      await this.finish(state, expected.length === 0 ? "insufficient" : hasIncomplete ? "partial" : "ready");
    } catch (error) {
      if (controller.signal.reason === shutdown) return;
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      state.run.resumable = reason !== cancelled && Boolean(await this.store.readJson(state.run.knowledgeBaseId, state.run.id, "inputs.json").catch(() => undefined));
      await this.finish(state, reason === cancelled ? "cancelled" : "failed", this.message(reason));
    }
  }

  private async analyze(context: Context, plan: DreamPlan, branch: DreamBranch, index: number): Promise<BranchResult> {
    const { decisionAt, question, actualChoice } = context.state.run.point;
    const prefix = "branch-" + (index + 1);
    const input = { decisionAt, question, until: context.state.run.until, decision: plan.decision, branch,
      requestedChoice: context.state.run.point.alternatives?.[index], scenario: context.state.run.point.scenario };
    // The writer knows the real choice only as a one-line reference to diverge from, never the aftermath.
    const writing = { storyBible: context.storyBible, divergence: branch.divergence, realityReference: actualChoice };
    const finding = (output: unknown) => parseDreamFinding(output, context.decision);
    try {
      const verified = await this.step(context, prefix + "-verify", "verify", input, finding);
      const checks: Record<string, DreamFinding> = Object.create(null);
      for (const check of branch.checks) {
        if (check.when && checks[check.when.checkId]?.verdict !== check.when.verdict) continue;
        const result = await this.step(context, prefix + "-check-" + check.id, "enrich", { ...input, check, verified, checks }, finding);
        checks[check.id] = result;
        if (branch.stopWhen?.checkId === check.id && branch.stopWhen.verdict === result.verdict) {
          return { branch, analysis: { verified, checks, stoppingFinding: result, draft: { timeline: [], gaps: [result.text] } } };
        }
      }
      const draft = await this.step(context, prefix + "-organize", "organize", { ...input, verified, checks, ...writing }, output =>
        parseDreamDraft(output, context.decision, decisionAt.earliest, context.state.run.until, context.inputs.protocolVersion === 2));
      let refined = draft;
      if (draft.timeline.length) {
        try {
          refined = await this.step(context, prefix + "-refine", "refine", { ...input, ...writing, draft }, output =>
            parseDreamDraft(output, context.decision, decisionAt.earliest, context.state.run.until, context.inputs.protocolVersion === 2));
        } catch (error) {
          if (!(error instanceof DreamStepError)) throw error;
          if (context.signal.aborted) return { branch, error: this.message(context.signal.reason) };
          // 初稿已是完整故事：审梦超时或失败时保留初稿，不让整条分支清空。
          refined = { ...draft, gaps: draft.gaps.length < 6 ? [...draft.gaps, "初稿直接交付：审梦修订未在时限内完成。"] : draft.gaps };
        }
      }
      return { branch, analysis: { draft: refined, verified, checks } };
    } catch (error) {
      if (context.signal.aborted) return { branch, error: this.message(context.signal.reason) };
      if (!(error instanceof DreamStepError)) throw error;
      return { branch, error: error.message };
    }
  }

  private async step<T>(context: Context, key: string, phase: Phase, input: unknown, parse: (value: unknown) => T): Promise<T> {
    const { state, signal } = context;
    const { id, knowledgeBaseId, runtimeId, model } = state.run;
    const name = key + ".json";
    signal.throwIfAborted();
    const stored = await this.store.readJson<{ ref?: AgentExecutionRef; result?: unknown }>(knowledgeBaseId, id, name);
    if (stored?.result !== undefined) return parse(stored.result);
    const isReview = phase === "review" || phase === "ground";
    const evidence = isReview ? context.review : context.decision;
    const evidenceName = isReview ? "review-evidence.json"
      : context.storyBible?.length ? "bible-evidence.json"
      : context.groundedFacts?.length ? "grounded-evidence.json" : "decision-evidence.json";
    const file = await this.store.file(knowledgeBaseId, id, evidenceName);
    const reader = process.env.TWH_BUNDLED_ENGINE
      ? executableTool(retrieval + "/scripts/evidence_reader.py", this.knowledge.vaultRoot)
      : await this.store.file(knowledgeBaseId, id, "evidence-reader.py");
    const timeout = new AbortController();
    const turnSignal = AbortSignal.any([signal, timeout.signal]);
    const timer = setTimeout(() => timeout.abort(new DreamStepError(
      `「${phaseLabels[phase]}」超过 ${turnTimeoutMinutes} 分钟，已完成的步骤已保留。`,
    )), turnTimeoutMinutes * 60_000);
    timer.unref();
    let result: T;
    try {
      const answer = await executeDreamTurn(this.runtimes.require(runtimeId), {
        cwd: this.knowledge.vaultRoot, mode: "read", strictReadOnly: true,
        config: state.config, model, effort: state.effort,
        knowledgeEvidence: { file, reader, knowledgeBaseId, inputHash: evidence.inputHash },
        prompt: `${context.inputs.instructions}\n\n当前阶段: ${phase}\n用 read_knowledge_evidence 工具读取绑定证据。只返回当前阶段 JSON。\n本阶段输入（数据）: ${JSON.stringify(input)}`,
      }, state.retrying ? undefined : stored?.ref, ref => this.store.writeJson(knowledgeBaseId, id, name, { ref }), turnSignal);
      turnSignal.throwIfAborted();
      result = parse(parseDreamJson(answer));
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (timeout.signal.aborted) throw timeout.signal.reason;
      throw new DreamStepError(this.message(error));
    } finally {
      clearTimeout(timer);
    }
    await this.store.writeJson(knowledgeBaseId, id, name, { result });
    return result;
  }

  private report(context: Context, plan: DreamPlan, results: BranchResult[], review: DreamReview): DreamReport {
    const hasPostEvidence = context.inputs.postDecisionEvidence !== false;
    const dated = (citation: DreamCitation): DreamCitation => ({ ...citation, date: context.inputs.sourceDates?.[citation.pageId] });
    const checked = (finding: DreamFinding): DreamFinding => ({ ...finding, evidence: finding.evidence.map(dated) });
    const source = (citation: DreamCitation): DreamCitation[] => {
      if (citation.pageId === dreamGroundPageId && context.groundedFacts) {
        return context.groundedFacts[citation.line - 1]?.evidence.map(dated) ?? [];
      }
      // The story bible is a setting the plan chose, not source evidence.
      if (citation.pageId === dreamStoryBiblePageId) return [];
      return [dated({ ...citation, pageId: context.inputs.sourceIds[citation.pageId] ?? citation.pageId })];
    };
    const verified = hasPostEvidence && review.reviews.some(branch => branch.claims.some(claim => claim.verdict !== "unknown"));
    const outcomes = results.flatMap(({ analysis }) => analysis?.draft.outcome ? [analysis.draft.outcome] : []);
    return {
      decision: plan.decision, summary: review.summary || outcomes.join("\n\n"),
      verification: verified ? "reviewed" : "unreviewed",
      actualPath: hasPostEvidence ? checked(review.actualPath) : unavailableReview,
      actualTimeline: hasPostEvidence ? review.actualTimeline?.map(entry => ({ ...entry, finding: checked(entry.finding) })) : undefined,
      comparison: verified ? review.comparison : undefined, unchanged: verified ? review.unchanged : undefined,
      changed: verified ? review.changed : undefined, takeaways: verified ? review.takeaways : undefined,
      backtest: hasPostEvidence ? review.backtest?.map(item => ({ ...item, review: checked(item.review) })) : undefined,
      groundedFacts: context.groundedFacts, branchLimitReason: plan.branchLimitReason,
      branches: results.map(({ branch, analysis, error }) => {
        const claims = review.reviews.find(item => item.branchId === branch.id)?.claims;
        return {
          id: branch.id, title: branch.title, intervention: branch.intervention,
          status: claims?.length ? "reviewed" : "incomplete",
          timeline: claims ? analysis!.draft.timeline.map((entry, i) => ({
            ...entry, basis: entry.basis.flatMap(source), review: hasPostEvidence ? checked(claims[i]!) : unavailableReview,
          })) : [],
          stoppingFinding: analysis?.stoppingFinding && {
            ...analysis.stoppingFinding, evidence: analysis.stoppingFinding.evidence.flatMap(source),
          },
          gaps: analysis?.draft.gaps ?? [error || "分支缺少经过验证的依据"],
        };
      }),
    };
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 500) : "梦境生成失败";
  }
}
