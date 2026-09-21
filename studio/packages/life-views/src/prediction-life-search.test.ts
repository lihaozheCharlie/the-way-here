import { describe, expect, it } from "vitest";
import { parseLifeSearchPolicy, searchPredictionLifeEvidence } from "./prediction-life-search.js";

const policy = parseLifeSearchPolicy({ version: 1, groups: [
  { id: "home", label: "居住", terms: ["搬家", "relocate"] },
  { id: "family", label: "家庭", terms: ["同住"] },
  { id: "study", label: "学习", terms: ["留学"] },
] });
describe("life evidence recall", () => {
  it("searches full original and wiki bodies beyond preview budgets, preserving every hit line", () => {
    const pages = [
      {id:"old-source",isSource:true,markdown:`${"旧记录".repeat(3000)}\n我考虑搬家。\n😀朋友想搬家，我还在犹豫。`},
      {id:"wiki",isSource:false,markdown:"# 与家人同住\r\n曾考虑 RELOCATE"},
      {id:"empty",isSource:false,markdown:"只有工程发布记录"},
    ];
    const found = searchPredictionLifeEvidence(pages, policy);
    expect(found.scanned).toEqual({sources:1,wiki:2});
    expect(found.groups.map(g => [g.id,g.matchedSources,g.matchedWiki])).toEqual([["home",1,1],["family",0,1],["study",0,0]]);
    expect(found.hits.find(h => h.pageId === "old-source")?.matches).toEqual([{groupId:"home",term:"搬家",lines:[2,3]}]);
    expect(found.hits.find(h => h.pageId === "wiki")?.matches).toContainEqual({groupId:"home",term:"relocate",lines:[2]});
    // Hits retain third-party statements for the skill to disambiguate; they are not inferred desires.
    expect(found.hits).toHaveLength(2);
  });
  it("keeps all matching pages instead of selecting a recent top-k", () => {
    const pages = Array.from({length:180}, (_,i) => ({id:`p${i}`,isSource:i%2===0,markdown:"将来可能搬家，也想同住。"}));
    expect(searchPredictionLifeEvidence(pages, policy).hits).toHaveLength(180);
    expect(searchPredictionLifeEvidence([], policy).scanned).toEqual({sources:0,wiki:0});
  });
  it("rejects malformed dictionaries instead of silently skipping preflight search", () => {
    for (const value of [null, {version:1,groups:[]}, {version:1,groups:[{id:"x",label:"x",terms:[""]}]}, {version:2,groups:policy.groups}, {version:1,groups:[policy.groups[0],policy.groups[0]]}]) {
      expect(() => parseLifeSearchPolicy(value)).toThrow();
    }
  });
});

it("bounds the reading shortlist while retaining both source kinds and all full hits",()=>{
 const pages=Array.from({length:20},(_,i)=>({id:`p${i}`,markdown:"搬家",isSource:i<10,start:i===0?"2026-01-01":"2020-01-01"}));
 const result=searchPredictionLifeEvidence(pages,policy);
 const ids=result.candidates.find(g=>g.groupId==="home")!.pageIds;
 expect(ids).toHaveLength(6);expect(ids).toContain("p0");expect(ids.filter(id=>pages.find(p=>p.id===id)!.isSource)).toHaveLength(3);expect(result.hits).toHaveLength(20);
});

// Use the production policy: regression fixtures must exercise the actual path and signal rules.
import { readFileSync } from "node:fs";
import { datesIn, evidenceTime, parseRetrievalPolicy } from "@the-way-here/wiki-core";
const productionPolicy = parseLifeSearchPolicy(JSON.parse(readFileSync(new URL("../../../../knowledge-engine/skills/consume/predict-self/references/life-search.json", import.meta.url), "utf8")));
const retrievalPolicy = parseRetrievalPolicy(JSON.parse(readFileSync(new URL("../../../../knowledge-engine/skills/common/retrieval/references/source-policy.json", import.meta.url),"utf8")));

