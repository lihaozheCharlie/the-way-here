import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderKeyLink } from "./ModelOnboarding";

afterEach(() => vi.unstubAllGlobals());
const providers = ["deepseek", "zhipu", "qwen", "kimi", "minimax", "openai", "anthropic"];
const links = () => renderToStaticMarkup(<>{providers.map(id => <ProviderKeyLink key={id} providerId={id}>Get {id} key</ProviderKeyLink>)}</>);

describe("API credential acquisition by distribution channel", () => {
  it("does not direct Mac App Store users to any provider's credential console", () => {
    vi.stubGlobal("window", { desktop: { isMacAppStore: true } });
    expect(links()).toBe("");
  });
  it("retains provider links for direct distribution and the web", () => {
    for (const desktop of [{ isMacAppStore: false }, undefined]) {
      vi.stubGlobal("window", { desktop });
      const html = links();
      expect(html.match(/<a /g)).toHaveLength(providers.length);
      expect(html).toContain('href="https://platform.deepseek.com/api_keys"');
      expect(html).toContain('rel="noopener noreferrer"');
    }
  });
  it("never fabricates a destination for an unknown provider", () => {
    vi.stubGlobal("window", {});
    expect(renderToStaticMarkup(<ProviderKeyLink providerId="unknown">Get key</ProviderKeyLink>)).toBe("");
  });
});
