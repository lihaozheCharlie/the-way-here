import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentRuntimeId, DreamRun } from "@the-way-here/shared";
import type { AgentExecutionRef, AgentRuntime, AgentRuntimeProvider, StartAgentExecution } from "../agent-runtime/types.js";
import { RuntimeEventSource } from "../agent-runtime/types.js";
import { KnowledgeRuntime } from "../knowledge-runtime.js";
import { registerDreamRoutes } from "../../routes/dream-routes.js";
import { DreamService } from "./dream-service.js";
import { DreamStore } from "../../modules/dreams/dream-store.js";

const stage = "wiki/02 人生阶段/匿名阶段";
const before = "sources/2020-01-01 讨论调岗";
const sameDay = "sources/2020-03-01 当天记录";
const after = "sources/2020-05-01 招聘冻结";
const secret = "后见信息哨兵";
const date = { earliest: "2020-03-01", latest: "2020-03-02" };
const startRequest = { knowledgeBaseId: "demo", point: { kind: "life-stage", pageId: stage, decisionAt: date } };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

class FixtureRuntime extends RuntimeEventSource {
  readonly calls: Array<{ input: StartAgentExecution; ref: AgentExecutionRef }> = [];
  readonly recover = vi.fn<AgentRuntime["recover"]>(async () => ({ status: "interrupted" }));
  readonly interrupt = vi.fn(async () => {});
  earlyAnswer?: unknown;

  constructor(readonly id: AgentRuntimeId) { super(); }

  async start(input: StartAgentExecution) {
    const ref = { runtimeId: this.id, sessionId: "session-" + this.calls.length, turnId: "turn" };
    this.calls.push({ input, ref });
    const answer = this.earlyAnswer;
    this.earlyAnswer = undefined;
    if (answer) this.complete(this.calls.length - 1, answer);
    return ref;
  }

  complete(index: number, output: unknown) {
    const { ref } = this.calls[index]!;
    this.emit({ ref, event: { type: "turn.completed", outcome: "completed", finalAnswer: JSON.stringify(output) } });
  }

  fail(index: number, error: string) {
    const { ref } = this.calls[index]!;
    this.emit({ ref, event: { type: "turn.completed", outcome: "failed", error } });
  }
}

async function fixture(runtimeId: AgentRuntimeId = "codex") {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-dream-")));
  await writeFile(path.join(root, "the-way-here.config.yaml"), `version: 3
defaultKnowledgeBase: demo
knowledgeBases:
  demo:
    paths: {wiki: demo/wiki, sources: demo/sources}
  other:
    paths: {wiki: other/wiki, sources: other/sources}
`);
  const engine = new URL("../../../../../../knowledge-engine/skills/", import.meta.url);
  await cp(new URL("consume/dreaming", engine), path.join(root, "knowledge-engine/skills/consume/dreaming"), { recursive: true });
  await cp(new URL("common/retrieval", engine), path.join(root, "knowledge-engine/skills/common/retrieval"), { recursive: true });
  await mkdir(path.join(root, "demo/wiki/02 人生阶段"), { recursive: true });
  await mkdir(path.join(root, "demo/sources"), { recursive: true });
  await writeFile(path.join(root, "demo", stage + ".md"), `---\nStart: 2019-01-01\nend: 2020-03-15\n---\n# 匿名阶段 ${secret}\n复盘：${secret}\n`);
  await writeFile(path.join(root, "demo", before + ".md"), `---\nStart: 2020-01-01\naliases: ["${secret}"]\n---\n# ${secret}\n还可以提出内部调岗申请。\n[[2020-05-01 招聘冻结|${secret}]]\n`);
  await writeFile(path.join(root, "demo", after + ".md"), `---\nStart: 2020-05-01\n---\n# ${secret}\n招聘冻结只适用于外部岗位。\n[[2020-01-01 讨论调岗]]\n`);
  await writeFile(path.join(root, "demo", sameDay + ".md"), "# 当日结果\n此前已拿到调岗资格。后来最终决定留任。" + secret);
  await writeFile(path.join(root, "demo/sources/2019-01-01 日期冲突.md"), "---\nStart: 2020-05-02\n---\n" + secret);
  const knowledge = await KnowledgeRuntime.create(root, "demo");
  const runtime = new FixtureRuntime(runtimeId);
  const app = Fastify();
  const store = new DreamStore(root, path.join(root, "local-state"));
  const runtimes = {
    resolve: async () => ({ runtime, runtimeId, model: { id: "anonymous-model" }, effort: "high" }),
    require: () => runtime,
  } as unknown as AgentRuntimeProvider;
  const makeService = () => new DreamService(knowledge, runtimes, app.log, store);
  const service = makeService();
  registerDreamRoutes(app, knowledge, service);
  cleanups.push(async () => {
    await service.close();
    await app.close();
    await knowledge.close();
    await rm(root, { recursive: true, force: true });
  });
  return { service, makeService, app, runtime, knowledge, store };
}

