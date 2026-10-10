import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { SourceFolderSummary } from "@the-way-here/shared";
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
