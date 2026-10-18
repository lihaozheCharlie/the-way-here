import { constants } from "node:fs";
import { copyFile, lstat, readFile, unlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WikiPage } from "@the-way-here/shared";
import { pageIdForPath } from "@the-way-here/wiki-core";
import { ContentRequestError } from "./content-error.js";
import type { ContentWorkspace } from "./content-workspace.js";
import { assertSourcePath, sourceDestination, sourceFile } from "./source-access.js";

export async function moveSource(knowledge: ContentWorkspace, input: { pageId?: unknown; folder?: unknown; expectedModifiedAt?: unknown }, onRenamed?: (before: string, after: string) => Promise<void>): Promise<WikiPage> {
  if (typeof input.pageId !== "string" || typeof input.folder !== "string" || !input.folder || typeof input.expectedModifiedAt !== "string") throw new ContentRequestError(400, "请选择文件和目标文件夹");
  if (input.folder.split(/[\\/]/).some(part => part.startsWith(".") || part.endsWith(".assert"))) throw new ContentRequestError(400, "请选择普通文件夹");
  const page = knowledge.index.get(input.pageId);
  if (!page?.isSource) throw new ContentRequestError(404, "生活记录不存在，请刷新后重试");
  if (page.importChannel === "photos" || page.importChannel === "alipay") throw new ContentRequestError(400, "照片和账单记忆请保留在原目录");
  const config = knowledge.index.config;
  const original = await sourceFile(knowledge.vaultRoot, config, page);
  const sourceRoot = page.externalSource ? config.sourceConnections!.find(item => item.id === page.externalSource!.connectionId)!.path : path.resolve(knowledge.vaultRoot, config.paths.sources);
  await assertSourcePath(sourceRoot, original);
  const info = await lstat(original).catch(error => { if (error.code === "ENOENT") throw new ContentRequestError(404, "原文件已移动或删除，请刷新后重试"); throw error; });
  if (!info.isFile() || info.isSymbolicLink()) throw new ContentRequestError(403, "请选择真实文件");
  if (info.mtime.toISOString() !== input.expectedModifiedAt) throw new ContentRequestError(409, "文件已被修改，请刷新后再移动");
  const destination = await sourceDestination(knowledge.vaultRoot, config, input.folder);
  const folderInfo = await lstat(destination.target).catch(error => { if (error.code === "ENOENT") throw new ContentRequestError(404, "目标文件夹已移动或删除，请刷新后重试"); throw error; });
  if (!folderInfo.isDirectory()) throw new ContentRequestError(404, "目标文件夹不存在");
  const target = path.join(destination.target, path.basename(original));
  await assertSourcePath(destination.root, target);
  if (target === original) return page;
  const before = await readFile(original);
  const refresh = async () => { await knowledge.refreshSources?.(config.knowledgeBaseId); await knowledge.index.rebuild(); };
  // Remember resolved links before moving. Preserve their visible words and headings.
  const backlinks = knowledge.index.list().filter(item => item.id !== page.id && !item.externalSource).flatMap(item => {
    const document = knowledge.index.get(item.id);
    const links = document?.outgoingLinks.filter(link => link.resolvedId === page.id) || [];
    return links.length ? [{ relativePath: item.relativePath, links }] : [];
  });
  const edits: Array<{ file: string; before: string; after: string }> = [];
  let storedPath: string | undefined, registered = false, removed = false;
  try {
    // Exclusive copy works across volumes and cannot overwrite a concurrent destination file.
    await copyFile(original, target, constants.COPYFILE_EXCL);
  } catch (error: any) {
    if (error.code === "EEXIST") throw new ContentRequestError(409, "目标文件夹已有同名文件，未覆盖；请先重命名");
    if (["EACCES", "EPERM"].includes(error.code)) throw new ContentRequestError(403, "没有目标目录的写入权限，请重新打开文件夹");
    if (error.code === "ENOSPC") throw new ContentRequestError(507, "磁盘空间不足，原文件已保留");
    throw error;
  }
  try {
    await utimes(target, info.atime, info.mtime);
    if (!(await readFile(original)).equals(before) || !(await readFile(target)).equals(before)) throw new ContentRequestError(409, "文件在移动时发生变化，原文件已保留");
    await refresh();
    const updated = destination.connection
      ? knowledge.index.list({ sources: true }).map(item => knowledge.index.get(item.id)!).find(item => item.externalSource?.status === "available" && item.externalSource.originalPath === target)
      : knowledge.index.get(pageIdForPath(path.relative(knowledge.vaultRoot, target), config));
    if (!updated) throw new ContentRequestError(409, "未能读取移动后的文件，已保留原文件");
    storedPath = updated.relativePath;
    await onRenamed?.(page.relativePath, storedPath); registered = true;
    for (const document of backlinks) {
      const file = path.resolve(knowledge.vaultRoot, document.relativePath);
      const root = [config.paths.wiki, config.paths.sources].map(entry => path.resolve(knowledge.vaultRoot, entry)).find(root => file.startsWith(root + path.sep));
      if (!root) throw new ContentRequestError(403, "关联页面超出知识库范围");
      await assertSourcePath(root, file);
      const text = await readFile(file, "utf8");
      let next = text;
      for (const link of document.links) {
        const rawTarget = link.raw.slice(2, -2).split("|", 1)[0]!;
        const heading = rawTarget.includes("#") ? rawTarget.slice(rawTarget.indexOf("#")) : "";
        const label = link.label || link.target.split("#")[0]!.split("/").at(-1)!;
        next = next.split(link.raw).join(`[[${updated.id}${heading}|${label}]]`);
      }
      if (next !== text) { if (await readFile(file, "utf8") !== text) throw new ContentRequestError(409, "关联页面已变化，请重试"); await writeFile(file, next, "utf8"); edits.push({ file, before: text, after: next }); }
    }
    if (!(await readFile(original)).equals(before)) throw new ContentRequestError(409, "原文件在移动时发生变化，未删除");
    await unlink(original); removed = true;
    await refresh();
    const result = knowledge.index.get(updated.id);
    if (!result) throw new Error("移动后无法重新读取文件");
    knowledge.events.broadcast("index", { at: knowledge.index.lastIndexedAt, knowledgeBaseId: config.knowledgeBaseId, previousPath: page.relativePath, path: result.relativePath });
    return result;
  } catch (error) {
    if (removed) { await copyFile(target, original, constants.COPYFILE_EXCL); await utimes(original, info.atime, info.mtime); }
    for (const edit of edits.reverse()) if (await readFile(edit.file, "utf8") === edit.after) await writeFile(edit.file, edit.before, "utf8");
    if (registered && storedPath) await onRenamed?.(storedPath, page.relativePath);
    if ((await readFile(target)).equals(before)) await unlink(target);
    await refresh();
    throw error;
  }
}