async function waitForCall(runtime: FixtureRuntime, phase: string, marker = "") {
  const matches = () => runtime.calls.filter(({ input }) => input.prompt.includes("当前阶段: " + phase + "\n") && input.prompt.includes(marker));
  await vi.waitFor(() => expect(matches()).toHaveLength(1));
  const call = matches()[0]!;
  return { ...call, index: runtime.calls.indexOf(call) };
}

const branch = {
  id: "transfer", title: "内部调岗", intervention: "提交内部申请",
  checks: [
    { id: "eligibility", question: "能否申请？" },
    { id: "cost", question: "调动成本？", when: { checkId: "eligibility", verdict: "supported" } },
    { id: "documents", question: "缺少哪些申请记录？", when: { checkId: "eligibility", verdict: "unknown" } },
  ],
};
const groundedText = "此前已拿到调岗资格。";
const groundCitation = { pageId: sameDay, line: 2, quote: groundedText };
const grounding = { facts: [{ text: groundedText, knownBy: date.earliest, evidence: [groundCitation] }] };
const unknown = { text: "具体资格和录取尚未知。", verdict: "unknown", evidence: [] };
const reviewCitation = { pageId: after, line: 5, quote: "招聘冻结只适用于外部岗位。" };

it.each(["codex", "pi"] as const)("runs a dynamic workflow from the API with %s", async runtimeId => {
  const { app, runtime, knowledge, store } = await fixture(runtimeId);
  const candidates = await app.inject("/api/dreams/points?knowledgeBaseId=demo");
  expect(candidates.json().points).toMatchObject([{ source: { kind: "life-stage", pageId: stage },
    suggestedDecisionAt: { earliest: "2020-03-15", latest: "2020-03-15" } }]);
  const request = { method: "POST" as const, url: "/api/dreams", payload: { ...startRequest, runtimeId } };
  const [accepted, duplicate] = await Promise.all([app.inject(request), app.inject(request)]);
  expect(accepted.statusCode).toBe(202);
  const job = accepted.json<DreamRun>();
  expect(duplicate.json().id).toBe(job.id);
  expect(job).toMatchObject({ knowledgeBaseId: "demo", runtimeId, point: { decisionAt: date } });

  const ground = await waitForCall(runtime, "ground");
  expect(await readFile(ground.input.knowledgeEvidence!.file, "utf8")).toContain(sameDay);
  runtime.complete(ground.index, grounding);
  const plan = await waitForCall(runtime, "plan");
  const frozen = await readFile(plan.input.knowledgeEvidence!.file, "utf8");
  expect(frozen).not.toContain(secret);
  expect(frozen).not.toContain(after);
  expect(plan.input.prompt).not.toContain(secret);
  const sources = JSON.parse(frozen).pages;
  expect(sources).toHaveLength(2);
  expect(frozen).not.toContain(sameDay);
  expect(frozen).not.toContain("最终决定留任");
  const basis = { pageId: "dream-grounded-facts", line: 1, quote: groundedText };
  const verified = { text: "同期记录明确提到了申请选项。", verdict: "supported", evidence: [basis] };
  const second = { id: "stay", title: "留任探索", intervention: "留任并试做项目", checks: [] };
  await knowledge.activate("other");
  const title = "如果2020年3月，我换一种工作方式";
  runtime.complete(plan.index, { title: "我换一种工作方式", decision: "是否申请调岗", branches: [branch, second] });

  const verifyA = await waitForCall(runtime, "verify", '"id":"transfer"');
  const verifyB = await waitForCall(runtime, "verify", '"id":"stay"');
  for (const call of [verifyA, verifyB]) {
    expect(call.input.config.knowledgeBaseId).toBe("demo");
    expect(call.input.knowledgeEvidence).toEqual(plan.input.knowledgeEvidence);
    runtime.complete(call.index, verified);
  }
  const check = await waitForCall(runtime, "enrich", '"check":{"id":"eligibility"');
  runtime.complete(check.index, unknown);
  const conditional = await waitForCall(runtime, "enrich", '"check":{"id":"documents"');
  runtime.complete(conditional.index, unknown);
  const organizeA = await waitForCall(runtime, "organize", '"id":"transfer"');
  runtime.complete(organizeA.index, {
    timeline: [{ horizon: "几周内", possibility: "先经历一次资格审核。", condition: "提交有效申请", basis: [basis] },
      { horizon: "同年五月", possibility: "所有招聘冻结。", condition: "如果调动和招聘一并暂停", basis: [basis] }],
    gaps: ["录取结果未知"],
  });
  const refineA = await waitForCall(runtime, "refine", '"id":"transfer"');
  expect(refineA.input.prompt).toContain('"draft"');
  expect(refineA.input.prompt).toContain('"possibility":"先经历一次资格审核。"');
  runtime.complete(refineA.index, {
    timeline: [{ horizon: "几周内", possibility: "申请递上去，你一边等结果一边把手头项目收尾。", condition: "提交有效申请", basis: [basis] },
      { horizon: "同年五月", possibility: "所有招聘冻结。", condition: "如果调动和招聘一并暂停", basis: [basis] }],
    gaps: ["录取结果未知"],
  });
  const organizeB = await waitForCall(runtime, "organize", '"id":"stay"');
  runtime.fail(organizeB.index, "暂时无法读取项目记录");
  const review = await waitForCall(runtime, "review");
  expect(await readFile(review.input.knowledgeEvidence!.file, "utf8")).toContain(secret);
  expect(review.input.knowledgeEvidence!.inputHash).not.toBe(plan.input.knowledgeEvidence!.inputHash);
  expect(runtime.calls.some(({ input }) => input.prompt.includes('"check":{"id":"cost"'))).toBe(false);
  runtime.complete(review.index, {
    summary: "可确认后来外招冻结的范围，内部申请仍有未知条件。",
    actualPath: unknown,
    reviews: [{ branchId: "transfer", claims: [
      { text: "外招冻结不能证明内部申请受阻。", verdict: "supported", evidence: [reviewCitation] },
      { text: "同期记录只提到外部招聘。", verdict: "contradicted", evidence: [reviewCitation], revision: "内部申请可能继续，但需要主管审批。" },
    ] }],
    comparison: [{ dimension: "机会", actual: "留任", branches: [{ id: "transfer", text: "仍可能提交申请。", relation: "选项更多", claimIndex: 1 }] }],
  });

  const url = "/api/dreams/" + job.id + "?knowledgeBaseId=demo";
  await vi.waitFor(async () => expect((await app.inject(url)).json()).toMatchObject({
    title, status: "partial", resumable: true, report: { verification: "reviewed", comparison: [{ branches: [{ claimIndex: 1, relation: "选项更多" }] }], branches: [
      { id: "transfer", timeline: [{ basis: [groundCitation], review: { verdict: "supported" } },
        { review: { verdict: "contradicted", revision: "内部申请可能继续，但需要主管审批。", evidence: [{ ...reviewCitation, date: "2020-05-01" }] } }] },
      { id: "stay", status: "incomplete", gaps: ["暂时无法读取项目记录"] },
    ] },
  }));
  expect((await app.inject(url.replace("demo", "other"))).statusCode).toBe(404);
  expect((await app.inject("/api/dreams?knowledgeBaseId=demo")).json().runs).toMatchObject([{ id: job.id, title }]);
  expect((await app.inject({ method: "POST", url: url.replace("?","/favorite?"), payload: { on: true } })).json()).toEqual({ favorite: true });
  const insight = { method: "POST" as const, url: url.replace("?", "/insights?"), payload: { key: 0 } };
  const saved = await app.inject(insight);
  expect(saved.json()).toMatchObject({ runId: job.id, key: 0, text: "可确认后来外招冻结的范围，内部申请仍有未知条件。" });
  expect((await app.inject(insight)).json()).toEqual(saved.json());
  expect((await app.inject("/api/dreams/workspace?knowledgeBaseId=other")).json().collection).toEqual({ favorites: [], insights: [] });
  expect((await app.inject("/api/dreams/workspace?knowledgeBaseId=demo")).json().collection).toMatchObject({ favorites: [job.id], insights: [saved.json()] });
  const retry = await app.inject({ method: "POST", url: url.replace("?", "/resume?") });
  expect(retry.statusCode).toBe(200);
  const retryOrganize = await vi.waitFor(() => {
    const call = runtime.calls.findIndex(({ input }, index) => index > review.index && input.prompt.includes("当前阶段: organize\n"));
    expect(call).toBeGreaterThan(review.index);
    return call;
  });
  expect(runtime.calls[retryOrganize]!.input.prompt).toContain('"id":"stay"');
  runtime.complete(retryOrganize, { timeline: [{ horizon: "几个月后", possibility: "可以先试做一个项目。", condition: "主管同意", basis: [] }], gaps: [] });
  const retryRefine = await vi.waitFor(() => {
    const call = runtime.calls.findIndex(({ input }, index) => index > retryOrganize && input.prompt.includes("当前阶段: refine\n"));
    expect(call).toBeGreaterThan(retryOrganize);
    return call;
  });
  runtime.complete(retryRefine, { timeline: [{ horizon: "几个月后", possibility: "项目试做起来了，你开始攒自己的案例。", condition: "主管同意", basis: [] }], gaps: [] });
  const retryReview = await vi.waitFor(() => {
    const call = runtime.calls.findIndex(({ input }, index) => index > retryRefine && input.prompt.includes("当前阶段: review\n"));
    expect(call).toBeGreaterThan(retryRefine);
    return call;
  });
  const reviewInput = JSON.parse(runtime.calls[retryReview]!.input.prompt.split("本阶段输入（数据）: ").at(-1)!);
  expect(reviewInput.results.map((result: { branch: { id: string } }) => result.branch.id)).toEqual(["stay"]);
  expect(reviewInput.priorReview.findings).toMatchObject([{ branchId: "transfer", claims: [{ verdict: "supported" }, { verdict: "contradicted" }] }]);
  runtime.complete(retryReview, { summary: "两个分支都已核对。", actualPath: unknown, reviews: [{ branchId: "stay", claims: [unknown] }] });
  await vi.waitFor(async () => expect((await app.inject(url)).json()).toMatchObject({ status: "ready", report: { branches: [
    { id: "transfer", timeline: [{ review: { verdict: "supported" } }, { review: { verdict: "contradicted" } }] },
    { id: "stay", status: "reviewed" },
  ] } }));
  await vi.waitFor(async () => expect(await store.readJson("demo", job.id, "review-evidence.json")).toBeUndefined());
  expect((await app.inject({ method: "DELETE", url: url.replace("demo", "other") })).statusCode).toBe(404);
  expect((await app.inject({ method: "DELETE", url })).json()).toEqual({ deleted: true });
  expect((await app.inject({ method: "DELETE", url })).json()).toEqual({ deleted: true });
  expect((await app.inject(url)).statusCode).toBe(404);
  expect((await app.inject(insight)).statusCode).toBe(404);
  expect(await store.readJson("demo", job.id, "state.json")).toBeUndefined();
  expect((await app.inject("/api/dreams?knowledgeBaseId=demo")).json().runs).toEqual([]);
  expect((await app.inject("/api/dreams/workspace?knowledgeBaseId=demo")).json().collection)
    .toMatchObject({ favorites: [], insights: [{ ...saved.json(), sourceDeleted: true }] });
});

