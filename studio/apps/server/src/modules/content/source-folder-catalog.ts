import { readdir, realpath, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { SourceFolderSummary } from "@the-way-here/shared";
import { sourceDestination } from "./source-access.js";
import type { ContentWorkspace } from "./content-workspace.js";

/** Lists user-visible folders inside the active knowledge base's life-record root. */
export async function listSourceFolders(knowledge: ContentWorkspace): Promise<SourceFolderSummary[]> {
  const sourceRoot = path.resolve(knowledge.vaultRoot, knowledge.index.config.paths.sources);
  const folders: SourceFolderSummary[] = [];

  async function visit(absoluteFolder: string, relativeFolder: string, external = false): Promise<void> {
    let entries;
    try {
      entries = await readdir(absoluteFolder, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    const childFolders = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "外部来源" &&
          !entry.name.endsWith(".assert"),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

    for (const entry of childFolders) {
      const childPath = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name;
      folders.push(external ? { path: childPath, label: entry.name, absolutePath: path.join(absoluteFolder, entry.name), external: true } : { path: childPath });
      await visit(path.join(absoluteFolder, entry.name), childPath, external);
    }
  }

  await visit(sourceRoot, "");
  for (const directory of knowledge.index.config.sourceConnections || []) {
    const id = `外部来源/${directory.id}`;
    folders.push({ path: id, label: directory.name, absolutePath: directory.path, external: true });
    try { if (await realpath(directory.path) === directory.path) await visit(directory.path, id, true); }
    catch (error: any) { if (!["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error; }
  }
  return folders;
}

/** Only reads one directory level. Empty child directories remain visible. */
export async function listSourceFolderChildren(knowledge: ContentWorkspace, parent: string): Promise<SourceFolderSummary[]> {
  const { target, connection } = await sourceDestination(knowledge.vaultRoot, knowledge.index.config, parent);
  const visible = (name: string) => !name.startsWith(".") && !name.endsWith(".assert") && name !== "外部来源";
  const entries = (await readdir(target, { withFileTypes: true })).filter(item => item.isDirectory() && visible(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  const result: SourceFolderSummary[] = await Promise.all(entries.map(async entry => {
    const absolutePath = path.join(target, entry.name);
    // Child contents are read only when expanded; use an expander until then.
    return { path: [parent, entry.name].filter(Boolean).join("/"), label: entry.name, external: Boolean(connection),
      absolutePath: connection ? absolutePath : undefined, hasChildren: true, modifiedAt: (await stat(absolutePath)).mtime.toISOString() };
  }));
  if (!parent) for (const directory of knowledge.index.config.sourceConnections || []) {
    let unavailable = false, modifiedAt: string | undefined;
    try { await access(directory.path, constants.R_OK); unavailable = await realpath(directory.path) !== directory.path || !(await stat(directory.path)).isDirectory(); modifiedAt = (await stat(directory.path)).mtime.toISOString(); }
    catch { unavailable = true; }
    result.push({ path: `外部来源/${directory.id}`, label: directory.name, absolutePath: directory.path, external: true, hasChildren: !unavailable, unavailable, modifiedAt });
  }
  return result;
}
