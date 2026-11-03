import { copyFile, lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type CodexAppServer } from "@the-way-here/codex-bridge";
import type { StartAgentExecution } from "./types.js";

export function codexFrozenPermissionProfile(root: string) {
  if (!path.isAbsolute(root) || path.normalize(root) !== root || root === "/") throw new Error("冻结目录必须是独立规范绝对路径");
  const id = "twh-frozen-" + randomUUID().replaceAll("-", "");
  const filesystem = {":root":"deny",":minimal":"read",[root]:"read"};
  const inline = "{" + Object.entries(filesystem).map(([key,value])=>JSON.stringify(key)+"="+JSON.stringify(value)).join(",") + "}";
  return {id,filesystem,args:["-c",`permissions.${id}.filesystem=${inline}`,"-c",`permissions.${id}.network.enabled=false`,"-c",`default_permissions=${JSON.stringify(id)}`]};
}

export async function prepareCodexFrozenScope(input: StartAgentExecution) {
  const evidence = input.knowledgeEvidence;
  if (!evidence || evidence.knowledgeBaseId !== input.config.knowledgeBaseId || !/^[a-f0-9]{64}$/.test(evidence.inputHash)) throw new Error("冻结资料与本轮知识库或版本不一致");
  for (const file of [evidence.file, evidence.reader]) {
    if (!path.isAbsolute(file) || await realpath(file) !== file || !(await lstat(file)).isFile()) throw new Error("冻结资料或公共读取器路径不安全");
  }
  const bytes = await readFile(evidence.file);
  const payload = JSON.parse(bytes.toString("utf8"));
  if (payload.knowledgeBaseId !== evidence.knowledgeBaseId || payload.inputHash !== evidence.inputHash) throw new Error("冻结资料版本已经变化");
  // Prediction directories may contain other state/hashes. Grant only a fresh single-corpus clone.
  const root = await mkdtemp(path.join(path.dirname(evidence.file), ".codex-scope-"));
  try {
    const file = path.join(root, "evidence.json"), reader = path.join(root, "evidence_reader.py");
    await writeFile(file, bytes, {mode:0o600}); await copyFile(evidence.reader, reader);
    return {root,profile:codexFrozenPermissionProfile(root),input:{...input,strictReadOnly:true,mode:"read" as const,images:undefined,knowledgeEvidence:{...evidence,file,reader}},close:()=>rm(root,{recursive:true,force:true})};
  } catch(error) {await rm(root,{recursive:true,force:true});throw error;}
}

/** Detect older servers that accept but silently ignore access, without a model request or private read. */
export async function verifyCodexRestrictedReads(server: CodexAppServer, root: string, permissionProfile: string) {
  const token = "anonymous-codex-access-" + randomUUID(), inside = path.join(root,".access-probe"), outside = path.join(path.dirname(root),".outside-access-probe-"+randomUUID());
  try {
    await writeFile(inside,token,{mode:0o600,flag:"wx"});await writeFile(outside,token,{mode:0o600,flag:"wx"});
    const profiles=await server.request<any>("permissionProfile/list",{cwd:root});
    if(!profiles.data?.some((profile:any)=>profile.id===permissionProfile&&profile.allowed===true)) throw new Error("restricted profile unavailable");
    const allowed=await server.request<any>("command/exec",{command:["/bin/cat",inside],cwd:root,permissionProfile,timeoutMs:5000});
    const denied=await server.request<any>("command/exec",{command:["/bin/cat",outside],cwd:root,permissionProfile,timeoutMs:5000});
    if(allowed.exitCode!==0 || allowed.stdout!==token || denied.exitCode===0 || String(denied.stdout||"").includes(token)) throw new Error("restricted access not enforced");
  } catch { throw new Error("此 Codex 版本未能确认冻结资料的受限读取策略，请更新 Codex 或选择受支持的模型；问题已保留"); }
  finally {await Promise.all([rm(inside,{force:true}),rm(outside,{force:true})]);}
}