it("stops an active dream before deleting its files", async () => {
  const { app, runtime, store } = await fixture();
  const started = await app.inject({ method: "POST", url: "/api/dreams", payload: startRequest });
  const { id } = started.json<DreamRun>();
  const ground = await waitForCall(runtime, "ground");
  const url = `/api/dreams/${id}?knowledgeBaseId=demo`;
  expect((await app.inject({ method: "DELETE", url })).json()).toEqual({ deleted: true });
  expect(runtime.interrupt).toHaveBeenCalledWith(ground.ref);
  runtime.complete(ground.index, { facts: [] });
  expect(await store.readJson("demo", id, "state.json")).toBeUndefined();
  expect((await app.inject(url)).statusCode).toBe(404);
});

it("saves a description and point preferences without running an agent", async () => {
  const { app, runtime } = await fixture();
  const query = "?knowledgeBaseId=demo";
  const description = { title: "如果没有改变岗位", decisionAt: date, situation: "当时在同一城市", actualChoice: "留在原组", aftermath: "同年接了新的项目" };
  const point = await app.inject({ method: "POST", url: "/api/dreams/points" + query, payload: description });
  const saved = point.json();
  expect(saved).toMatchObject({ title: description.title, suggestedDecisionAt: date, source: { kind: "self-described" } });
  const preference = { method: "POST" as const, url: "/api/dreams/points/preference" + query,
    payload: { key: "life-stage:" + stage, preference: "ignored" } };
  expect((await app.inject(preference)).json()).toEqual({ preference: "ignored" });
  expect((await app.inject("/api/dreams/workspace" + query)).json()).toMatchObject({
    described: [saved], collection: { pointPreferences: { [preference.payload.key]: "ignored" } },
  });
  expect((await app.inject({ ...preference, payload: { ...preference.payload, preference: null } })).statusCode).toBe(200);
  expect((await app.inject("/api/dreams/workspace" + query)).json().collection.pointPreferences).toEqual({});
  const payload = { knowledgeBaseId: "demo", point: { ...saved.source, decisionAt: date } };
  const environment = { method: "POST" as const, url: "/api/dreams/environment", payload };
  const coverage = (await app.inject(environment)).json();
  expect(coverage).toMatchObject({ before: expect.any(Number), after: expect.any(Number) });
  expect((await app.inject({ ...environment, payload: { ...payload, point: { ...payload.point, aftermath: "" } } })).json()).toMatchObject({ after: coverage.after - 1 });
  expect((await app.inject({ ...environment, payload: { ...payload, knowledgeBaseId: "other" } })).statusCode).toBe(400);
  expect(runtime.calls).toEqual([]);
});

