import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WikiPage } from "@the-way-here/shared";
import { parseUnderstandingScan, type UnderstandingPolicy } from "./predictions.js";
const policy = JSON.parse(readFileSync(new URL("../../../../knowledge-engine/skills/consume/scan-understanding/references/scoring.json", import.meta.url), "utf8")) as UnderstandingPolicy;
function page(id: string, overrides: Partial<WikiPage> = {}): WikiPage {
  return { id, markdown: `${id} ${"具体的行动与后果。".repeat(20)}`, category: "events", outgoingLinks: [], isSource: false, ...overrides } as WikiPage;
}
describe("understanding scan",()=>{
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
});
