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
