import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadVaultConfig } from "@the-way-here/wiki-core";
import { stateRootForVault } from "@the-way-here/run-manager";

// Only portable results belong in the shareable file. Execution details stay local.
const portableFields = ["knowledgeBaseId", "status", "inputHash", "reportHash", "generatedAt", "error", "report", "thoughts", "thoughtKind", "inputCleared", "job", "assessment", "assessmentHash", "assessedAt", "scanError", "scanFailed"];
export class PredictionStore {
  constructor(private root: string) {}
  private loads = new Map<string, Promise<any>>();
  async directory(id: string) {
    const config = await loadVaultConfig(this.root, id);
    const dir = path.resolve(this.root, path.dirname(config.paths.wiki), "predictions");
    // Reject symlinks even when they point to another library inside the workspace.
    const relative = path.relative(path.resolve(this.root), dir);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("预测目录超出工作区边界");
    let current = path.resolve(this.root);
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error("预测目录不允许符号链接"); }
      catch (error: any) { if (error.code !== "ENOENT") throw error; }
    }
    return dir;
  }
  private async safeFile(dir: string, name: string) {
    const file = path.join(dir, name);
    try { if ((await lstat(file)).isSymbolicLink()) throw new Error("预测文件不允许符号链接"); }
    catch (error: any) { if (error.code !== "ENOENT") throw error; }
    return file;
  }
  async runtimeDirectory(id: string) {
    const dir = await this.safeFile(await this.directory(id), ".runtime");
    await mkdir(dir, {recursive:true});
    return dir;
  }
  private async read(file: string) {
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch(error: any) { if(error.code === "ENOENT") return undefined; throw error; }
  }
  private async atomic(file: string, state: unknown) {
    await mkdir(path.dirname(file), {recursive:true});
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2) + "\n", {mode:0o600});
    await rename(temp, file);
  }
  async load(id: string): Promise<any> {
    const pending = this.loads.get(id);
    if (pending) return structuredClone(await pending);
    const task = this.loadStored(id);
    this.loads.set(id, task);
    try { return structuredClone(await task); } finally { this.loads.delete(id); }
  }
  private async loadStored(id: string): Promise<any> {
    const dir = await this.directory(id);
    const file = await this.safeFile(dir, "state.json");
    let state = await this.read(file);
    if (!state) {
      const legacy = path.join(stateRootForVault(this.root), "predictions", createHash("sha256").update(id).digest("hex"));
      state = await this.read(path.join(legacy, "state.json"));
      if (!state) return {knowledgeBaseId:id,status:"idle"};
      if (state.knowledgeBaseId !== id) throw new Error("预测数据与知识库不匹配");
      // Preserve old files as a recovery copy; never replace an existing new report.
      const runtime = await this.runtimeDirectory(id);
      try { await copyFile(path.join(legacy, "evidence.json"), await this.safeFile(runtime,"evidence.json")); }
      catch(error:any) { if(error.code !== "ENOENT") throw error; }
      await this.save(state);
    }
    if (state.knowledgeBaseId !== id) throw new Error("预测数据与知识库不匹配");
    const runtimeDir = await this.safeFile(dir,".runtime");
    const runtime = await this.read(await this.safeFile(runtimeDir,"state.json"));
    return runtime && runtime.revision === state.revision ? {...state,...runtime.state} : state;
  }
  async save(state: any) {
    const dir = await this.directory(state.knowledgeBaseId);
    const revision = randomUUID();
    const portable = Object.fromEntries(portableFields.filter(k=>state[k]!==undefined).map(k=>[k,state[k]]));
    const execution = Object.fromEntries(Object.entries(state).filter(([k])=>!portableFields.includes(k) && k!=="revision"));
    const runtime = await this.runtimeDirectory(state.knowledgeBaseId);
    // Commit portable state last; a mismatched interrupted runtime write is ignored.
    await this.atomic(await this.safeFile(runtime,"state.json"), {revision,state:execution});
    await this.atomic(await this.safeFile(dir,"state.json"), {...portable,revision});
  }
}
