import { readFile } from "node:fs/promises";
import path from "node:path";
import { WikiIndex, parseRetrievalPolicy } from "../packages/wiki-core/src/index.js";
import { parseLifeSearchPolicy, searchPredictionLifeEvidence } from "../packages/life-views/src/prediction-life-search.js";

// Read-only aggregate comparison. No diary text, paths or predictions are printed or written.
const root = path.resolve(process.argv[2] || "..");
const id = process.env.THE_WAY_HERE_KNOWLEDGE_BASE;
if (!id) throw new Error("Set THE_WAY_HERE_KNOWLEDGE_BASE explicitly");
const index = new WikiIndex(root, id);
await index.rebuild();
const pages = index.list().map(p => index.get(p.id)!);
const policy = parseLifeSearchPolicy(JSON.parse(await readFile(path.join(root,"knowledge-engine/skills/consume/predict-self/references/life-search.json"),"utf8")));
const retrievalPolicy = parseRetrievalPolicy(JSON.parse(await readFile(path.join(root,"knowledge-engine/skills/common/retrieval/references/source-policy.json"),"utf8")));
const current = searchPredictionLifeEvidence(pages, policy,retrievalPolicy);
const profiles = new Map(current.profiles.map(p=>[p.pageId,p]));
// Reproduce v1: literal full-file hits; date first; term variety second; 3 sources + 3 wiki.
const old = policy.groups.flatMap(group => {
  const matches = pages.map(p=>({p,terms:group.terms.filter(t=>p.markdown.toLowerCase().includes(t.toLowerCase())).length})).filter(x=>x.terms);
  matches.sort((a,b)=>(b.p.end||b.p.start||"").localeCompare(a.p.end||a.p.start||"") || b.terms-a.terms || a.p.id.localeCompare(b.p.id));
  const selected = new Set([...matches.filter(x=>x.p.isSource).slice(0,3),...matches.filter(x=>!x.p.isSource).slice(0,3)].map(x=>x.p.id));
  for(const x of matches){if(selected.size>=6)break;selected.add(x.p.id);}
  return [...selected];
});
const summarize=(ids:string[])=>({slots:ids.length,uniquePages:new Set(ids).size,
  navigationSlots:ids.filter(id=>profiles.get(id)?.role==="navigation").length,
  readingWithoutSelfReferenceSlots:ids.filter(id=>{const p=profiles.get(id)!;return p.role==="reading"&&!p.signals.some(s=>s.id==="identification");}).length,
  roles:Object.fromEntries([...new Set(current.profiles.map(p=>p.role))].map(role=>[role,ids.filter(id=>profiles.get(id)?.role===role).length])),
});
console.log(JSON.stringify({knowledgeBaseId:id,pages:pages.length,
  sourceDates:{total:pages.filter(p=>p.isSource).length,before:pages.filter(p=>p.isSource&&(p.end||p.start)).length,after:current.profiles.filter(p=>p.isSource&&p.time.recordedDate).length,conflicts:current.profiles.filter(p=>p.time.conflict).length},
  topicCandidates:{before:summarize(old),after:summarize(current.candidates.flatMap(g=>g.pageIds))},
  lanes:current.lanes.map(l=>({id:l.id,count:l.pageIds.length})),
  graph:{resolvedEdges:current.profiles.reduce((n,p)=>n+p.links.length,0),unresolvedEdges:current.profiles.reduce((n,p)=>n+p.unresolvedLinks.length,0)},
  limitation:"Aggregate retrieval diagnostics, not judged relevance, model behavior, or prediction accuracy. Self-reference may belong to a quoted author.",
},null,2));