it("uses the chosen alternative and horizon when there are no indexed records", async () => {
  const { app, runtime } = await fixture();
  const description = { title: "如果开始新的工作", decisionAt: date };
  const point = (await app.inject({ method: "POST", url: "/api/dreams/points?knowledgeBaseId=other", payload: description })).json();
  const accepted = await app.inject({ method: "POST", url: "/api/dreams", payload: {
    knowledgeBaseId: "other", point: { ...point.source, alternatives: ["提交内部申请"], horizon: "one-year", actualChoice: "维持现状" },
  } });
  expect(accepted.statusCode).toBe(202);
  expect(accepted.json()).toMatchObject({ until: "2021-03-02" });
  const ground = await waitForCall(runtime, "ground");
  runtime.complete(ground.index, { facts: [] });
  const plan = await waitForCall(runtime, "plan");
  expect(plan.input.prompt).toContain('"alternatives":["提交内部申请"]');
  expect(plan.input.prompt).toContain('"until":"2021-03-02"');
  runtime.complete(plan.index, { decision: description.title,
    storyBible: [{ aspect: "住处", text: "仍在原城市合租，通勤不变" }],
    branches: [{ ...branch, checks: [], divergence: "先提交申请，日常围绕面试和交接重排" }] });
  const verify = await waitForCall(runtime, "verify");
  runtime.complete(verify.index, unknown);
  const organize = await waitForCall(runtime, "organize");
  expect(organize.input.prompt).toContain('"requestedChoice":"提交内部申请"');
  expect(organize.input.prompt).toContain('"storyBible":[{"aspect":"住处","text":"仍在原城市合租，通勤不变"}]');
  expect(organize.input.prompt).toContain('"divergence":"先提交申请，日常围绕面试和交接重排"');
  expect(organize.input.prompt).toContain('"realityReference":"维持现状"');
  const outcome = "如果先提交内部申请，你会约经理谈调岗，获准后再交接手上的工作。";
  runtime.complete(organize.index, {
    outcome, timeline: [{ horizon: "一周内", date: "2020-03-08", possibility: "会先与经理约时间。", condition: "", basis: [] }], gaps: [],
  });
  const refine = await waitForCall(runtime, "refine");
  expect(refine.input.prompt).toContain('"storyBible":[{"aspect":"住处"');
  expect(refine.input.prompt).toContain('"draft"');
  const refinedText = "约到了经理，你在例会后留下来谈调岗，第二周开始交接手上的模块。";
  runtime.complete(refine.index, {
    outcome, timeline: [{ horizon: "一周内", date: "2020-03-08", possibility: refinedText, condition: "", basis: [] }], gaps: [],
  });
  await vi.waitFor(async () => expect((await app.inject(`/api/dreams/${accepted.json().id}?knowledgeBaseId=other`)).json()).toMatchObject({
    status: "ready", environment: { after: 0 },
    report: { verification: "unreviewed", summary: outcome, branches: [{ timeline: [{ possibility: refinedText, condition: "", review: { verdict: "unknown" } }] }] },
  }));
  expect(runtime.calls).toHaveLength(5);
  expect((await app.inject({ method: "POST", url: `/api/dreams/${accepted.json().id}/insights?knowledgeBaseId=other`, payload: { key: 0 } })).statusCode).toBe(404);
});

