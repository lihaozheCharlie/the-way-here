import { describe, expect, it } from "vitest";
import { buildEvidenceProfiles, createEvidenceSnapshot, parseRetrievalPolicy, searchEvidenceGroups, type EvidencePage } from "./index.js";

const policy = parseRetrievalPolicy({version:1,roles:[{id:"reading",patterns:["/books/"]}],signals:[{id:"identification",terms:["我认同"]}]});
const pages: EvidencePage[] = [
  {id:"wiki/港城",title:"港城",aliases:["旧港"],isSource:false,markdown:"搬家的综合说明",outgoingLinks:[{raw:"[[日记]]",target:"日记",label:"来源",resolvedId:"diary/2026.9.20"}]},
  {id:"diary/2026.9.20",isSource:true,markdown:"2020年曾想搬家，今年已放弃这个想法。"},
  {id:"sources/books/传记",isSource:true,markdown:"我认同作者关于休息的看法。"},
];
describe("shared evidence retrieval independent of prediction",()=>{
  it("supports ordinary title/alias questions and reading-note queries without forecast filters",()=>{
    const profiles = buildEvidenceProfiles(pages,policy);
    expect(searchEvidenceGroups(pages,profiles,[{id:"question",terms:["旧港"]}]).map(h=>h.pageId)).toEqual(["wiki/港城"]);
    expect(searchEvidenceGroups(pages,profiles,[{id:"book",terms:["休息"]}]).map(h=>h.pageId)).toEqual(["sources/books/传记"]);
  });
  it("preserves source chronology and graph for a build conflict check without making judgments",()=>{
    const profile = buildEvidenceProfiles(pages,policy);
    expect(profile[1]?.time).toMatchObject({recordedDate:"2026-09-20",bodyDateClues:[{line:1,years:["2020"],relative:["今年"]}]});
    expect(profile[0]?.links[0]?.pageId).toBe("diary/2026.9.20");
    expect(profile[2]?.role).toBe("reading");
    expect(profile[2]).not.toHaveProperty("fact");
  });
  it("creates stable task snapshots whose identity changes with library, text and shared rules",()=>{
    const first = createEvidenceSnapshot("demo",pages,policy);
    expect(first).not.toHaveProperty("lifeSearch");
    expect(first.retrieval.profiles).toHaveLength(3);
    expect(createEvidenceSnapshot("demo",[...pages].reverse(),policy).inputHash).toBe(first.inputHash);
    expect(createEvidenceSnapshot("other",pages,policy).inputHash).not.toBe(first.inputHash);
    expect(createEvidenceSnapshot("demo",[{...pages[0]!,markdown:"新事实"},...pages.slice(1)],policy).inputHash).not.toBe(first.inputHash);
    expect(createEvidenceSnapshot("demo",pages,{...policy,roles:[]}).inputHash).not.toBe(first.inputHash);
  });
});
