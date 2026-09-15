import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WikiPage } from "@the-way-here/shared";
import { scoreUnderstanding, parseUnderstandingScan, parsePredictionReport, predictionExcerpts, type UnderstandingPolicy } from "./predictions.js";
const policy = JSON.parse(readFileSync(new URL("../../../../knowledge-engine/skills/consume/predict-self/references/scoring.json", import.meta.url), "utf8")) as UnderstandingPolicy;
const now = Date.parse("2026-09-14");
function page(id: string, overrides: Partial<WikiPage> = {}): WikiPage {
  return { id, markdown: `${id} ${"具体的行动与后果。".repeat(20)}`, category: "events", outgoingLinks: [], isSource: false, ...overrides } as WikiPage;
}
describe("understanding evidence score", () => {
  it("does not unlock empty, ungrounded, short or copied input", () => {
    expect(scoreUnderstanding([], policy, now).score).toBe(0);
    const s = page("source", { isSource: true, end: "2026-09-01" });
    const p = page("event", { outgoingLinks: [{ resolvedId: s.id } as any] });
    const result = scoreUnderstanding([s, p], policy, now);
    expect(scoreUnderstanding([s, p, { ...p, id: "copy" }], policy, now).score).toBe(result.score);
    expect(scoreUnderstanding([s, ...Array.from({length: 100}, (_, i) => page(String(i)))], policy, now).score).toBe(0);
  });
  it("requires strictly more than sixty and never uses file modification as evidence date", () => {
    const sources = [page("s1", { isSource: true, end: "2025-01-01" }), page("s2", { isSource: true, end: "2026-01-01" })];
    const categories = ["events", "cycles", "state", "systems", "personal-lines", "life-stages"] as const;
    const pages = categories.map((category, i) => page(`p${i}`, { category, outgoingLinks: [{resolvedId: sources[i % 2].id} as any] }));
    const sixtyPolicy = { ...policy, entry: undefined, facets: [{ id: "e", label: "e", metric: "groundedPages", max: 100, target: 10 }] };
    expect(scoreUnderstanding([...sources, ...pages], sixtyPolicy, now)).toMatchObject({ score: 60, unlocked: false });
    expect(scoreUnderstanding([...sources, ...pages, page("p7", { outgoingLinks: [{resolvedId: "s1"} as any] })], sixtyPolicy, now).unlocked).toBe(true);
    const score = scoreUnderstanding([...sources, ...pages], policy, now);
    expect(score.facets.find(f => f.id === "freshness")?.value).toBe(0);
    expect(score.facets.find(f => f.id === "time")?.value).toBe(20);
  });
  it("validates semantic scan levels against real Wiki evidence", () => {
    const p=page("wiki");
    const output={version:2,facets:policy.assessment!.facets.map(f=>({id:f.id,level:3,reason:"有具体经历，仍缺部分处境",gaps:["缺少近况"],evidence:[{pageId:p.id,quote:"具体的行动与后果。"}]}))};
    expect(parseUnderstandingScan(JSON.stringify(output),[p],policy)).toMatchObject({score:74,unlocked:true});
    output.facets.forEach(f=>f.level=2);
    expect(parseUnderstandingScan(JSON.stringify(output),[p],policy)).toMatchObject({score:50,unlocked:false});
    expect(()=>parseUnderstandingScan(JSON.stringify(output),[{...p,isSource:true}],policy)).toThrow();
    output.facets[0].evidence[0].quote="不存在的原文依据";
    expect(()=>parseUnderstandingScan(JSON.stringify(output),[p],policy)).toThrow();
  });
  it("excludes ambiguous citations and future dates", () => {
    const s = page("s", { isSource: true, end: "2030-01-01" });
    expect(scoreUnderstanding([s, page("p", { outgoingLinks: [{resolvedId: "s", ambiguous: true} as any] })], policy, now).score).toBe(0);
  });
  it.each(["2013.6.2 日记", "2013-06-02 日记", "2013/6/2 日记", "2013,6,2 日记", "2013年6月2日日记"])("counts diary filename dates without metadata: %s", title => {
    const sources = [page("old", {isSource:true,title}), ...[1,2,3].map(day => page(`recent-${day}`, {isSource:true,title:`2026.9.${day} 日记`}))];
    const wiki = page("wiki", {outgoingLinks:sources.map(s => ({resolvedId:s.id} as any))});
    const score = scoreUnderstanding([...sources,wiki],policy,now);
    expect(score.facets.find(f => f.id === "time")).toMatchObject({value:20,observed:4841});
    expect(score.facets.find(f => f.id === "freshness")).toMatchObject({value:10,observed:3});
  });
  it("does not count invalid, undated, unreferenced, future or ambiguously referenced records", () => {
    const sources = [
      page("valid", {isSource:true,title:"2026.9.1 日记"}),
      page("bad", {isSource:true,title:"2026.2.30 日记"}),
      page("missing", {isSource:true,title:"没有日期",modifiedAt:"2026-09-01"}),
      page("future", {isSource:true,title:"2027.1.1 日记"}),
      page("unreferenced", {isSource:true,title:"2010.1.1 日记"}),
      page("ambiguous", {isSource:true,title:"2011.1.1 日记"}),
    ];
    const wiki = page("wiki", {outgoingLinks:sources.filter(s => s.id !== "unreferenced").map(s => ({resolvedId:s.id,ambiguous:s.id === "ambiguous"} as any))});
    const score = scoreUnderstanding([...sources,wiki],policy,now);
    expect(score.facets.find(f => f.id === "time")?.value).toBe(0);
    expect(score.facets.find(f => f.id === "freshness")?.observed).toBe(1);
  });
  it("prefers an explicit record date and includes today's diary by calendar day", () => {
    const current = new Date(now);
    const todayTitle = `${current.getFullYear()}.${current.getMonth()+1}.${current.getDate()} 日记`;
    const sources = [page("today",{isSource:true,title:todayTitle}), page("old",{isSource:true,title:todayTitle,start:"2020-01-01"})];
    const wiki = page("wiki",{outgoingLinks:sources.map(s=>({resolvedId:s.id} as any))});
    const score = scoreUnderstanding([...sources,wiki],policy,now);
    expect(score.facets.find(f => f.id === "time")?.value).toBe(20);
    expect(score.facets.find(f => f.id === "freshness")?.observed).toBe(1);
  });
});