it("keeps the organize draft when dream refinement fails", async () => {
  const { app, runtime } = await fixture();
  const description = { title: "如果开始新的工作", decisionAt: date };
  const point = (await app.inject({ method: "POST", url: "/api/dreams/points?knowledgeBaseId=other", payload: description })).json();
  const accepted = await app.inject({ method: "POST", url: "/api/dreams", payload: {
    knowledgeBaseId: "other", point: { ...point.source, alternatives: ["提交内部申请"], horizon: "one-year", actualChoice: "维持现状" },
  } });
  const ground = await waitForCall(runtime, "ground");
  runtime.complete(ground.index, { facts: [] });
  const plan = await waitForCall(runtime, "plan");
  runtime.complete(plan.index, { decision: description.title, branches: [{ ...branch, checks: [] }] });
  const verify = await waitForCall(runtime, "verify");
  runtime.complete(verify.index, unknown);
  const organize = await waitForCall(runtime, "organize");
  runtime.complete(organize.index, {
    outcome: "如果先提交内部申请，你会约经理谈调岗。",
    timeline: [{ horizon: "一周内", possibility: "会先与经理约时间。", condition: "主管同意", basis: [] }], gaps: [],
  });
  const refine = await waitForCall(runtime, "refine");
  runtime.fail(refine.index, "「审梦修订」超过 20 分钟，已完成的步骤已保留。");
  await vi.waitFor(async () => expect((await app.inject(`/api/dreams/${accepted.json().id}?knowledgeBaseId=other`)).json()).toMatchObject({
    status: "ready",
    report: { verification: "unreviewed", summary: "如果先提交内部申请，你会约经理谈调岗。",
      branches: [{ timeline: [{ possibility: "会先与经理约时间。" }], gaps: ["初稿直接交付：审梦修订未在时限内完成。"] }] },
  }));
  expect(runtime.calls).toHaveLength(5);
});

