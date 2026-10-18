import { expect, it } from "vitest";
import type { WikiPageSummary } from "@the-way-here/shared";
import { diaryEntityLinks, linkDiaryEntities } from "./diary-entities.js";
const entity = (id: string, title: string, aliases: string[] = []): WikiPageSummary => ({ id, title, aliases, category: "entities", isSource: false } as WikiPageSummary);
it("matches known names and aliases, leaving shared names, sources and unknown people alone", () => {
  const pages = [entity("wiki/07 人物与城市/林舟", "林舟", ["小林", "老同学"]), entity("wiki/07 人物与城市/周远", "周远", ["老同学"]), { ...entity("sources/小王", "小王"), isSource: true }];
  const links = diaryEntityLinks("嗯，今天和小林、老同学、小王、陌生人吃饭。", pages);
  expect(links).toEqual([{ pageId: pages[0]!.id, title: "林舟", matchedNames: ["小林"] }]);
  expect(linkDiaryEntities("# 日记\n今天和小林、老同学见面。", links)).toBe("# 日记\n今天和[[wiki/07 人物与城市/林舟|小林]]、老同学见面。");
});
it("keeps valid links and blocks invented identity links without editing code or URLs", () => {
  const links = diaryEntityLinks("和小林散步", [entity("wiki/林舟", "林舟", ["小林"])]);
  expect(linkDiaryEntities("[[wiki/林舟|小林]]、[[wiki/别的人|陌生人]]、`小林`、[小林](https://example.test)", links)).toBe("[[wiki/林舟|小林]]、陌生人、`小林`、[小林](https://example.test)");
});

it("recalls relationship evidence for misrecognized names without assigning a role to one person", () => {
  const pages = [entity("wiki/林舟", "林舟"), entity("wiki/周远", "周远"), entity("wiki/城市", "城市")];
  const bodies: Record<string, string> = {
    "wiki/林舟": "# 林舟\n\n2026 年是我的直属上级。\n\n其他无关生活细节。",
    "wiki/周远": "# 周远\n\n2023 年曾是我的领导。",
    "wiki/城市": "# 城市\n\n居住地点。",
  };
  const links = diaryEntityLinks("我的 leader 林周说起新的 leader。", pages, id => bodies[id]);
  expect(links.map(link => link.title)).toEqual(["林舟", "周远"]);
  expect(links[0]?.relationshipContext).toBe("2026 年是我的直属上级。");
  expect(JSON.stringify(links)).not.toContain("无关生活细节");
  expect(linkDiaryEntities("我的 leader [[wiki/林舟|林舟]]说起新的 leader。", links)).toBe("我的 leader [[wiki/林舟|林舟]]说起新的 leader。");
  expect(linkDiaryEntities("我的 leader 林周。", links)).toBe("我的 leader 林周。");
  expect(diaryEntityLinks("今天散步。", pages, () => { throw new Error("unnecessary read"); })).toEqual([]);
});

it("links corrected canonical names and is idempotent without linking ordinary pronouns", () => {
  const links = diaryEntityLinks("小林和自己聊聊", [entity("wiki/林舟", "林舟", ["小林"]), entity("wiki/自己", "自己")]);
  const result = linkDiaryEntities("林舟给自己一些空间。", links);
  expect(result).toBe("[[wiki/林舟|林舟]]给自己一些空间。");
  expect(linkDiaryEntities(result, links)).toBe(result);
});

it("never promotes ambiguous canonical names or generic relationship aliases into identity links", () => {
  const links = diaryEntityLinks("小林和我的 leader 见面。", [entity("wiki/甲/林舟", "林舟", ["小林", "leader"]), entity("wiki/乙/林舟", "林舟")]);
  expect(linkDiaryEntities("我的 leader 林舟和小林见面。", links)).toBe("我的 leader 林舟和[[wiki/甲/林舟|小林]]见面。");
});