describe("prediction report boundary", () => {
  const report = () => ({ version: 4, summary: "当前理解", horizon: "五年", tensions: [], changes: [], domains: ["work", "life"].map(id => ({ id, title: id === "work" ? "工作" : "生活", currentDetail: "当前完整背景", current: "仍需了解", gaps: ["缺证据"], branches: [] })) });
  it("accepts an honest unknown domain but rejects missing or duplicated domains", () => {
    expect(parsePredictionReport(JSON.stringify(report()), []).domains).toHaveLength(2);
    const invalid = report(); invalid.domains[0].id = "life";
    expect(() => parsePredictionReport(JSON.stringify(invalid), [])).toThrow();
  });
  it("rejects invented quotes, long roots and malformed outcomes while retaining supported sparse paths", () => {
    const r: any = report();
    const outcome = { probability: 50, probabilityReason: "两种走势暂难区分", title: "结果", summary: "推断", confidence: "low", conditions: ["条件"], factors: [{ label: "支持", mechanism: "原因", direction: "support", strength: 2 }], evidence: [{ pageId: "s", cue: "一次具体的行动", quote: "并不存在的引用原文", interpretation: "解释" }], counterEvidence: [], unknowns: [], actions: [{ action: "试一试", observation: "反馈", reviewAfter: "两周" }] };
    r.domains[0].branches = Array.from({length: 5}, (_, i) => ({probability: 20, probabilityReason: "比较当前资料中的几个方向", title: `具体角色${i}`, choice: "投入主要时间亲自做项目", summary: "机制", dailyLife: "负责一个实际项目，与协作者每天交付产品。", outcomes: [outcome, {...outcome,title:"另一种结果"}]}));
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    outcome.evidence[0].quote = "具体的行动与后果。";
    expect(parsePredictionReport(JSON.stringify(r), [page("s")]).domains[0].branches).toHaveLength(5);
    const savedCue = outcome.evidence[0].cue;
    outcome.evidence[0].cue = "";
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    outcome.evidence[0].cue = savedCue;
    r.version = 2;
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    r.version = 4;
    const branch0 = r.domains[0].branches[0];
    branch0.probability = 21;
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    branch0.probability = 20;
    outcome.probability = 51;
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    outcome.probability = 50;
    branch0.probability = -1;
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    branch0.probability = 20;
    const originalBranches = r.domains[0].branches;
    r.domains[0].branches = originalBranches.slice(0, 2).map((b: any) => ({...b, probability: 50}));
    expect(parsePredictionReport(JSON.stringify(r), [page("s")]).domains[0].branches).toHaveLength(2);
    r.domains[0].branches = originalBranches.slice(0, 1).map((b: any) => ({...b, probability: 100}));
    expect(parsePredictionReport(JSON.stringify(r), [page("s")]).domains[0].branches).toHaveLength(1);
    r.domains[0].branches = originalBranches;
    r.domains[0].current = "这是树根不应容纳的很长一段叙述。".repeat(10);
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    r.domains[0].current = "当前状态";
    r.domains[0].branches[0].dailyLife = "";
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
    r.domains[0].branches[0].dailyLife = "负责具体项目并参与协作。";
    outcome.factors[0].strength = 4;
    expect(() => parsePredictionReport(JSON.stringify(r), [page("s")])).toThrow();
  });
});


describe("bounded prediction evidence", () => {
  it("retains categories and original sources when one category has many long pages", () => {
    const repeated = Array.from({ length: 30 }, (_, i) => page(`work-${i}`, { markdown: "大量工作资料".repeat(2000), category: "events" }));
    const life = page("life", {category:"personal-lines"});
    const source = page("original", {isSource:true});
    const selected = predictionExcerpts([...repeated, life, source]);
    expect(selected.some(p => p.id === "life")).toBe(true);
    expect(selected.some(p => p.id === "original")).toBe(true);
    expect(selected.reduce((sum, p) => sum + p.markdown.length, 0)).toBeLessThanOrEqual(120000);
    expect(selected.every(p => p.markdown.length <= 6000)).toBe(true);
  });
});
