import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LettersView, WikiPage, WikiPageSummary, WikiRun } from "@the-way-here/shared";
import { Letters, letterRequestContext, requestPrompt } from "./Letters";
import { LetterLensChoices } from "./LetterLensPicker";

const mocks = vi.hoisted(() => ({ useApi: vi.fn() }));
vi.mock("../../shared/use-api", () => ({ useApi: mocks.useApi }));
vi.mock("../desktop/InspectorContext", () => ({ PageAgentContext: () => null }));

const page: WikiPageSummary = { id: "letter-new", title: "2026-02-20 给自己的信", relativePath: "wiki/letters/new.md", excerpt: "回信列表摘要", tags: [], aliases: [], category: "letters", locations: [], sources: [], modifiedAt: "2026-02-20T00:00:00Z", isSource: false };
const markdown = "# 给自己的信\n\n## 这段时间\n\n原始回信正文。\n\n## 往后\n\n继续记录。";
const document: WikiPage = { ...page, type: "letter", markdown, renderedMarkdown: markdown, properties: {}, sections: [], outgoingLinks: [], incomingLinks: [] };
const themes = ["工作", "家庭", "创作", "关系"].map((title, index) => ({ ...page, id: `theme-${index}`, title, category: "personal-lines" as const }));
const data: LettersView = {
  letters: [
    { page: { ...page, id: "letter-old", title: "较早的回信" }, letterDate: "2024-01-01", themes: [] },
    { page, letterDate: "2026-02-20", themes, evidenceFrom: "2026-01-01", evidenceTo: "2026-02-18" },
  ],
  years: ["2024", "2026"],
  threads: themes.map((theme) => ({ id: theme.id, title: theme.title, letters: [page.id], latestDate: "2026-02-20", category: "personal-lines" })),
};
const version = { id: "version-1", status: "completed", createdAt: "2026-02-21T10:00:00Z", events: [], result: { finalAnswer: "这是新视角的回信正文。" }, outputTarget: { kind: "letter-version", pageId: page.id, lensId: "lens", lensName: "示例", label: "示例视角回信" } } as unknown as WikiRun;
let runs: WikiRun[];
let lettersError: string | undefined;
let runsError: string | undefined;
let view: LettersView;

beforeEach(() => {
  runs = [];
  lettersError = undefined;
  runsError = undefined;
  view = data;
  mocks.useApi.mockImplementation((url: string) => {
    if (url === "/api/views/letters") return { data: lettersError ? undefined : view, loading: false, error: lettersError };
    if (url === "/api/runs") return { data: runs, loading: false, error: runsError };
    if (url === "/api/lenses") return { data: [{ id: "lens", displayName: "示例", attention: "关注证据" }], loading: false };
    return { data: document, loading: false };
  });
});

