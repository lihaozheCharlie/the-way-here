import { afterEach, expect, it, vi } from "vitest";
import { readPreference, writePreference } from "./preference-storage";
afterEach(() => vi.unstubAllGlobals());
it("imports an existing browser choice once and keeps the persisted value after an origin change", () => {
  const persistent = new Map<string, string>();
  let browser = new Map([["desktop.notifications", "false"]]);
  const write = vi.fn((key: string, value: string, source: string) => {
    if (source !== "legacy-import" || !persistent.has(key)) persistent.set(key, value);
    return persistent.get(key)!;
  });
  vi.stubGlobal("window", { desktop: { readPreference: (key: string) => persistent.get(key) ?? null, writePreference: write } });
  vi.stubGlobal("localStorage", { getItem: (key: string) => browser.get(key) ?? null, setItem: (key: string, value: string) => browser.set(key, value) });
  expect(readPreference("desktop.notifications")).toBe("false");
  expect(write).toHaveBeenCalledWith("desktop.notifications", "false", "legacy-import");
  browser = new Map(); // New Chromium origin after an app/runtime upgrade.
  expect(readPreference("desktop.notifications")).toBe("false");
  expect(readPreference("desktop.locale")).toBeNull();
  expect(write).toHaveBeenCalledTimes(1); // Reading a fallback never seeds defaults.
  writePreference("desktop.notifications", "true");
  expect(persistent.get("desktop.notifications")).toBe("true");
});
it("keeps browser-only behavior and does not acknowledge failed native writes", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => "en", setItem });
  vi.stubGlobal("window", {});
  expect(readPreference("desktop.locale")).toBe("en");
  writePreference("desktop.locale", "zh");
  expect(setItem).toHaveBeenCalledWith("desktop.locale", "zh");
  setItem.mockClear();
  vi.stubGlobal("window", { desktop: { writePreference: () => { throw new Error("disk unavailable"); } } });
  expect(() => writePreference("desktop.locale", "zh")).toThrow("disk unavailable");
  expect(setItem).not.toHaveBeenCalled();
});
