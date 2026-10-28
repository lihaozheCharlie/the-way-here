import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, copyFile, link, rm } from "node:fs/promises";
import path from "node:path";
import { stateRootForVault } from "@the-way-here/run-manager";
type Settings = { version: 1; captureDefaultFolder: string; updatedAt: string; source: string; [key: string]: unknown };
/** Protected user configuration, independent of capture history and caches. */
export class CapturePreferencesStore {
  constructor(private root: string) {}
  private file(id: string) { return path.join(stateRootForVault(this.root), "user-preferences", `${createHash("sha256").update(id).digest("hex")}.json`); }
  private async read(id: string): Promise<Settings | undefined> {
    let state;
    try { state = JSON.parse(await readFile(this.file(id), "utf8")); }
    catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
    if (state.version !== 1 || typeof state.captureDefaultFolder !== "string") throw new Error("无法读取保存位置设置，请保留现有配置后重试");
    return state;
  }
  async get(id: string) { return (await this.read(id))?.captureDefaultFolder; }
  async set(id: string, folder: string, source = "user") {
    // Preserve unknown fields; migrations never replace an explicit setting.
    const previous = await this.read(id), file = this.file(id);
    if (source === "legacy-import" && previous) return { defaultFolder: previous.captureDefaultFolder };
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ ...previous, version: 1, captureDefaultFolder: folder, updatedAt: new Date().toISOString(), source }), { mode: 0o600 });
    try {
      if (source === "legacy-import") {
        try { await link(temporary, file); }
        catch (error: any) { if (error.code !== "EEXIST") throw error; }
      } else {
        try { await copyFile(file, file + ".previous"); }
        catch (error: any) { if (error.code !== "ENOENT") throw error; }
        await rename(temporary, file);
      }
    } finally { await rm(temporary, { force: true }); }
    return { defaultFolder: (await this.get(id))! };
  }
}
