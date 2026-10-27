import { existsSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WikiPageSummary } from "@the-way-here/shared";
vi.mock("../../shared/use-api", () => ({
  useApi: (url: string) => {
    if (url.startsWith("/api/pages?sources=true")) {
      const pages: WikiPageSummary[] = Array.from({ length: 121 }, (_, index) => ({
        id: `note-${index}`,
        relativePath: `sources/note-${index}.md`,
        title: `记录 ${index}`,
        category: "sources",
        aliases: [],
        tags: [],
        locations: [],
        sources: [],
        excerpt: "中文摘录",
        modifiedAt: "2026-10-11T00:00:00.000Z",
        isSource: true,
      }));
      return { data: pages, loading: false };
    }
    if (url.startsWith("/api/imports") || url.startsWith("/api/sources/folders")) return { data: [], loading: false };
    if (url.startsWith("/api/vault")) return { data: { knowledgeBaseId: "personal", name: "个人库" }, loading: false };
    if (url.startsWith("/api/agent-settings")) return { data: { thirdParty: { apiKeyConfiguredProviders: [] } }, loading: false };
    if (url.startsWith("/api/agent-runtimes")) return { data: [{ id: "codex", available: true }], loading: false };
    if (url.startsWith("/api/agent-provider-presets")) return {
      data: [{ id: "deepseek", displayName: "DeepSeek", models: [{ id: "deepseek-chat", defaultReasoningEffort: "low" }] }],
      loading: false,
    };
    return { data: undefined, loading: false };
  },
}));

import { OrganizedSources } from "./Sources";
import { ModelOnboarding } from "../desktop/ModelOnboarding";

function englishStorage(extra: Record<string, string> = {}) {
  const store = new Map<string, string>([["desktop.locale", "en"], ...Object.entries(extra)]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("English life-record and model chrome", () => {
  it("renders filters, search, import, and show-more in English", () => {
    englishStorage();
    const html = renderToStaticMarkup(<MemoryRouter><OrganizedSources revision={0} /></MemoryRouter>);
    expect(html).toContain("All");
    expect(html).toContain("Notes");
    expect(html).toContain("Chats");
    expect(html).toContain("Photos");
    expect(html).toContain("Bills");
    expect(html).toContain('placeholder="Search titles or text…"');
    expect(html).toContain("Import materials");
    expect(html).not.toContain("Bills import here, grouped by time on this computer.");
    expect(html).not.toContain("You write the story; nothing is sent to a model.");
    expect(html).toContain("Show <b>1</b> more");
    expect(html).not.toContain("导入资料");
    expect(html).not.toContain("继续显示");
    expect(html).not.toContain("搜索标题或内容");
    const toolsStart = html.indexOf('<section class="source-discovery-tools"');
    const toolsEnd = html.indexOf('<div class="source-vault');
    const moreStart = html.indexOf('<button class="source-file-list-more"');
    const moreEnd = html.indexOf("</button>", moreStart) + "</button>".length;
    writeChromeArtifact("life-records", `${html.slice(toolsStart, toolsEnd)}\n${html.slice(moreStart, moreEnd)}`);
  });

  it("renders the dismissed model-setup strip in English", () => {
    englishStorage({ "the-way-here.model-onboarding.dismissed": "true" });
    const html = renderToStaticMarkup(<ModelOnboarding revision={0} initialOpen onOpenPreferences={() => undefined} />);
    expect(html).toContain("No AI model is set up yet, so some features are unavailable");
    expect(html).toContain("Set up");
    expect(html).not.toContain("尚未配置");
    expect(html).not.toContain("去配置");
    writeChromeArtifact("model-onboarding", html);
  });
});

function writeChromeArtifact(name: string, html: string) {
  try {
    if (!existsSync("/opt/cursor/artifacts")) return;
    writeFileSync(`/opt/cursor/artifacts/en-shell-${name}.html`, `<!doctype html><meta charset="utf-8"><title>${name}</title>\n${html}\n`);
  } catch { /* Evidence files are optional outside this agent workspace. */ }
}
