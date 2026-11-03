import { access, rm } from "node:fs/promises";
import { MobileFiles } from "./files.js";

/** Three-way names: an offline change never silently replaces another rename. */
export async function reconcileMobileSpaceIdentity(files:MobileFiles, macName:string, renameMac:(name:string)=>Promise<unknown>):Promise<void> {
  const manifest = await files.manifest();
  if (!manifest || manifest.readOnly) return;
  try { await access(await files.resolve("the-way-here.config.yaml")); } catch { return; }
  const relative = ".mobile/identity-state.json";
  const previous = await files.json(relative) as {knowledgeBaseId?:string; name?:string} | undefined;
  const base = previous?.knowledgeBaseId === manifest.knowledgeBaseId && typeof previous.name === "string" && previous.name.trim().length > 0 && previous.name.length <= 40 ? previous.name : undefined;
  if (macName !== manifest.name) {
    if (!base || macName !== base && manifest.name !== base) {
      await files.writeIfChanged(".mobile/identity-conflict.json",{knowledgeBaseId:manifest.knowledgeBaseId,macName,phoneName:manifest.name,message:base ? "空间名称在两端同时修改。请在 Mac 将名称改为希望保留的手机名称，或在手机改为 Mac 名称后重试。" : "两端空间名称不同，缺少可确认的共同版本。请在 Mac 或手机明确选择保留的名称后重试。"});
      return;
    }
    if (macName === base) await renameMac(manifest.name);
    else { manifest.name = macName; await files.write("mobile-space.json",manifest); }
  }
  await files.writeIfChanged(relative,{knowledgeBaseId:manifest.knowledgeBaseId,name:manifest.name});
  await rm(await files.resolve(".mobile/identity-conflict.json"),{force:true});
}
