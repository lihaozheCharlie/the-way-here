import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LettersView, VaultInfo, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { ActiveLibraryProvider } from "./locale";
import { Today } from "../../features/overview/Today";
import { Letters } from "../../features/knowledge/Letters";

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
    .replace(/&#39;/g, "'");
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
});
