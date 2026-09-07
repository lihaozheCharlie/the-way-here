import path from "node:path";
import type { PageCategory, VaultConfig } from "@the-way-here/shared";

const SECTION_CATEGORY: Array<[string, PageCategory]> = [
  ["00 ", "home"],
  ["01 ", "personal-lines"],
  ["02 ", "life-stages"],
  ["03 ", "events"],
  ["04 ", "cycles"],
  ["05 ", "relationship-roles"],
  ["06 ", "systems"],
  ["07 ", "entities"],
  ["08 ", "sources"],
  ["09 ", "mental-models"],
  ["11 ", "state"],
  ["12 ", "letters"],
  ["13 ", "quotes"],
  ["99 ", "maintenance"],
];

export function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

export function withoutExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

export function categoryForPath(relativePath: string, config: VaultConfig): PageCategory {
  const normalized = toPosix(relativePath);
  if (!normalized.startsWith(`${config.paths.wiki}/`)) return "sources";
  const section = normalized.slice(config.paths.wiki.length + 1).split("/")[0] || "";
  return SECTION_CATEGORY.find(([prefix]) => section.startsWith(prefix))?.[1] || "other";
}

export function pageIdForPath(relativePath: string, config: VaultConfig): string {
  const normalized = toPosix(relativePath);
  for (const root of [config.paths.wiki, config.paths.sources]) {
    const normalizedRoot = toPosix(root).replace(/\/$/, "");
    if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
      const logicalRoot = path.posix.basename(normalizedRoot);
      return withoutExtension(`${logicalRoot}${normalized.slice(normalizedRoot.length)}`);
    }
  }
  return withoutExtension(normalized);
}
