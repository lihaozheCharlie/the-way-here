import type { AppLocale } from "./locale";
import { useActiveLibraryId, useI18n } from "./locale";
import { demoJsonStrings } from "./demo-json-data";

/** Display-only English for seeded demo JSON.
 *
 * Keyed by the vault path (`predictions/state.json`, photo `memory.json`,
 * `generation.json`) and a JSONPath. A string is replaced only when it still
 * equals the Chinese seed, so an edited value stays as stored. Callers must
 * not write the result back to disk — paths such as `$.reportPath` are display
 * copy, not a file location.
 */

export function demoJsonKey(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.match(/(?:^|\/)((?:predictions|sources)\/.+)$/)?.[1] ?? normalized.replace(/^\/+/, "");
}

export function demoJsonText(
  libraryId: string | null | undefined,
  locale: AppLocale,
  filePath: string,
  jsonPath: string,
  value: string,
): string {
  if (locale !== "en" || (libraryId || "").toLowerCase() !== "demo" || !value) return value;
  const row = demoJsonStrings[demoJsonKey(filePath)]?.[jsonPath];
  return row && row.seed === value ? row.en : value;
}

export function overlayDemoJson<T>(libraryId: string | null | undefined, locale: AppLocale, filePath: string, value: T, prefix = "$"): T {
  if (locale !== "en" || (libraryId || "").toLowerCase() !== "demo" || value == null || typeof value !== "object") return value;
  const table = demoJsonStrings[demoJsonKey(filePath)];
  if (!table) return value;
  return walk(value, prefix, table) as T;
}

function walk(value: unknown, path: string, table: Record<string, { seed: string; en: string }>): unknown {
  if (typeof value === "string") {
    const row = table[path];
    return row && row.seed === value ? row.en : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}[${index}]`, table));
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) copy[key] = walk(child, `${path}.${key}`, table);
    return copy;
  }
  return value;
}

export function useDemoJsonText() {
  const libraryId = useActiveLibraryId();
  const { locale } = useI18n();
  return (filePath: string, jsonPath: string, value: string) => demoJsonText(libraryId, locale, filePath, jsonPath, value);
}