it("recommends options before starting a run and gives the model only decision-time evidence", async () => {
  const { app, runtime } = await fixture();
  const response = app.inject({ method: "POST", url: "/api/dreams/suggestions", payload: {
    ...startRequest, point: { ...startRequest.point, actualChoice: "留任", aftermath: "事后自述哨兵" },
  } });
  const preview = await waitForCall(runtime, "recommend");
  const file = preview.input.knowledgeEvidence!.file;
  const frozen = await readFile(file, "utf8");
  expect(frozen).toContain("还可以提出内部调岗申请");
  expect(frozen).not.toContain(after);
  expect(frozen).not.toContain("事后自述哨兵");
  expect(preview.input.prompt).toContain('"actualChoiceToExclude":"留任"');
  expect(preview.input.prompt).not.toContain("事后自述哨兵");
  runtime.complete(preview.index, { suggestions: ["提交内部申请", "先试做短期项目", "留任"] });
  expect((await response).json()).toEqual({ suggestions: ["提交内部申请", "先试做短期项目"] });
  await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect((await app.inject("/api/dreams?knowledgeBaseId=demo")).json()).toMatchObject({ runs: [] });
});

it("blindly simulates the actual choice before comparing it with later records", async () => {
  const { app, runtime } = await fixture();
  const accepted = await app.inject({ method: "POST", url: "/api/dreams", payload: {
    ...startRequest, point: { ...startRequest.point, actualChoice: "留任", aftermath: "事后自述哨兵", alternatives: [branch.intervention] },
  } });
  const ground = await waitForCall(runtime, "ground");
  runtime.complete(ground.index, grounding);
  const plan = await waitForCall(runtime, "plan");
  runtime.complete(plan.index, { decision: "是否申请调岗", branches: [{ ...branch, checks: [] }] });
  const verify = await waitForCall(runtime, "verify");
  runtime.complete(verify.index, unknown);
  const organize = await waitForCall(runtime, "organize");
  runtime.complete(organize.index, { timeline: [], gaps: ["缺少材料"] });
  const blind = await waitForCall(runtime, "calibrate");
  expect(blind.input.prompt).toContain('"actualChoice":"留任"');
  const frozen = await readFile(blind.input.knowledgeEvidence!.file, "utf8");
  expect(frozen).not.toContain(secret);
  expect(frozen).not.toContain("事后自述哨兵");
  runtime.complete(blind.index, { timeline: [{ horizon: "几周内", possibility: "留在原有岗位。", condition: "继续履行原合同。",
    basis: [{ pageId: "dream-grounded-facts", line: 1, quote: groundedText }] }], gaps: [] });
  const review = await waitForCall(runtime, "review");
  expect(review.input.prompt).toContain('"blind":["留在原有岗位。"]');
  expect(await readFile(review.input.knowledgeEvidence!.file, "utf8")).toContain("事后自述哨兵");
  runtime.complete(review.index, { summary: "实际路径已对照。", actualPath: unknown, reviews: [], calibration: [unknown] });
  await vi.waitFor(async () => expect((await app.inject(`/api/dreams/${accepted.json().id}?knowledgeBaseId=demo`)).json().report)
    .toMatchObject({ backtest: [{ claim: "留在原有岗位。", review: { verdict: "unknown" } }] }));
});

