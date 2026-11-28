import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoragePreferences } from "./StoragePreferences";

const mocks = vi.hoisted(() => ({ useApi: vi.fn() }));
vi.mock("../../shared/use-api", () => ({ useApi: mocks.useApi }));

afterEach(() => vi.unstubAllGlobals());

const size = (sizeBytes: number) => ({ exists: sizeBytes > 0, sizeBytes, fileCount: 3, approximate: false });
const overview = (issues = { conflictFiles: 0, iCloudPlaceholders: 0 }) => ({
  version: 1,
  knowledgeBaseId: "personal",
  knowledgeBase: { id: "personal", name: "个人 Wiki", path: "/Users/anonymous/space/vault/personal", displayPath: "~/space/vault/personal", size: size(2_539_120), issues },
  state: { path: "/Users/anonymous/Library/Application Support/the-way-here/vaults/abc", displayPath: "~/Library/Application Support/the-way-here/vaults/abc", size: size(0) },
  cache: { path: "/Users/anonymous/Library/Application Support/The Way Here/cache", displayPath: "~/Library/Application Support/The Way Here/cache", size: size(240_014) },
});
const render = (data: unknown, error?: string) => {
  mocks.useApi.mockReturnValue({ data, error, loading: !data && !error });
  return renderToStaticMarkup(<StoragePreferences />);
};
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("storage locations in preferences", () => {
  it("shows the active knowledge base only, with home-abbreviated paths and Finder-like sizes", () => {
    vi.stubGlobal("window", {});
    const html = render(overview());
    expect(count(html, 'class="storage-row"')).toBe(3);
    expect(html).toContain("个人 Wiki");
    expect(html).toContain("~/space/vault/personal");
    expect(html).toContain("2.5 MB");
    expect(html).toContain("240 KB");
    expect(html).toContain("暂无内容");
    // Full paths stay available to assistive technology without lengthening the visible line.
    expect(html).toContain('title="/Users/anonymous/space/vault/personal"');
    expect(html).not.toContain("<button");
  });

  it("adds Finder actions and the move entry only when the desktop bridge provides them", () => {
    vi.stubGlobal("window", { desktop: { revealPath: async () => {}, moveStorage: async () => true } });
    const html = render(overview());
    expect(count(html, "<button")).toBe(4);
    expect(html).toContain("aria-label=\"在 Finder 中显示：个人 Wiki\"");
    expect(html).toContain("移动内容位置…");
  });

  it("never offers the move entry in the browser", () => {
    vi.stubGlobal("window", { desktop: { revealPath: async () => {} } });
    const html = render(overview());
    expect(count(html, "<button")).toBe(3);
    expect(html).not.toContain("移动内容位置…");
  });

  it("lists sync notices for conflict copies and undownloaded placeholders", () => {
    vi.stubGlobal("window", {});
    const html = render(overview({ conflictFiles: 1, iCloudPlaceholders: 2 }));
    expect(html).toContain("检测到 1 个同步冲突副本文件");
    expect(html).toContain("有 2 个文件尚未从 iCloud 下载");
    expect(count(html, 'role="status"')).toBe(2);
  });

  it("offers a retry instead of stale rows when the overview cannot be read", () => {
    vi.stubGlobal("window", {});
    const failed = render(undefined, "boom");
    expect(failed).toContain("暂时无法读取存储信息");
    expect(failed).toContain("重试");
    expect(failed).not.toContain('class="storage-row"');
    expect(render(undefined)).toContain("正在读取存储信息");
  });
});
