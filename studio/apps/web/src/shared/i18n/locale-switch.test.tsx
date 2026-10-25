import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "../../features/desktop/Preferences";
import { demoTitleLabel } from "./demo-overlay";
import { DESKTOP_LOCALE_KEY, readStoredLocale, translate } from "./locale";

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
  });
  vi.stubGlobal("window", {
    location: { search: "" },
    desktop: undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  });
  return store;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("locale switch", () => {
  it("renders preferences in Chinese by default and English after the stored choice", () => {
    installStorage();
    const chinese = renderToStaticMarkup(<Preferences revision={0} />);
    expect(chinese).toContain("偏好设置");
    expect(chinese).toContain("语言");
    expect(chinese).toContain("中文");
    expect(chinese).toContain("English");
    expect(chinese.indexOf("语言")).toBeLessThan(chinese.indexOf("通知"));
    expect(chinese.match(/role="switch"/g)).toHaveLength(1);

    const store = installStorage({ [DESKTOP_LOCALE_KEY]: "en" });
    const english = renderToStaticMarkup(<Preferences revision={0} />);
    expect(english).toContain("Preferences");
    expect(english).toContain("Language");
    expect(english).toContain("General");
    expect(english).toContain("中文");
    expect(english).toContain("English");
    expect(english).toContain("Your own library content is never translated.");
    expect(english).toContain('role="tab"');
    expect(english.match(/role="switch"/g)).toHaveLength(1);
    expect(translate("en", "此刻")).toBe("Now");
    expect(translate("en", "找照片")).toBe("Find photos");
    expect(translate("en", "已有理解")).toBe("Understanding");
    expect(translate("en", "近况回信")).toBe("Recent letters");
    expect(translate("en", "看见未来")).toBe("See ahead");
    expect(demoTitleLabel("demo", "en", "阿宁")).toBe("Aning");
    expect(demoTitleLabel("personal", "en", "阿宁")).toBe("阿宁");

    store.set(DESKTOP_LOCALE_KEY, "zh");
    expect(readStoredLocale()).toBe("zh");
    expect(translate(readStoredLocale(), "此刻")).toBe("此刻");
    expect(renderToStaticMarkup(<Preferences revision={0} />)).toContain("偏好设置");
  });
});