it("allows a long dream to reach calibration and resumes only the unfinished turn after a timeout", async () => {
  const { app, runtime } = await fixture();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    const accepted = await app.inject({ method: "POST", url: "/api/dreams", payload: {
      ...startRequest, point: { ...startRequest.point, actualChoice: "留任", alternatives: [branch.intervention, "申请外部岗位"] },
    } });
    expect(accepted.statusCode).toBe(202);
    const url = "/api/dreams/" + accepted.json<DreamRun>().id;
    const library = "?knowledgeBaseId=demo";
    const ground = await waitForCall(runtime, "ground");
    await vi.advanceTimersByTimeAsync(12 * 60_000);
    runtime.complete(ground.index, grounding);
    const plan = await waitForCall(runtime, "plan");
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    const external = { id: "external", title: "外部岗位", intervention: "申请外部岗位", checks: [] };
    runtime.complete(plan.index, { decision: "是否换岗", branches: [{ ...branch, checks: [] }, external] });
    const verifyTransfer = await waitForCall(runtime, "verify", '"id":"transfer"');
    const verifyExternal = await waitForCall(runtime, "verify", '"id":"external"');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    runtime.complete(verifyTransfer.index, unknown);
    runtime.complete(verifyExternal.index, unknown);
    const draft = { timeline: [{ horizon: "几周内", possibility: "先经历资格评估。", condition: "提交有效申请", basis: [] }], gaps: [] };
    runtime.complete((await waitForCall(runtime, "organize", '"id":"transfer"')).index, draft);
    runtime.complete((await waitForCall(runtime, "organize", '"id":"external"')).index, draft);
    runtime.complete((await waitForCall(runtime, "refine", '"id":"transfer"')).index, draft);
    runtime.complete((await waitForCall(runtime, "refine", '"id":"external"')).index, draft);
    const blind = await waitForCall(runtime, "calibrate");
    expect((await app.inject(url + library)).json()).toMatchObject({ phase: "calibrate", progress: { finished: 2, total: 2 } });

    await vi.advanceTimersByTimeAsync(20 * 60_000);
    await vi.waitFor(async () => expect((await app.inject(url + library)).json()).toMatchObject({
      status: "failed", error: expect.stringContaining("回测"), resumable: true, progress: { finished: 2, total: 2 },
    }));
    expect(runtime.interrupt.mock.calls).toEqual([[blind.ref]]);
    const resumed = await app.inject({ method: "POST", url: url + "/resume" + library });
    expect(resumed.statusCode).toBe(200);
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(blind.index + 2));
    const retried = runtime.calls.at(-1)!;
    expect(retried.input.prompt).toBe(blind.input.prompt);
    expect(retried.input.knowledgeEvidence).toEqual(blind.input.knowledgeEvidence);
    runtime.complete(blind.index + 1, { ...draft, timeline: [{
      horizon: "几周内", possibility: "留在原有岗位。", condition: "继续履行原合同。",
      basis: [{ pageId: "dream-grounded-facts", line: 1, quote: groundedText }],
    }] });
    const review = await waitForCall(runtime, "review");
    runtime.complete(review.index, { summary: "两条路径已核对。", actualPath: unknown, calibration: [unknown],
      reviews: [{ branchId: "transfer", claims: [unknown] }, { branchId: "external", claims: [unknown] }] });
    await vi.waitFor(async () => expect((await app.inject(url + library)).json()).toMatchObject({
      status: "ready", report: { backtest: [{ claim: "留在原有岗位。", review: { verdict: "unknown" } }] },
    }));
  } finally {
    vi.useRealTimers();
  }
});

it("rejects invalid date ranges and never starts from another library's page", async () => {
  const { app, runtime } = await fixture();
  for (const payload of [
    { ...startRequest, knowledgeBaseId: "other" },
    { ...startRequest, point: { ...startRequest.point, decisionAt: { earliest: "2020-02-30", latest: "2020-03-01" } } },
    { ...startRequest, point: { ...startRequest.point, decisionAt: { earliest: "2018-01-01", latest: "2020-03-01" } } },
  ]) expect((await app.inject({ method: "POST", url: "/api/dreams", payload })).statusCode).toBe(400);
  expect(runtime.calls).toHaveLength(0);
});

it("recovers completed work, restarts an interrupted stage and cancels the replacement", async () => {
  const { app, runtime, service, makeService, store } = await fixture();
  runtime.earlyAnswer = { facts: [] };
  const accepted = await app.inject({ method: "POST", url: "/api/dreams", payload: startRequest });
  const { id } = accepted.json<DreamRun>();
  // The grounding completion arrived before its start call returned.
  const plan = await waitForCall(runtime, "plan");
  runtime.complete(plan.index, { decision: "是否申请调岗", branches: [{ ...branch, checks: [] }], branchLimitReason: "可查的选择只有调岗" });
  await waitForCall(runtime, "verify");
  runtime.earlyAnswer = undefined;
  await service.close();
  expect((await store.load("demo", id))?.run.status).toBe("running");
  expect(await store.readJson("demo", id, "plan.json")).toHaveProperty("result");
  const restarted = makeService();
  cleanups.unshift(() => restarted.close());
  await restarted.reconcile();
  await vi.waitFor(() => expect(runtime.calls).toHaveLength(4));
  expect(runtime.calls[3]!.input.prompt).toContain("当前阶段: verify");
  const result = await restarted.cancel("demo", id);
  expect(result?.status).toBe("cancelled");
  runtime.complete(3, unknown);
  expect((await restarted.get("demo", id))?.status).toBe("cancelled");
});

