import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LettersView, ReasoningLens, VaultInfo, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { ActiveLibraryProvider } from "./locale";
import { Today } from "../../features/overview/Today";
import { Letters } from "../../features/knowledge/Letters";
import { LetterLensChoices } from "../../features/knowledge/LetterLensPicker";
import { FileBrowserItem } from "../FileBrowser";
import { FileMenu } from "../FileMenu";
import { demoSeedExcerpts } from "./demo-excerpt-data";
import { TagSummary } from "../../features/knowledge/UnderstandingDigest";
import { SearchResults } from "../../features/knowledge/SearchResults";
import { SourceKnowledgeConnections } from "../../features/sources/Sources";
import { LetterLensPicker } from "../../features/knowledge/LetterLensPicker";
import { AiConfiguration } from "../../features/collaboration/AgentSettings";

const mocks = vi.hoisted(() => ({ useApi: vi.fn() }));
vi.mock("../../shared/use-api", () => ({ useApi: mocks.useApi }));
vi.mock("../../features/desktop/InspectorContext", () => ({ PageAgentContext: () => null }));

const storage = new Map<string, string>();
const localStorageStub: Storage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, value); },
  removeItem: (key) => { storage.delete(key); },
  clear: () => { storage.clear(); },
  key: (index) => [...storage.keys()][index] ?? null,
  get length() { return storage.size; },
};

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;

function chromeText(html: string): string {
  const decoded = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
  const attrs = [...decoded.matchAll(/\b(?:aria-label|title|placeholder|aria-description)="([^"]*)"/g)].map((match) => match[1] ?? "");
  const text = decoded.replace(/<[^>]+>/g, " ");
  return `${text}\n${attrs.join("\n")}`.replace(/【[^】]*】/g, "");
}

const page: WikiPageSummary = {
  id: "letter-new",
  title: "A letter to myself",
  relativePath: "wiki/letters/a-letter-to-myself.md",
  excerpt: "A short summary",
  tags: [],
  aliases: [],
  category: "letters",
  locations: [],
  sources: [],
  modifiedAt: "2026-02-20T00:00:00Z",
  isSource: false,
};
const markdown = "# A letter\n\nThe body stays in English.\n\nA seeded aside 【中文片段】 stays inside brackets.\n\n## Later\n\nKeep going.";
const documentPage: WikiPage = { ...page, type: "letter", markdown, renderedMarkdown: markdown, properties: {}, sections: [], outgoingLinks: [], incomingLinks: [] };
const themes = ["Work", "Home"].map((title, index) => ({ ...page, id: `theme-${index}`, title, category: "personal-lines" as const }));
const letters: LettersView = {
  letters: [{ page, letterDate: "2026-02-20", themes, evidenceFrom: "2026-01-01", evidenceTo: "2026-02-18" }],
  years: ["2026"],
  threads: themes.map((theme) => ({ id: theme.id, title: theme.title, letters: [page.id], latestDate: "2026-02-20", category: "personal-lines" })),
};
const vault = {
  name: "The Way Here 演示 Wiki",
  root: "/demo",
  knowledgeBaseId: "demo",
  knowledgeBases: [{ id: "demo", name: "The Way Here 演示 Wiki" }],
  adapter: "local",
  pageCount: 1,
  sourceCount: 1,
  lastIndexedAt: "2026-02-20T00:00:00Z",
  categories: {},
  agentAvailable: false,
  runtimes: [],
  companionshipStartedAt: "2024-01-01T00:00:00.000Z",
} as VaultInfo;

beforeEach(() => {
  storage.clear();
  storage.set("desktop.locale", "en");
  Object.defineProperty(globalThis, "localStorage", { value: localStorageStub, configurable: true });
  mocks.useApi.mockImplementation((url: string) => {
    if (url === "/api/vault") return { data: vault, loading: false };
    if (url === "/api/views/letters") return { data: letters, loading: false };
    if (url === "/api/runs") return { data: [], loading: false };
    if (url === "/api/lenses") return { data: [{ id: "lens", displayName: "Example", attention: "Evidence", signals: [], helperUse: "", relativePath: "lenses/example.md" }], loading: false };
    if (url === "/api/views/life-map") return { data: { stages: [] }, loading: false };
    if (url.startsWith("/api/pages/")) return { data: documentPage, loading: false };
    return { data: undefined, loading: false };
  });
});

function renderNow() {
  return renderToStaticMarkup(<MemoryRouter><ActiveLibraryProvider id="demo"><Today revision={0} /></ActiveLibraryProvider></MemoryRouter>);
}

