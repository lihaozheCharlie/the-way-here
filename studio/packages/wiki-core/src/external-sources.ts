import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { EXTERNAL_SOURCE_FOLDER, type VaultConfig, type WikiPageSummary } from "@the-way-here/shared";

export { EXTERNAL_SOURCE_FOLDER } from "@the-way-here/shared";
export function isExternalSourcePath(relativePath: string, config: VaultConfig): boolean {
  return relativePath.startsWith(`${config.paths.sources}/${EXTERNAL_SOURCE_FOLDER}/`);
}
/** Resolve only registered, read-only references. Never trust a path in arbitrary frontmatter. */
export async function readExternalSource(_root: string, config: VaultConfig, relativePath: string, reference: string): Promise<{ content: string; externalSource: NonNullable<WikiPageSummary["externalSource"]> } | undefined> {
  if (!isExternalSourcePath(relativePath, config)) return undefined;
  let data: any;
  try { data = matter(reference).data.twh_external; } catch { return undefined; }
  if (!data || typeof data.connectionId !== "string" || typeof data.relativePath !== "string") return undefined;
  const connection = config.sourceConnections?.find((item) => item.id === data.connectionId);
  const originalPath = connection ? path.resolve(connection.path, data.relativePath) : "";
  const externalSource: NonNullable<WikiPageSummary["externalSource"]> = { connectionId: data.connectionId, originalPath, status: "unavailable", sha256: data.sha256 };
  const unavailable = () => ({ content: `${reference}\n\n> 原始文件目前不可用；请检查目录连接。此处仅保留来源引用，不代表原文仍然有效。`, externalSource });
  if (!connection || !relativePath.startsWith(`${config.paths.sources}/${EXTERNAL_SOURCE_FOLDER}/${connection.id}/`)
    || path.isAbsolute(data.relativePath) || !originalPath.startsWith(`${connection.path}${path.sep}`)) return unavailable();
  try {
    const [canonicalRoot, canonicalFile] = await Promise.all([realpath(connection.path), realpath(originalPath)]);
    // Reject redirected roots and symlink escapes, including links added after registration.
    if (canonicalRoot !== connection.path || !canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) return unavailable();
    const info = await stat(canonicalFile);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) return unavailable();
    const content = await readFile(canonicalFile, "utf8");
    return { content, externalSource: { ...externalSource, status: "available" } };
  } catch { return unavailable(); }
}
