import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { AgentAnswer } from "./AgentAnswer";
import { splitWikiUpdate, wikiUpdateFields } from "./answer-model";

const run = { status: "completed", changes: [], configSnapshot: { paths: { wiki: "demo/wiki" } } } as unknown as WikiRun;
describe("Wiki update disclosure", () => {
  it("keeps the reply visible and the full update closed by default", () => {
    const answer = "先聊眼前这件事。\n\n## Wiki 更新\n### 当前理解\n匿名新线索。\n### 仍然未知\n需要继续观察。";
    const html = renderToStaticMarkup(<MemoryRouter><AgentAnswer answer={answer} run={run} /></MemoryRouter>);
    expect(html).toContain('<details class="agent-wiki-update">');
    expect(html).not.toContain('<details class="agent-wiki-update" open');
    expect(html.indexOf("先聊眼前这件事")).toBeLessThan(html.indexOf('class="agent-wiki-update"'));
    expect(html).toContain("匿名新线索");
    expect(html).toContain("需要继续观察");
    expect(html).toContain("未写入");
  });
  it("uses actual file changes and validation rather than prose claims for status", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AgentAnswer answer="完成了。" run={{ ...run, changes: [{ path: "demo/wiki/note.md", kind: "modified", diff: "+ new" }], validation: [{ command: ["check"], exitCode: 1, output: "failed" }] } as WikiRun} /></MemoryRouter>);
    expect(html).toContain("检查未通过");
    expect(html).toContain("demo/wiki/note.md");
    expect(html).not.toContain("以上内容尚未写入");
  });
  it("does not turn incidental mentions or code samples into hidden attachments", () => {
    const answer = "这里提到了 Wiki 更新，但只是讨论。\n```md\n## Wiki 更新\n示例\n```";
    expect(splitWikiUpdate(answer)).toEqual({ prose: answer });
  });
});

it("keeps a following non-Wiki section in the visible response", () => {
  const result = splitWikiUpdate("回复。\n## Wiki 更新\n### 当前理解\n更新内容。\n## 下一步\n继续交流。");
  expect(result.wiki).toContain("更新内容");
  expect(result.wiki).not.toContain("继续交流");
  expect(result.prose).toContain("继续交流");
});


it("does not create a Wiki artifact for changes confined to source reports", () => {
  const html = renderToStaticMarkup(<MemoryRouter><AgentAnswer answer="报告已保存。" run={{ ...run, changes: [{ path: "demo/sources/journey.md", kind: "modified", diff: "+ report" }] } as WikiRun} /></MemoryRouter>);
  expect(html).not.toContain('class="agent-wiki-update"');
  expect(html).toContain("报告已保存");
  expect(wikiUpdateFields("## Wiki 更新\n\n### 当前理解\n完整内容")).toEqual(["\n### 当前理解\n完整内容"]);
});
