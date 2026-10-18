import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { WikiIndex } from "@the-way-here/wiki-core";
import { buildToday, buildFocusWorkspace, buildLifeMap, buildRelationships, buildLetters, buildGraph, buildTimeline } from "./index.js";

test("summary views stay compact with large linked documents while retaining relationships", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-summary-views-"));
  const stage = "wiki/02 人生阶段/创作阶段";
  const event = "wiki/03 关键事件/01 开始";
  const person = "wiki/07 人物与城市/人物/朋友/甲";
  const system = "wiki/06 现实系统/创作系统";
  const letter = "wiki/12 近况回信/2026-10-18";
  const role = "wiki/05 关系角色/支持者";
  const files: Record<string, string> = {
    "wiki/02 人生阶段/人生阶段总览": `# 人生阶段总览\n\n## 阶段地图\n\n| 阶段 | 时间 | 问题 | 入口 |\n|---|---|---|---|\n| [[${stage}]] | 2026 至今 | 创作 | [[${event}]] |`,
    [stage]: `# 创作阶段\n\n[[${person}]] [[${system}]] [[${letter}]]`,
    [event]: `# 01 开始\n\n[[${stage}]] [[${person}]]`,
    [person]: `---\ntype: entity\n---\n# 甲\n\n[[${stage}]] [[${role}]] [[${system}]]`,
    [system]: `# 创作系统\n\n[[${event}]] [[${letter}]]`,
    [letter]: `# 2026-10-18 回信\n\n[[${stage}]] [[${system}]]`,
    [role]: "# 支持者\n\n## 定义\n提供支持。",
    "wiki/11 状态追踪/状态追踪总览": `# 状态追踪总览\n\n## 当前追踪面板\n\n| 追踪项 | 类型 | 判断 | 信号 | 关联 |\n|---|---|---|---|---|\n| 创作 | 需要关注 | 2026-10-18 继续观察 | 保持记录 | [[${system}]] |`,
    "sources/2026-10-18": `# 匿名记录\n\n[[${system}]] [[${person}]]`,
  };
  try {
    for (const [id, markdown] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, id)), { recursive: true });
      const padding = id === role || id.includes("总览") ? "" : `\n\n## 详细内容\n${"匿名长正文。".repeat(20_000)}`;
      await writeFile(path.join(root, `${id}.md`), markdown + padding);
    }
    const index = new WikiIndex(root);
    await index.rebuild();
    const today = buildToday(index);
    const focus = buildFocusWorkspace(index, "创作")!;
    const lifeMap = buildLifeMap(index);
    const relationships = buildRelationships(index);
    const letters = buildLetters(index);
    expect(today.currentStage?.id).toBe(stage);
    expect(today.focusPages.map(page => page.id)).toContain(system);
    expect(focus.related.flatMap(group => group.pages.map(page => page.id))).toEqual(expect.arrayContaining([system, event, letter]));
    expect(focus.evidenceTimeline.map(item => item.page.id)).toContain(letter);
    expect(lifeMap.stages[0]).toMatchObject({ page: { id: stage }, representative: { id: event } });
    expect(lifeMap.stages[0]!.relatedPeople.map(page => page.id)).toContain(person);
    expect(lifeMap.stages[0]!.relatedSystems.map(page => page.id)).toContain(system);
    expect(lifeMap.stages[0]!.relatedLetters.map(page => page.id)).toContain(letter);
    const insight = relationships.groups[0]!.people[0]!;
    expect(insight.relatedStages.map(page => page.id)).toContain(stage);
    expect(insight.relatedRoles.map(page => page.id)).toContain(role);
    expect(insight.relatedSystems.map(page => page.id)).toContain(system);
    expect(insight.mentionCount).toBeGreaterThan(0);
    expect(letters.letters[0]!.themes.map(page => page.id)).toEqual(expect.arrayContaining([stage, system]));

    for (const view of [today, focus, lifeMap, relationships, letters, buildGraph(index), buildTimeline(index)]) {
      const json = JSON.stringify(view);
      for (const field of ["markdown", "renderedMarkdown", "properties", "outgoingLinks", "incomingLinks", "relatedPages"]) {
        expect(json).not.toContain(`"${field}":`);
      }
      expect(Buffer.byteLength(json)).toBeLessThan(100_000);
    }
    expect(index.get(system)?.markdown.length).toBeGreaterThan(100_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
