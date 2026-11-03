import { readFile } from "node:fs/promises";
import type { WikiIndex } from "@the-way-here/wiki-core";
import { listBuildSkills } from "../skills/skill-catalog.js";
import { listReasoningLenses } from "../skills/lens-catalog.js";
import { stateRootForVault } from "@the-way-here/run-manager";
import type { VaultConfig } from "@the-way-here/shared";
import { MobileFiles } from "./files.js";
import type { resolveLetterScope } from "./letter-scope.js";

export async function freezeMobileScope(root: string, id: string, scope: ReturnType<typeof resolveLetterScope>) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("手机来源快照编号无效");
  const files = new MobileFiles(stateRootForVault(root));
  await files.write(`mobile-scopes/${id}/evidence.json`, {
    knowledgeBaseId:scope.knowledgeBaseId,inputHash:scope.hash,scope:scope.scope,frozenAt:scope.frozenAt,
    catalogue:scope.documents.map(p => ({pageId:p.path,title:p.title,category:"sources",isSource:true})),
    pages:scope.documents.map(p => ({pageId:p.path,category:"sources",markdown:p.markdown})),
  }, true);
  return {id,hash:scope.hash};
}
export async function resolveMobileEvidence(root:string, config:VaultConfig, reference?:{id:string;hash:string}, bundledReader?:()=>string) {
  if (!reference) return undefined;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(reference.id) || !/^[a-f0-9]{64}$/.test(reference.hash)) throw new Error("冻结来源引用无效");
  const files = new MobileFiles(stateRootForVault(root)), relative = `mobile-scopes/${reference.id}/evidence.json`;
  const payload = await files.json(relative) as {knowledgeBaseId?:string;inputHash?:string};
  if (payload?.knowledgeBaseId !== config.knowledgeBaseId || payload.inputHash !== reference.hash) throw new Error("冻结来源与本轮知识库或版本不一致");
  const reader = bundledReader ? bundledReader() : await new MobileFiles(root).resolve(`${config.paths.skills}/common/retrieval/scripts/evidence_reader.py`);
  return {file:await files.resolve(relative),reader,knowledgeBaseId:config.knowledgeBaseId,inputHash:reference.hash};
}

export async function mobileLetterRules(root:string,index:WikiIndex,selected:string) {
  const files = new MobileFiles(root), catalog = await listBuildSkills(root,index);
  const chosen = catalog.filter(skill => skill.id === "build-companion-reflection" || skill.id === "common-reasoning-lenses");
  if (!chosen.some(skill => skill.id === "build-companion-reflection")) throw new Error("共享回信规则尚未准备，请在Mac更新知识引擎。" );
  const parts = await Promise.all(chosen.map(async skill => readFile(await files.resolve(skill.relativePath),"utf8")));
  if (selected !== "auto") {
    const lens = (await listReasoningLenses(root,index)).find(lens=>lens.id===selected);
    if (!lens) throw new Error("所选回信视角已改变，请重新选择。" );
    parts.push(await readFile(await files.resolve(lens.relativePath),"utf8"));
  }
  return parts.join("\n\n");
}
