import { copyFile, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WikiIndex, createEvidenceSnapshot, parseRetrievalPolicy } from "../../../../../studio/packages/wiki-core/src/index.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir,"../../../../..");
const id = process.env.THE_WAY_HERE_KNOWLEDGE_BASE;
if (!id) throw new Error("显式设置 THE_WAY_HERE_KNOWLEDGE_BASE，整个任务沿用同一个 ID");
const index = new WikiIndex(root,id);
await index.rebuild();
const policy = parseRetrievalPolicy(JSON.parse(await readFile(path.join(scriptDir,"../references/source-policy.json"),"utf8")));
const snapshot = createEvidenceSnapshot(id,index.list().map(p=>index.get(p.id)!),policy);
const directory = await mkdtemp(path.join(tmpdir(),"twh-retrieval-"));
const file = path.join(directory,"evidence.json");
const reader = path.join(directory,"evidence_reader.py");
try {
  await writeFile(file,JSON.stringify(snapshot),{mode:0o600});
  await copyFile(path.join(scriptDir,"evidence_reader.py"),reader);
} catch(error) { await rm(directory,{recursive:true,force:true}); throw error; }
console.log(JSON.stringify({knowledgeBaseId:id,inputHash:snapshot.inputHash,file,reader,pages:snapshot.pages.length}));
