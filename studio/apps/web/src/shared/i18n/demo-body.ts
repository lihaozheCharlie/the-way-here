import type { AppLocale } from "./locale";
import { demoBodies } from "./demo-body-data";
import { demoSeedExcerpts } from "./demo-excerpt-data";

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

/** Same opening excerpt the indexer stores: frontmatter off, first heading removed, 260 chars. */
export function demoExcerptFromMarkdown(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const fenced = /^---\n[\s\S]*?\n---\n?/.exec(normalized);
  const body = (fenced ? normalized.slice(fenced[0].length) : normalized).trim().replace(/^#\s+.+$/m, "");
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => label || target)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

/** List excerpt for a fingerprinted demo file. Personal libraries and edited openings stay as stored. */
export function demoListExcerpt(
  libraryId: string | null | undefined,
  locale: AppLocale,
  relativePath: string,
  excerpt: string,
): string {
  if (locale !== "en" || (libraryId || "").toLowerCase() !== "demo" || !excerpt) return excerpt;
  const key = demoPathKey(relativePath);
  const row = demoBodies[key];
  if (!row || demoSeedExcerpts[key] !== excerpt) return excerpt;
  return demoExcerptFromMarkdown(row.markdown).replace(/ +([.,;:!?，。；：！？])/g, "$1");
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