function render(search = "") {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/letters${search}`]}><Letters revision={0} /></MemoryRouter>);
}

describe("letter reader", () => {
  it("offers one active request entry and builds a scoped, evidence-bound writing request", () => {
    expect(render()).toContain("主动写一封");
    const guided = requestPrompt({ stage: { title: "转折阶段", range: "2025-01 至 2025-03", pageId: "wiki/stage" }, lens: { name: "导师", attention: "未说出口的顾虑" }, focus: "一次决定" });
    expect(guided.prompt).toContain("经历：转折阶段（2025-01 至 2025-03，页面 wiki/stage）");
    expect(requestPrompt({ stage: { title: "刚辞职那段经历" }, lens: { name: "朋友" } }).prompt).toContain("经历：刚辞职那段经历。视角：朋友");
    expect(guided.prompt).toContain("关注点：一次决定");
    expect(guided.prompt).toContain("不虚构经历或心理");
    const automatic = requestPrompt({ stage: { title: "刚辞职那段经历" } });
    expect(automatic.prompt).toContain("视角：未指定，请根据证据和写信 Skill 自动选择");
    expect(requestPrompt({ description: "写一封关于最近变化的信" }).prompt).toContain("如不能确定，先向我澄清");
  });

  it("uses stage relations as retrieval starting points and binds the run to that stage", () => {
    const stage = {
      title: "匿名阶段", range: "2024 至 2025", pageId: "wiki/stage", summary: "阶段摘要",
      related: {
        events: [{ ...page, id: "wiki/event", title: "一次转折" }],
        people: [{ ...page, id: "wiki/person", title: "一位朋友" }],
        places: [{ ...page, id: "wiki/place", title: "一座城市" }],
        systems: [{ ...page, id: "wiki/system", title: "一个项目" }],
        letters: [{ ...page, id: "wiki/letter", title: "旧回信" }],
      },
    };
    const prompt = requestPrompt({ stage }).prompt;
    for (const id of ["wiki/event", "wiki/person", "wiki/place", "wiki/system", "wiki/letter"]) expect(prompt).toContain(`[${id}]`);
    expect(prompt).toContain("不是已核实的写信证据");
    expect(prompt).toContain("仅用于检查重复，不作为独立事实证据");
    expect(letterRequestContext({ stage })).toMatchObject({ scope: "近况回信 · 主动写信", title: "匿名阶段", pageId: "wiki/stage", summary: "阶段摘要" });
    expect(letterRequestContext({ description: "匿名经历" }).pageId).toBeUndefined();
  });

  it("shares the reread lens cards with the active letter composer", () => {
    const cards = renderToStaticMarkup(<LetterLensChoices lenses={[{ id: "lens", displayName: "示例", attention: "关注证据", signals: [], helperUse: "", relativePath: "" }]} onSelect={() => {}} />);
    expect(cards).toContain('class="letter-lens-grid"');
    expect(cards).toContain('class="letter-lens-choice"');
    expect(cards).toContain("关注证据");
    const withAuto = renderToStaticMarkup(<LetterLensChoices lenses={[]} onSelect={() => {}} onAutoSelect={() => {}} autoSelected />);
    expect(withAuto).toContain("自动选择");
    expect(withAuto).toContain('aria-pressed="true"');
  });

  it("shows request progress and labels only letters changed by a completed request", () => {
    runs = [{ ...version, id: "pending", sourceModule: "近况回信", displayPrompt: "主动写一封 · 转折阶段", status: "running", changes: [] }];
    expect(render()).toContain("正在写信：转折阶段");
    runs = [{ ...runs[0]!, status: "completed", changes: [{ path: page.relativePath, kind: "added" }] }];
    const html = render();
    expect(html).toContain("由你请求");
    expect(html).not.toContain("正在写信：转折阶段");
  });
  it("uses the shared record list with title, date and excerpt in descending order", () => {
    const html = render();
    const index = html.slice(html.indexOf('<section class="source-file-pane"'), html.indexOf("</section>"));
    expect(html).toContain('class="timeline-filter"');
    expect(index.indexOf("给自己的信")).toBeLessThan(index.indexOf("较早的回信"));
    expect(index).toContain(page.excerpt);
    expect(index).not.toContain("家庭");
    expect(html).not.toContain("letter-origin-facts");
    expect(html).not.toContain("letter-version-switcher");
    expect(html).not.toContain('aria-label="历史版本"');
    expect(html).toContain("原始回信正文。");
  });

  it("keeps overflow themes accessible and reread explanations closed initially", () => {
    const html = render();
    expect(html).toContain('aria-label="另外 2 个主题"');
    expect(html).toContain("创作");
    expect(html).toContain("关系");
    expect(html).toContain("用新视角重读");
    expect(html).not.toContain("选择重读视角");
  });

  it("defaults to the latest completed version and retains original/version deep links", () => {
    runs = [version, { ...version, id: "version-2", createdAt: "2026-02-22T10:00:00Z", result: { ...version.result!, finalAnswer: "最新正文。" } }];
    expect(render()).toContain("最新正文。");
    expect(render()).toContain('aria-label="历史版本"');
    expect(render()).toContain("查看生成对话");
    expect(render("?letter=letter-new&version=version-1")).toContain("这是新视角的回信正文。");
    expect(render("?letter=letter-new&version=original")).toContain("原始回信正文。");
  });

  it("puts title and provenance before version controls and keeps one tab per perspective", () => {
    runs = [version, { ...version, id: "version-2", createdAt: "2026-02-22T10:00:00Z", result: { ...version.result!, finalAnswer: "最新正文。" } }];
    const html = render();
    expect(html.indexOf('class="editable-document-identity"')).toBeLessThan(html.indexOf('class="letter-version-bar"'));
    expect(html.indexOf('class="letter-provenance"')).toBeLessThan(html.indexOf('class="letter-version-bar"'));
    expect(html.match(/role="tab"/g)).toHaveLength(1);
    expect(html).toContain("示例视角回信");
    expect(html).not.toContain("你正在查看历史版本");
    const history = render("?letter=letter-new&version=version-1");
    expect(history).toContain("你正在查看历史版本");
    expect(history).toContain("回到最新版本");
    expect(history).not.toContain("letter-version-document-meta");
    expect(history).not.toContain("对比两个视角");
  });

  it("honors the selected letter instead of forcing the newest one", () => {
    expect(render("?letter=letter-old")).toContain('dateTime="2024-01-01"');
    expect(render("?letter=letter-old")).not.toContain('class="letter-more-themes"');
  });

  it("uses the standard editor order instead of a letter-only compact layout", () => {
    const html = render();
    expect(html).not.toContain("editable-document-properties-disclosure");
    expect(html).toContain('class="editable-document editable-document--preview has-outline"');
    expect(html.indexOf('class="editable-document-identity')).toBeLessThan(html.indexOf('class="editable-document-body'));
    expect(html).not.toContain('class="document-meta-row"');
    expect(html).not.toContain('class="editable-document-properties"');
    expect(html).toContain("正文，双击后编辑");
    expect(html).not.toContain("展开全部属性");
    expect(html).toContain('role="status"></span>');
  });

  it("uses the file identity and editor shared with life records", () => {
    const html = render();
    expect(html).toContain('class="source-preview"');
    expect(html).toContain('class="source-file-row active"');
    expect(html).toContain('class="document-file-name"');
    expect(html).not.toContain('letter-index');
    expect(html).not.toContain('letter-reading');
    expect(html).not.toContain('embedded-page');
  });

  it("uses the shared document layout and outline for immutable generated versions", () => {
    runs = [{ ...version, result: { ...version.result!, finalAnswer: "# 新视角\n\n## 这段时间\n\n回信内容。\n\n## 往后\n\n后续想法。" } }];
    const html = render();
    expect(html).toContain('class="editable-document editable-document--preview has-outline"');
    expect(html).toContain('class="document-outline');
    expect(html).not.toContain("editable-document-activate");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("双击正文开始修改");
    expect(html).toContain("查看生成对话");
  });

  it("shows empty/error feedback instead of loading forever", () => {
    view = { letters: [], threads: [], years: [] };
    expect(render()).toContain("当前范围暂无回信");
    lettersError = "暂时无法连接";
    expect(render()).toContain("暂时无法连接");
    expect(render()).not.toContain("正在整理回信");
  });

  it("keeps original reading available when version history fails", () => {
    runsError = "历史读取失败";
    expect(render()).toContain("历史版本暂时无法读取");
    expect(render()).toContain("原始回信正文。");
  });
});