it("rejects a workflow with an unbound dependency", async () => {
  const { service, runtime } = await fixture();
  const job = await service.start({ ...startRequest, point: { ...startRequest.point, kind: "life-stage" } });
  const ground = await waitForCall(runtime, "ground");
  runtime.complete(ground.index, { facts: [] });
  const lead = await waitForCall(runtime, "plan");
  runtime.complete(lead.index, { decision: "是否申请", branches: [{ ...branch, checks: [{ ...branch.checks[1] }] }] });
  await vi.waitFor(async () => expect(await service.get("demo", job.id)).toMatchObject({ status: "failed" }));
  expect(runtime.calls).toHaveLength(2);
});

it("rejects an unreasoned single branch", async () => {
  const { service, runtime } = await fixture();
  const job = await service.start({ ...startRequest, point: { ...startRequest.point, kind: "life-stage" } });
  const ground = await waitForCall(runtime, "ground");
  runtime.complete(ground.index, grounding);
  const lead = await waitForCall(runtime, "plan");
  runtime.complete(lead.index, { decision: "是否申请", branches: [{ ...branch, checks: [] }] });
  await vi.waitFor(async () => expect(await service.get("demo", job.id)).toMatchObject({
    status: "failed", error: expect.stringContaining("至少两条"),
  }));
  expect(runtime.calls).toHaveLength(2);
});

it("rejects a plan that uses an unknown eligibility check to stop an alternative", async () => {
  const { service, runtime } = await fixture();
  const job = await service.start({ ...startRequest, point: { ...startRequest.point, kind: "life-stage" } });
  const ground = await waitForCall(runtime, "ground");
  runtime.complete(ground.index, grounding);
  const lead = await waitForCall(runtime, "plan");
  runtime.complete(lead.index, { decision: "是否申请", branches: [
    { ...branch, stopWhen: { checkId: "eligibility", verdict: "unknown" } },
    { id: "stay", title: "留任", intervention: "留任并试做项目", checks: [] },
  ] });
  await vi.waitFor(async () => expect(await service.get("demo", job.id)).toMatchObject({
    status: "failed", error: expect.stringContaining("必须完成条件推演"),
  }));
  expect(runtime.calls).toHaveLength(2);
});

it("rejects a real quote from the wrong evidence view", async () => {
  const { service, runtime } = await fixture();
  const job = await service.start({ ...startRequest, point: { ...startRequest.point, kind: "life-stage" } });
  const ground = await waitForCall(runtime, "ground");
  runtime.complete(ground.index, { facts: [] });
  const lead = await waitForCall(runtime, "plan");
  runtime.complete(lead.index, { decision: "是否申请调岗", branches: [{ ...branch, checks: [] }], branchLimitReason: "可查的选择只有调岗" });
  const verify = await waitForCall(runtime, "verify");
  runtime.complete(verify.index, { text: "试图用事后材料支持起点", verdict: "supported", evidence: [reviewCitation] });
  await vi.waitFor(async () => expect(await service.get("demo", job.id)).toMatchObject({
    status: "failed", error: expect.stringContaining("引文与绑定的原文"),
  }));
  expect(runtime.calls).toHaveLength(3);
});

it("persists the queued state before a resumed dream launches", async () => {
  const { service, runtime, store } = await fixture();
  const job = await service.start({ ...startRequest, point: { ...startRequest.point, kind: "life-stage" } });
  const ground = await waitForCall(runtime, "ground");
  runtime.fail(ground.index, "暂时读取失败");
  await vi.waitFor(async () => expect(await service.get("demo", job.id)).toMatchObject({ status: "failed", resumable: true }));
  await service.resume("demo", job.id);
  const onDisk = await store.readJson<{ run: Pick<DreamRun, "status" | "resumable"> }>("demo", job.id, "state.json");
  expect(["queued", "running"]).toContain(onDisk?.run.status);
  expect(onDisk?.run.resumable).toBeUndefined();
});

it("keeps listing healthy dreams when one stored state file is damaged", async () => {
  const { service, store } = await fixture();
  const job = await service.start({ ...startRequest, point: { ...startRequest.point, kind: "life-stage" } });
  const foreign = "0f0e0d0c-0b0a-0908-0706-050403020100";
  await store.writeJson("demo", foreign, "state.json", { version: 1, run: { id: foreign, knowledgeBaseId: "demo" } });
  const runs = (await service.list("demo")).map(item => item.id);
  expect(runs).toContain(job.id);
  expect(runs).not.toContain(foreign);
  expect(await service.hasActive("demo")).toBe(true);
  await expect(store.load("demo", foreign)).rejects.toThrow("不匹配");
});
