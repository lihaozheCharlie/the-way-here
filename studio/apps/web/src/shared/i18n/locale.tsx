import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { enMessages } from "./en-messages";

export type AppLocale = "zh" | "en";
export const DESKTOP_LOCALE_KEY = "desktop.locale";

export function parseLocale(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "zh";
}

export function readStoredLocale(): AppLocale {
  try { return parseLocale(globalThis.localStorage?.getItem(DESKTOP_LOCALE_KEY)); }
  catch { return "zh"; }
}

export function currentLocale(): AppLocale {
  return readStoredLocale();
}

const warned = new Set<string>();

export function translate(locale: AppLocale, message: string, params?: Record<string, string | number | null | undefined>): string {
  if (!message) return message;
  const missing = locale === "en" && !Object.prototype.hasOwnProperty.call(enMessages, message);
  const template = missing || locale !== "en" ? message : enMessages[message]!;
  if (missing && import.meta.env.DEV && !warned.has(message)) {
    warned.add(message);
    console.warn(`[i18n] missing en: ${message}`);
  }
  if (!params) return template;
  return template.replace(/\$\{([^}]+)\}/g, (full, expr: string) => {
    const key = expr.trim();
    if (Object.prototype.hasOwnProperty.call(params, key) && params[key] != null) return String(params[key]);
    return full;
  });
}

function readDesktopString(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; }
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
    try { localStorage.setItem(key, next); } catch { /* The choice stays in memory when storage is unavailable. */ }
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
