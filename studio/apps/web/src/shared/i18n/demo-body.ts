import type { AppLocale } from "./locale";
import { demoBodies } from "./demo-body-data";

/** Display-only English markdown for the demo library.
 *
 * The Chinese file stays the save buffer. English is shown only when the file
 * still matches the seeded Chinese fingerprint, so an edit keeps what was saved.
 */

const FNV_OFFSET = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;
const FNV_MASK = 0xffffffffffffffffn;

export function demoPathKey(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized.match(/(?:^|\/)((?:wiki|sources)\/.+)$/)?.[1] ?? normalized.replace(/^\/+/, "");
}

export function demoFingerprint(markdown: string): string {
  const data = new TextEncoder().encode(markdown.replace(/\r\n/g, "\n"));
  let hash = FNV_OFFSET;
  for (const byte of data) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export type DemoBodyLink = { target: string; resolvedId?: string; ambiguous?: boolean };

function rewriteDemoWikilinks(markdown: string, links?: DemoBodyLink[]): string {
  return markdown.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_raw, rawTarget: string, rawLabel?: string) => {
    const target = rawTarget.split("#", 1)[0]!.trim();
    const label = (rawLabel || rawTarget.split("#").at(-1) || target).trim();
    const match = links?.find((link) => link.target === target);
    if (!match?.resolvedId || match.ambiguous) return label;
    const href = match.resolvedId.split("/").map(encodeURIComponent).join("/");
    const fragment = rawTarget.includes("#") ? `#${encodeURIComponent(rawTarget.slice(rawTarget.indexOf("#") + 1).trim())}` : "";
    return `[${label}](/page/${href}${fragment})`;
  });
}

export function demoEnglishDocument(
  libraryId: string | null | undefined,
  locale: AppLocale,
  relativePath: string,
  fileMarkdown: string,
  links?: DemoBodyLink[],
): string | undefined {
  if (locale !== "en" || (libraryId || "").toLowerCase() !== "demo") return undefined;
  const row = demoBodies[demoPathKey(relativePath)];
  if (!row || demoFingerprint(fileMarkdown) !== row.fingerprint) return undefined;
  return rewriteDemoWikilinks(row.markdown, links);
}
