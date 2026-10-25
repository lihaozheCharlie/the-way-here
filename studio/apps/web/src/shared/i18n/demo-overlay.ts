import type { AppLocale } from "./locale";
import { translate, translateInterpolated, useActiveLibraryId, useI18n } from "./locale";
import { demoEnglishDocument, demoEnglishHeading, demoEnglishSections, demoListExcerpt, type DemoBodyLink } from "./demo-body";
import { demoFolders, demoTagLabel, demoTitles, localizeDemoTitles } from "./demo-titles";

/** Display-only English for the demo library.
 *
 * The Chinese tree on disk stays the source of truth. When the locale is English
 * and the active library id is `demo`, titles and folder segments that still match
 * the Chinese seed are shown in English. A rename no longer matches the seed, so
 * it stays as stored. Nothing here writes to the vault.
 *
 * Titles are provisional stand-ins until a writer title table is supplied.
 * Folder names follow the agreed demo wiki outline.
 */

const demoLibraries: Record<string, string> = {
  "The Way Here 演示 Wiki": "The Way Here demo",
};

export function isDemoLibrary(id?: string | null): boolean {
  return (id || "").toLowerCase() === "demo";
}

/** Display name for a library. The stored id and name stay as written. */
export function demoLibraryLabel(libraryId: string | null | undefined, locale: AppLocale, name: string): string {
  return overlay(libraryId, locale, name, demoLibraries);
}

function overlay(libraryId: string | null | undefined, locale: AppLocale, value: string, table: Record<string, string>): string {
  if (locale !== "en" || !isDemoLibrary(libraryId) || !value) return value;
  return table[value] ?? value;
}

export function demoFolderLabel(libraryId: string | null | undefined, locale: AppLocale, segment: string): string {
  return overlay(libraryId, locale, segment.trim(), demoFolders);
}

/** Exact demo title only. Substring replacement stays on excerpts, where titles are embedded in prose. */
export function demoExactTitleLabel(libraryId: string | null | undefined, locale: AppLocale, title: string): string {
  return overlay(libraryId, locale, title.trim(), demoTitles);
}

export function demoTitleLabel(libraryId: string | null | undefined, locale: AppLocale, title: string): string {
  const trimmed = title.trim();
  const overlaid = overlay(libraryId, locale, trimmed, demoTitles);
  if (overlaid !== trimmed) return overlaid;
  const localized = localizeDemoTitles(libraryId, locale, trimmed);
  if (localized !== trimmed) return localized;
  if (locale === "en" && trimmed === "未命名") return translate(locale, trimmed);
  return translateInterpolated(locale, trimmed);
}

/** Demo seed folders stay Chinese on disk. In English, the demo library shows the seed
 * overlay, and the product capture folder「随手记」shows its catalog name in every library.
 */
export function chromeFolderLabel(libraryId: string | null | undefined, locale: AppLocale, segment: string): string {
  const overlaid = demoFolderLabel(libraryId, locale, segment);
  if (overlaid !== segment.trim()) return overlaid;
  if (locale === "en" && ["随手记", "外部来源", "AI聊天记录", "聊天记录", "消费账单", "知识库"].includes(segment.trim())) return translate(locale, segment.trim());
  const generated = translateInterpolated(locale, segment.trim());
  return generated === segment.trim() ? segment : generated;
}

export function demoFolderPath(libraryId: string | null | undefined, locale: AppLocale, folder: string): string {
  if (!folder || locale !== "en") return folder;
  return folder.split(" / ").map((part) => chromeFolderLabel(libraryId, locale, part)).join(" / ");
}

export function demoFileLabel(libraryId: string | null | undefined, locale: AppLocale, fileName: string): string {
  const match = /^(.*?)(\.(?:md|txt))$/i.exec(fileName);
  const stem = match?.[1] ?? fileName;
  const ext = match?.[2] ?? "";
  const mapped = demoTitleLabel(libraryId, locale, stem);
  if (mapped !== stem) return `${mapped}${ext}`;
  const generated = translateInterpolated(locale, fileName);
  if (generated !== fileName) return generated;
  const folder = chromeFolderLabel(libraryId, locale, stem);
  return folder === stem.trim() ? fileName : `${folder}${ext}`;
}

/** Tooltip path. Folder and file segments use the same display names as the tree and the file list. */
export function demoPathTooltip(libraryId: string | null | undefined, locale: AppLocale, value: string): string {
  if (!value || locale !== "en") return value;
  return value.split("/").map((part) => {
    if (!part) return part;
    if (/\.[A-Za-z0-9]+$/.test(part)) {
      const file = demoFileLabel(libraryId, locale, part);
      if (file !== part) return file;
    }
    return chromeFolderLabel(libraryId, locale, part);
  }).join("/");
}

export function useDemoLabels() {
  const libraryId = useActiveLibraryId();
  const { locale } = useI18n();
  return {
    libraryId,
    locale,
    title: (value: string) => demoTitleLabel(libraryId, locale, value),
    exact: (value: string) => demoExactTitleLabel(libraryId, locale, value),
    folder: (value: string) => chromeFolderLabel(libraryId, locale, value),
    folderPath: (value: string) => demoFolderPath(libraryId, locale, value),
    library: (value: string) => demoLibraryLabel(libraryId, locale, value),
    file: (value: string) => demoFileLabel(libraryId, locale, value),
    excerpt: (relativePath: string, excerpt: string) => demoListExcerpt(libraryId, locale, relativePath, excerpt),
    heading: (relativePath: string, excerpt?: string) => demoEnglishHeading(libraryId, locale, relativePath, excerpt),
    sections: (relativePath: string, excerpt: string) => demoEnglishSections(libraryId, locale, relativePath, excerpt),
    path: (value: string) => demoPathTooltip(libraryId, locale, value),
    tag: (value: string) => demoTagLabel(libraryId, locale, value),
    libraryName: (id: string | null | undefined, name: string) => demoLibraryLabel(id, locale, name),
    englishDocument: (relativePath: string, fileMarkdown: string, links?: DemoBodyLink[]) => demoEnglishDocument(libraryId, locale, relativePath, fileMarkdown, links),
  };
}