function renderLetters() {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/letters"]}><ActiveLibraryProvider id="demo"><Letters revision={0} /></ActiveLibraryProvider></MemoryRouter>);
}

describe("English chrome", () => {
  it("renders Now without Chinese in visible text or accessible names", () => {
    const html = renderNow();
    expect(html).toContain("Say it");
    expect(html).toContain("Quick note");
    expect(html).toContain("Speak a note");
    expect(chromeText(html)).not.toMatch(CJK);
  });

  it("renders Letters without Chinese chrome, aside from bracketed demo content", () => {
    const html = renderLetters();
    expect(html).toContain("Write one now");
    expect(html).toContain("Reread with a new lens");
    expect(html).toContain("【中文片段】");
    expect(chromeText(html)).not.toMatch(CJK);
  });

  it("translates the eight reasoning lenses", () => {
    const lenses: ReasoningLens[] = [
      ["albert-einstein", "阿尔伯特·爱因斯坦", "默认参照系、隐藏假设、关系和惊奇", "提出一个新的参照位置或隐藏假设", ["抽象问题", "学习"]],
      ["elon-musk", "埃隆·马斯克", "底层约束、关键瓶颈和验证速度", "指出一个底层约束、瓶颈或可验证台阶", ["技术研发"]],
      ["charlie-munger", "查理·芒格", "机制、激励、重复模式和可避免的大错", "校验一个机制盲点、反例或严重下行", ["复杂决策"]],
      ["richard-feynman", "理查德·费曼", "证据、真正理解、自我欺骗和诚实未知", "校验一个证据跳跃、竞争解释或可验证问题", ["研究"]],
      ["steve-jobs", "史蒂夫·乔布斯", "真正重要的体验、专注、取舍和有限生命", "确认一项核心体验、必要取舍或应删除的支线", ["产品"]],
      ["warren-buffett", "沃伦·巴菲特", "长期承担者、信任、复利和不可逆损失", "校验一个长期承担、不可逆损失或现实底盘问题", ["金钱"]],
      ["benjamin-franklin", "本杰明·富兰克林", "价值怎样进入日常、人与人怎样共同改进", "把一个价值判断落到日常证据或低负担实验", ["习惯"]],
      ["yanni", "雅尼", "场景里的感受、内在声音、并存情绪和非功利价值", "补充被遗漏的感受、非功利价值或创作自由", ["音乐"]],
    ].map(([id, displayName, attention, helperUse, signals]) => ({ id, displayName, attention, helperUse, signals, relativePath: `lenses/${id}.md` })) as ReasoningLens[];
    const html = renderToStaticMarkup(<LetterLensChoices lenses={lenses} onSelect={() => undefined} />);
    expect(html).toContain("Albert Einstein");
    expect(html).toContain("Elon Musk");
    expect(html).toContain("Charlie Munger");
    expect(html).toContain("Richard Feynman");
    expect(html).toContain("Steve Jobs");
    expect(html).toContain("Warren Buffett");
    expect(html).toContain("Benjamin Franklin");
    expect(html).toContain("Yanni");
    expect(html).toContain("Default frames of reference");
    expect(chromeText(html)).not.toMatch(CJK);
  });

  it("overlays demo letter titles, excerpts, and the file-actions name", () => {
    const relativePath = "wiki/12 近况对话/2026-09-20 芒格视角：别让掌声替你决定投入.md";
    const excerpt = demoSeedExcerpts[relativePath]!;
    const title = "2026-09-20 芒格视角：别让掌声替你决定投入";
    const html = renderToStaticMarkup(<MemoryRouter><ActiveLibraryProvider id="demo"><FileBrowserItem page={{ title, relativePath, excerpt }} active={false} onSelect={() => undefined} actions={<FileMenu page={{ id: "wiki/12 近况对话/2026-09-20 芒格视角：别让掌声替你决定投入", title, relativePath, excerpt }} />} /></ActiveLibraryProvider></MemoryRouter>);
    const text = chromeText(html);
    expect(text).toContain("Munger lens: don't let applause decide what you invest in");
    expect(text).toContain("You brought the work out to share");
    expect(text).toContain("More actions: Munger lens: don't let applause decide what you invest in");
    expect(text).not.toMatch(CJK);
  });

  it("overlays demo life-record excerpts", () => {
    const relativePath = "sources/照片记忆/一张新城市餐桌的照片.md";
    const excerpt = demoSeedExcerpts[relativePath]!;
    const title = "一张新城市餐桌的照片";
    const html = renderToStaticMarkup(<MemoryRouter><ActiveLibraryProvider id="demo"><FileBrowserItem page={{ title, relativePath, excerpt }} active={false} onSelect={() => undefined} actions={<FileMenu page={{ id: relativePath.replace(/\.md$/, ""), title, relativePath, excerpt }} />} /></ActiveLibraryProvider></MemoryRouter>);
    const text = chromeText(html);
    expect(text).toContain("A photo of a table in a new city · fictional demo");
    expect(text).toContain("This is a fully fictional demo photo memory.");
    expect(text).toContain("More actions: A photo of a table in a new city · fictional demo");
    expect(text).not.toMatch(CJK);
  });

  it("renders the reread lens menu in English", () => {
    const lens = { id: "charlie-munger", displayName: "查理·芒格", attention: "机制、激励、重复模式和可避免的大错", helperUse: "校验一个机制盲点、反例或严重下行", signals: ["复杂决策"], relativePath: "lenses/charlie-munger.md" } as ReasoningLens;
    const html = renderToStaticMarkup(<LetterLensPicker lenses={[lens]} onSelect={() => undefined} />);
    expect(html).toContain("Reread with a new lens");
    expect(chromeText(html)).not.toMatch(CJK);
  });

  it("translates digest tags and search excerpts from demo payloads", () => {
    const tags = renderToStaticMarkup(<ActiveLibraryProvider id="demo"><TagSummary tags={["wiki/个人主线", "主线/从证明自己到建设选择权", "来源/wiki", "类型/wiki", "循环/立志中断后又重新开始", "系统/家庭系统", "思维模型/把评价当信息，不当判决"]} /></ActiveLibraryProvider>);
    expect(chromeText(tags)).toContain("Wiki/Personal thread");
    expect(chromeText(tags)).toContain("System/Family system");
    expect(chromeText(tags)).not.toMatch(CJK);
    const relativePath = "sources/照片记忆/一张新城市餐桌的照片.md";
    const page = { id: "photo", title: "一张新城市餐桌的照片", relativePath, excerpt: demoSeedExcerpts[relativePath]!, isSource: true, category: "sources", tags: [], aliases: [], locations: [], sources: [], modifiedAt: "2026-03-12T00:00:00Z" } as WikiPageSummary;
    mocks.useApi.mockImplementation((url: string) => {
      if (url.startsWith("/api/search")) return { data: [page], loading: false };
      return { data: undefined, loading: false };
    });
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/search?q=photo"]}><ActiveLibraryProvider id="demo"><SearchResults revision={0} /></ActiveLibraryProvider></MemoryRouter>);
    const text = chromeText(html);
    expect(text).toContain("sources/Photo memories/A photo of a table in the new city.md");
    expect(text).toContain("fictional demo");
    expect(text).not.toMatch(CJK);
  });

  it("renders the life-record related panel and the runtime warning in English", () => {
    const relativePath = "wiki/07 人物与城市/生活过的城市/杭州.md";
    const related = { id: relativePath.replace(/\.md$/, ""), title: "杭州：职业机会与日常生活", relativePath, excerpt: demoSeedExcerpts[relativePath]!, category: "entities", tags: ["实体/杭州"], aliases: [], locations: [], sources: [], modifiedAt: "2026-03-12T00:00:00Z", isSource: false } as WikiPageSummary;
    const source = { id: "photo", title: "照片", relativePath: "sources/照片记忆/一张新城市餐桌的照片.md", excerpt: "", category: "sources", tags: [], aliases: [], locations: [], sources: [], modifiedAt: "2026-03-12T00:00:00Z", isSource: true, markdown: "", renderedMarkdown: "", properties: {}, sections: [], outgoingLinks: [], incomingLinks: [], relatedPages: [related] } satisfies WikiPage;
    const html = renderToStaticMarkup(<MemoryRouter><ActiveLibraryProvider id="demo"><SourceKnowledgeConnections page={source} /></ActiveLibraryProvider></MemoryRouter>);
    const text = chromeText(html);
    expect(text).toContain("Hangzhou: career chances and everyday life");
    expect(text).toContain("Hangzhou first meant a new platform");
    expect(text).not.toMatch(CJK);
    const settings = renderToStaticMarkup(<AiConfiguration id="models" agent={{ draft: { runtimeId: "codex", codex: { model: "gpt", effort: "low" }, thirdParty: {} }, loading: false, codexRuntime: { available: false, reason: "运行时未启用", models: [] }, codexModels: [{ id: "gpt", displayName: "GPT" }], codexEfforts: ["low"], selectRuntime: () => undefined, selectCodexModel: () => undefined, setCodexEffort: () => undefined } as never} />);
    expect(chromeText(settings)).toContain("The runtime isn’t enabled");
    expect(chromeText(settings)).not.toMatch(CJK);
  });
});
