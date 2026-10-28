import { readPreference, writePreference } from "../preference-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { enMessages } from "./en-messages";

export type AppLocale = "zh" | "en";
export const DESKTOP_LOCALE_KEY = "desktop.locale";

export function parseLocale(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "zh";
}

export function readStoredLocale(): AppLocale {
  try { return parseLocale(readPreference(DESKTOP_LOCALE_KEY)); }
  catch { return "zh"; }
}

export function currentLocale(): AppLocale {
  return readStoredLocale();
}

/** Chinese source string in, locale string out. Safe to call during render; AppShell subscribes to locale changes. */
export function tr(message: string, params?: Record<string, string | number | null | undefined>): string {
  return translate(currentLocale(), message, params);
}

const warned = new Set<string>();
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;

type CompiledTemplate = { key: string; english: string; re: RegExp; names: string[]; staticLength: number };
let compiledTemplates: CompiledTemplate[] | undefined;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fill(template: string, params?: Record<string, string | number | null | undefined>): string {
  if (!params) return template;
  return template.replace(/\$\{([^}]+)\}/g, (full, expr: string) => {
    const key = expr.trim();
    if (Object.prototype.hasOwnProperty.call(params, key) && params[key] != null) return String(params[key]);
    return full;
  });
}

/** Match a fully interpolated Chinese string against catalog templates such as `文件路径无效：${path}`. */
function matchTemplate(message: string): string | undefined {
  if (!CJK.test(message)) return undefined;
  if (!compiledTemplates) {
    compiledTemplates = [];
    for (const [key, english] of Object.entries(enMessages)) {
      if (!key.includes("${")) continue;
      const names: string[] = [];
      let pattern = "^";
      let staticText = "";
      const placeholder = /\$\{([^}]+)\}/g;
      let last = 0;
      let found: RegExpExecArray | null;
      while ((found = placeholder.exec(key))) {
        const staticPart = key.slice(last, found.index);
        staticText += staticPart;
        pattern += escapeRegExp(staticPart) + "([\\s\\S]+?)";
        names.push(found[1]!.trim());
        last = found.index + found[0].length;
      }
      staticText += key.slice(last);
      pattern += escapeRegExp(key.slice(last)) + "$";
      if (!CJK.test(staticText)) continue;
      compiledTemplates.push({ key, english, re: new RegExp(pattern), names, staticLength: staticText.length });
    }
    compiledTemplates.sort((a, b) => b.staticLength - a.staticLength);
  }
  for (const item of compiledTemplates) {
    const found = item.re.exec(message);
    if (!found) continue;
    const params: Record<string, string> = {};
    item.names.forEach((name, index) => {
      const captured = found[index + 1] ?? "";
      params[name] = Object.prototype.hasOwnProperty.call(enMessages, captured) && !enMessages[captured]!.includes("${") ? enMessages[captured]! : captured;
    });
    return fill(item.english, params);
  }
  return undefined;
}

/** Translate a finished Chinese sentence when it matches a catalog template. Exact UI keys are left untouched. */
export function translateInterpolated(locale: AppLocale, message: string): string {
  if (locale !== "en" || !message) return message;
  return matchTemplate(message) ?? message;
}

export function translate(locale: AppLocale, message: string, params?: Record<string, string | number | null | undefined>): string {
  if (!message) return message;
  const known = locale === "en" && Object.prototype.hasOwnProperty.call(enMessages, message);
  if (known) return fill(enMessages[message]!, params);
  if (locale === "en") {
    const matched = !params ? matchTemplate(message) : undefined;
    if (matched) return matched;
  }
  if (locale === "en" && import.meta.env.DEV && !warned.has(message)) {
    warned.add(message);
    console.warn(`[i18n] missing en: ${message}`);
  }
  return fill(message, params);
}

export function uiDateLocale(locale: AppLocale = currentLocale()): string {
  return locale === "en" ? "en" : "zh-CN";
}

function readDesktopString(key: string): string | null {
  try { return readPreference(key) ?? null; }
  catch { return null; }
}

function useDesktopStringPreference(key: string, fallback: string) {
  const read = () => { const value = readDesktopString(key); return value === null ? fallback : value; };
  const [value, setValue] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setValue(read());
    window.addEventListener("storage", refresh);
    window.addEventListener("desktop-preference", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("desktop-preference", refresh); };
  }, [key, fallback]);
  const update = (next: string) => {
    try { writePreference(key, next); } catch { /* The choice stays in memory when storage is unavailable. */ }
    setValue(next);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("desktop-preference"));
  };
  return [value, update] as const;
}

export function useDesktopLocale(): [AppLocale, (next: AppLocale) => void] {
  const [value, setValue] = useDesktopStringPreference(DESKTOP_LOCALE_KEY, "zh");
  return [parseLocale(value), (next) => setValue(next)];
}

export function useI18n() {
  const [locale, setLocale] = useDesktopLocale();
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    void window.desktop?.setLocale?.(locale);
  }, [locale]);
  return {
    locale,
    setLocale,
    t: (message: string, params?: Record<string, string | number | null | undefined>) => translate(locale, message, params),
  };
}

const ActiveLibraryContext = createContext<string | null>(null);

export function ActiveLibraryProvider({ id, children }: { id?: string | null; children: ReactNode }) {
  return <ActiveLibraryContext.Provider value={id ?? null}>{children}</ActiveLibraryContext.Provider>;
}

export function useActiveLibraryId(): string | null {
  return useContext(ActiveLibraryContext);
}
