import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { VaultConfig, WikiPage } from "@the-way-here/shared";
import { normalizeSourceFolder } from "../../path-policy.js";
import { ContentRequestError } from "./content-error.js";

const inside = (root: string, target: string) => target === root || target.startsWith(`${root}${path.sep}`);

/** Logical folder IDs are transport identities; every destination resolves to a real directory. */
export async function sourceDestination(workspace: string, config: VaultConfig, folderValue: string) {
  if (typeof folderValue !== "string") throw new ContentRequestError(400, "文件夹路径无效");
  let folder: string;
  try { folder = normalizeSourceFolder(folderValue); }
  catch { throw new ContentRequestError(400, "文件夹路径无效"); }
  const parts = folder.split("/");
  const external = parts[0] === "外部来源";
  const connection = external ? config.sourceConnections?.find(item => item.id === parts[1]) : undefined;
  if (external && !connection) throw new ContentRequestError(403, "请选择已打开的文件夹");
  const root = connection?.path || path.resolve(workspace, config.paths.sources);
  if (connection && await realpath(root) !== root) throw new ContentRequestError(403, "文件夹位置已变化，请重新打开");
  if (!external) {
    await assertSourcePath(workspace, root);
    await mkdir(root, { recursive: true });
  }
  const target = path.resolve(root, external ? parts.slice(2).join("/") : folder);
  await assertSourcePath(root, target);
  return { root, target, connection, folder };
}

export async function sourceFile(workspace: string, config: VaultConfig, page: WikiPage) {
  if (!page.externalSource) return path.resolve(workspace, page.relativePath);
  const connection = config.sourceConnections?.find(item => item.id === page.externalSource!.connectionId);
  if (!connection || page.externalSource.status !== "available") throw new ContentRequestError(404, "原文件不可用，请重新打开文件夹");
  if (await realpath(connection.path) !== connection.path) throw new ContentRequestError(403, "文件夹位置已变化，请重新打开");
  await assertSourcePath(connection.path, page.externalSource.originalPath);
  return page.externalSource.originalPath;
}

export async function assertSourcePath(root: string, target: string): Promise<void> {
  if (!inside(root, target)) throw new ContentRequestError(403, "路径超出文件夹范围");
  const canonicalRoot = await realpath(root);
  let current = root;
  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink() || !inside(canonicalRoot, await realpath(current))) throw new ContentRequestError(403, "不能通过符号链接修改其他目录");
    } catch (error: any) { if (error.code !== "ENOENT") throw error; }
  }
}
