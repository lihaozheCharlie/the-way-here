import { createHash } from "node:crypto";
import { buildEvidenceProfiles, type RetrievalPolicy } from "./evidence-retrieval.js";
import type { EvidencePage } from "./evidence-metadata.js";

/** A task-local corpus: no prediction policy, inferred facts, or access to another library. */
export function createEvidenceSnapshot(knowledgeBaseId: string, input: EvidencePage[], policy: RetrievalPolicy) {
  const sorted = [...input].sort((a,b)=>a.id.localeCompare(b.id));
  const profiles = buildEvidenceProfiles(sorted,policy);
  const pages = sorted.map(p=>({pageId:p.id,markdown:p.markdown}));
  const catalogue = profiles.map(p=>({pageId:p.pageId,title:p.title,isSource:p.isSource,role:p.role}));
  const retrieval = {version:1,profiles};
  const inputHash = createHash("sha256").update(JSON.stringify({knowledgeBaseId,pages,retrieval,policy})).digest("hex");
  return {knowledgeBaseId,inputHash,catalogue,pages,retrieval};
}
