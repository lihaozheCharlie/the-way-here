/** Page id for a wiki-root change, using the same logical root as the index. */
export function wikiPageIdFromChange(changePath: string, wikiRoot: string | undefined): string | undefined {
  if (!wikiRoot) return undefined;
  const normalized = changePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const root = wikiRoot.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!root || (normalized !== root && !normalized.startsWith(`${root}/`))) return undefined;
  const logical = root.split("/").filter(Boolean).at(-1);
  if (!logical) return undefined;
  return `${logical}${normalized.slice(root.length)}`.replace(/\.md$/i, "");
}
