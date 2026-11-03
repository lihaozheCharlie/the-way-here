import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isMobileRelativePath, parseMobileTask, type MobileManifest, type MobileTaskReceipt, type MobileTaskRequest } from "@the-way-here/shared";

export class MobileFiles {
  constructor(readonly root: string) {}
  async resolve(relative: string): Promise<string> {
    if (!isMobileRelativePath(relative)) throw new Error("手机同步路径无效");
    const root = await realpath(this.root), target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw new Error("手机同步路径越界");
    let current = root;
    for (const part of relative.split("/")) {
      current = path.join(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error("手机同步不跟随符号链接"); }
      catch (error: any) { if (error.code !== "ENOENT") throw error; }
    }
    return target;
  }
  async json(relative: string, maxBytes = 2 * 1024 * 1024): Promise<unknown | undefined> {
    const file = await this.resolve(relative);
    try { if ((await lstat(file)).size > maxBytes) throw new Error("手机同步文件过大"); return JSON.parse(await readFile(file, "utf8")); }
    catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
  }
  async write(relative: string, value: unknown, exclusive = false): Promise<void> {
    const file = await this.resolve(relative); await mkdir(path.dirname(file), { recursive: true });
    const text = JSON.stringify(value, null, 2) + "\n";
    if (exclusive) { await writeFile(file, text, { flag: "wx", mode: 0o600 }); return; }
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, text, { flag: "wx", mode: 0o600 }); await rename(temp, file);
  }
  async writeIfChanged(relative: string, value: unknown): Promise<void> {
    const previous = await this.json(relative,32*1024*1024);
    if (JSON.stringify(previous) !== JSON.stringify(value)) await this.write(relative, value);
  }
  async manifest(): Promise<MobileManifest | undefined> {
    const value = await this.json("mobile-space.json") as MobileManifest | undefined;
    if (!value) return undefined;
    if (value.version !== 1 || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.knowledgeBaseId) || !isMobileRelativePath(value.wikiPath) || !isMobileRelativePath(value.sourcesPath) || value.nickname !== undefined && (typeof value.nickname !== "string" || [...value.nickname].length > 40) || typeof value.name !== "string" || !value.name.trim() || [...value.name].length > 40 || [value.sourcesPath,value.wikiPath].some(p => p.split("/").some(part => part.startsWith(".") || ["knowledge-engine","node_modules","mobile-space.json","the-way-here.config.yaml","agents.md"].includes(part.toLowerCase()))) || value.sourcesPath.toLowerCase() === value.wikiPath.toLowerCase() || value.sourcesPath.toLowerCase().startsWith(value.wikiPath.toLowerCase() + "/") || value.wikiPath.toLowerCase().startsWith(value.sourcesPath.toLowerCase() + "/") || typeof value.readOnly !== "boolean") throw new Error("手机空间版本或格式不兼容");
    return value;
  }
  async requests(): Promise<MobileTaskRequest[]> {
    const directory = await this.resolve(".mobile/queue");
    let names: string[];
    try { names = await readdir(directory); } catch (error: any) { if (error.code === "ENOENT") return []; throw error; }
    const requests: MobileTaskRequest[] = [];
    for (const name of names.sort()) {
      if (!/^[a-zA-Z0-9_-]{1,100}\.json$/.test(name)) continue;
      try {
        const task = parseMobileTask(await this.json(`.mobile/queue/${name}`));
        if (task.id + ".json" !== name) throw new Error("任务 ID 与文件名不一致");
        requests.push(task);
      } catch {
        await this.write(`.mobile/rejections/${name}`, { version: 1, id: name.slice(0, -5), message: "此任务文件格式无效，未执行；原文件已保留。", updatedAt: new Date().toISOString() });
      }
    }
    return requests;
  }
  async names(relative: string): Promise<string[]> {
    try { return (await readdir(await this.resolve(relative))).filter(name => /^[a-zA-Z0-9_-]{1,100}\.json$/.test(name)).sort(); }
    catch (error: any) { if (error.code === "ENOENT") return []; throw error; }
  }
  receipt(id: string): Promise<MobileTaskReceipt | undefined> { return this.json(`.mobile/receipts/${id}.json`) as Promise<MobileTaskReceipt | undefined>; }
}