it("keeps record dates separate from retrospective, future and conflicting body dates", () => {
  const time = evidenceTime({id:"原始知识库/日记/2026，9,20 回看", isSource:true, markdown:"2022年我想创业。去年尝试过。\n2030年我希望住在海边。\n2024.2.30不是有效日期。"});
  expect(time.recordedDate).toBe("2026-09-20");
  expect(time.bodyDateClues[0]).toMatchObject({line:1,years:["2022"],relative:["去年"]});
  expect(time.bodyDateClues[1]?.years).toEqual(["2030"]);
  expect(datesIn("2018,1,24 2017-12-1 2024年2月29日 2023.2.29")).toEqual(["2018-01-24","2017-12-01","2024-02-29"]);
  expect(evidenceTime({id:"2026.9.20",start:"2020-01-01",isSource:true,markdown:""}).conflict).toBe(true);
  expect(evidenceTime({id:"wiki/阶段",end:"2026-09-20",isSource:false,markdown:""})).toMatchObject({recordedDate:undefined,coverageEnd:"2026-09-20"});
});

it("recalls personal passages in reading notes without making their self-reference a fact", () => {
  const found = searchPredictionLifeEvidence([
    {id:"原始知识库/读书笔记/传记",isSource:true,markdown:"书中说：我想创业。\n我的评论：我不认同这种牺牲家人的工作安排。"},
    {id:"原始知识库/历史小记/古人",isSource:true,markdown:"他希望海外工作，学习、旅行、搬家。"},
  ], productionPolicy,retrievalPolicy);
  expect(found.lanes.find(l=>l.id==="reading-identification")?.pageIds).toEqual(["原始知识库/读书笔记/传记"]);
  expect(found.profiles[0]).toMatchObject({role:"reading",signals:[{id:"identification",lines:[1,2]}]});
  expect(found.hits.some(h=>h.pageId.endsWith("古人"))).toBe(true);
  expect(found.candidates.flatMap(g=>g.pageIds).some(id=>id.endsWith("古人"))).toBe(false);
  expect(JSON.stringify(found.profiles)).not.toContain('"fact"');
});

it("removes navigation and frontmatter noise from evidence shortlists while keeping recent and historical routes", () => {
  const found = searchPredictionLifeEvidence([
    {id:"wiki/log",isSource:false,end:"2026-09-20",markdown:"搬家 工作 创业 希望"},
    {id:"wiki/08 来源索引/日记索引",isSource:false,end:"2026-09-20",markdown:"搬家 工作 创业 希望"},
    {id:"原始知识库/日记/2026.9.19 现状",isSource:true,markdown:"现在在工作。"},
    {id:"原始知识库/日记/2018.1.24 转折",isSource:true,markdown:"开始尝试搬家，但后来停止。"},
    {id:"原始知识库/日记/2026.9.18 普通",isSource:true,markdown:"---\ntags: [搬家]\n---\n午餐很普通。"},
  ],productionPolicy,retrievalPolicy);
  expect(found.candidates.flatMap(g=>g.pageIds)).not.toContain("wiki/log");
  expect(found.lanes.find(l=>l.id==="recent")?.pageIds[0]).toContain("2026.9.19");
  expect(found.lanes.find(l=>l.id==="counter")?.pageIds[0]).toContain("2018.1.24");
  expect(found.hits.some(h=>h.pageId.includes("普通"))).toBe(false);
});

it("freezes links and aliases, rejects foreign graph nodes, and adds a current-interest route", () => {
  const found = searchPredictionLifeEvidence([
    {id:"wiki/地方",title:"测试城市",aliases:["旧城名"],isSource:false,markdown:"搬家",outgoingLinks:[
      {raw:"[[日记]]",target:"日记",label:"后续记录",resolvedId:"日记"},
      {raw:"[[foreign]]",target:"foreign",label:"foreign",resolvedId:"foreign"},
      {raw:"[[重名]]",target:"重名",label:"重名",ambiguous:true},
    ]},
    {id:"日记",isSource:true,markdown:"停止了这个计划。"},
    {id:"prediction-input/current",isSource:true,markdown:"我想了解旧城名的生活"},
  ],productionPolicy,retrievalPolicy);
  expect(found.profiles[0]?.links.map(l=>l.pageId)).toEqual(["日记"]);
  expect(found.profiles[0]?.unresolvedLinks).toEqual([{target:"重名",ambiguous:true}]);
  expect(found.concernTerms).toContain("旧城名");
  expect(found.lanes.find(l=>l.id==="current-input")?.pageIds).toContain("wiki/地方");
});
