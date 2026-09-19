import type { LifePredictionReport, WikiPage } from "@the-way-here/shared";
export interface PredictionIssue { path: string; message: string; repairable: boolean }
export class PredictionValidationError extends Error {
  constructor(public issues: PredictionIssue[]) { super(issues.map(i=>`${i.path}：${i.message}`).join("；")); this.name="PredictionValidationError"; }
}
const dimensionIds=["health","work","play","love"];
/** Fresh output always checks quotes against the frozen corpus. */
export function parseLifePredictionReport(text:string,pages:Pick<WikiPage,"id"|"markdown">[]):LifePredictionReport {
 return validateReport(text,pages);
}
/** Saved reports were source-checked at creation; validate structure without live-source drift. */
export function parseStoredLifePredictionReport(text:string):LifePredictionReport {
 return validateReport(text);
}
function validateReport(text:string,pages?:Pick<WikiPage,"id"|"markdown">[]):LifePredictionReport {
 const issues:PredictionIssue[]=[];
 const issue=(path:string,message:string,repairable=false)=>{issues.push({path,message,repairable});};
 let r:any;try{r=JSON.parse(text);}catch{throw new PredictionValidationError([{path:"$",message:"需要纯JSON对象",repairable:false}]);}
 const obj=(v:any,path:string,keys:string[])=>{if(!v||typeof v!=="object"||Array.isArray(v)){issue(path,"需要对象");return false;}for(const key of Object.keys(v))if(!keys.includes(key))issue(`${path}.${key}`,"不支持的字段");for(const key of keys)if(!Object.hasOwn(v,key))issue(`${path}.${key}`,"缺少字段");return true;};
 const str=(v:any,path:string,max=120,min=1)=>{if(typeof v!=="string"||v.trim().length<min)issue(path,`需要至少${min}字符的文本`);else if(v.length>max)issue(path,`最多${max}字符`,true);};
 const arr=(v:any,path:string,min=0,max=4):any[]=>{if(!Array.isArray(v)){issue(path,"需要数组");return [];}if(v.length<min||v.length>max)issue(path,`需要${min}—${max}项`);return v;};
 const strings=(v:any,path:string,min=0,max=3,len=120)=>arr(v,path,min,max).forEach((x,i)=>str(x,`${path}[${i}]`,len));
 const en=(v:any,path:string,values:unknown[])=>{if(!values.includes(v))issue(path,`仅允许${values.join("/")}`);};
 const unique=(v:any[],path:string)=>{if(new Set(v).size!==v.length)issue(path,"不允许重复");};
 const dims=(v:any,path:string,full=false)=>{const a=arr(v,path,full?4:1,4);unique(a,path);a.forEach((x,i)=>en(x,`${path}[${i}]`,dimensionIds));};
 // Obsolete metadata carries no meaning and must never gate otherwise valid content.
 if(r&&typeof r==="object"&&!Array.isArray(r)){delete r.version;delete r.gaps;}
 if(!obj(r,"$",["current","dimensions","evidence","scenarios"]))throw new PredictionValidationError(issues);
 str(r.current,"$.current",40);
 const evidence=arr(r.evidence,"$.evidence",0,20), sources=pages ? new Map(pages.map(p=>[p.id,p.markdown])) : undefined;
 unique(evidence.map(e=>e?.id),"$.evidence.id");unique(evidence.map(e=>JSON.stringify([e?.pageId,e?.quote])),"$.evidence.quote");
 evidence.forEach((e,i)=>{const p=`$.evidence[${i}]`;if(!obj(e,p,["id","pageId","quote","cue","interpretation","kind","dimensions"]))return;
 str(e.id,p+".id",40);str(e.pageId,p+".pageId",1000);str(e.quote,p+".quote",200,8);str(e.cue,p+".cue",40);str(e.interpretation,p+".interpretation",100);en(e.kind,p+".kind",["fact","wish","plan","action","outcome","hypothesis"]);dims(e.dimensions,p+".dimensions");
 if(sources&&typeof e.quote==="string"&&!sources.get(e.pageId)?.includes(e.quote))issue(p+".quote","引文必须是该冻结来源中的连续原文",sources.has(e.pageId));
 });
 const refs=(v:any,path:string,min=0,current=false)=>{const a=arr(v,path,min,8);unique(a,path);a.forEach((id,i)=>{const e=evidence.find(e=>e?.id===id);if(!e)issue(`${path}[${i}]`,"引用不存在");else if(current&&e.kind==="hypothesis")issue(`${path}[${i}]`,"当前状态不得引用假设");});};
 const current=arr(r.dimensions,"$.dimensions",4,4);dims(current.map(d=>d?.id),"$.dimensions.id",true);
 current.forEach((d,i)=>{const p=`$.dimensions[${i}]`;if(!obj(d,p,["id","current","desired","constraints","evidenceIds"]))return;str(d.current,p+".current");str(d.desired,p+".desired");strings(d.constraints,p+".constraints");refs(d.evidenceIds,p+".evidenceIds",0,true);});
 const scenarios=arr(r.scenarios,"$.scenarios",0,5);unique(scenarios.map(s=>s?.id),"$.scenarios.id");unique(scenarios.map(s=>s?.title),"$.scenarios.title");
 if(scenarios.length>0&&!scenarios.some(s=>s?.pathway==="wildcard"))issue("$.scenarios","须包含一条随机事件情景");
 scenarios.forEach((s,i)=>{const p=`$.scenarios[${i}]`;if(!obj(s,p,["id","title","pathway","probability","probabilityBasis","probabilityCondition","probabilityReason","confidence","overview","week","choice","dimensions","evidenceIds","assumptions","counterEvidence","unknowns","stages","actions"]))return;
 str(s.id,p+".id",40);str(s.title,p+".title",20);en(s.pathway,p+".pathway",["inertia","willed","wildcard"]);
 if(s.probability!==null&&(!Number.isInteger(s.probability)||s.probability<0||s.probability>100||s.probability%5))issue(p+".probability","需要0—100的5的倍数或null");
 en(s.probabilityBasis,p+".probabilityBasis",["overall","conditional"]);
 if(s.probabilityBasis==="conditional")str(s.probabilityCondition,p+".probabilityCondition");else if(s.probabilityCondition!==null)issue(p+".probabilityCondition","整体估计的条件字段须为null");
 str(s.probabilityReason,p+".probabilityReason",180);en(s.confidence,p+".confidence",["low","medium","high"]);
 str(s.overview,p+".overview",80);str(s.week,p+".week",140);str(s.choice,p+".choice",70);refs(s.evidenceIds,p+".evidenceIds",1);
 if(s.confidence!=="low"&&Array.isArray(s.evidenceIds)&&s.evidenceIds.every((id:string)=>["wish","plan","hypothesis"].includes(evidence.find(e=>e?.id===id)?.kind)))issue(p+".confidence","只有愿望、计划或假设时必须为low");
 strings(s.assumptions,p+".assumptions",1);strings(s.counterEvidence,p+".counterEvidence");strings(s.unknowns,p+".unknowns");
 const ds=arr(s.dimensions,p+".dimensions",4,4);dims(ds.map(d=>d?.id),p+".dimensions.id",true);
 ds.forEach((d,j)=>{const q=`${p}.dimensions[${j}]`;if(!obj(d,q,["id","future","verdict","gainShare","gains","costs","notes"]))return;
 str(d.future,q+".future",100);if(obj(d.verdict,q+".verdict",["label","tone"])){str(d.verdict.label,q+".verdict.label",20);en(d.verdict.tone,q+".verdict.tone",["up","mixed","down"]);}en(d.gainShare,q+".gainShare",[20,35,50,65,80,null]);strings(d.gains,q+".gains",1,2,60);strings(d.costs,q+".costs",1,2,60);
 arr(d.notes,q+".notes",0,2).forEach((n,k)=>{const z=`${q}.notes[${k}]`;if(obj(n,z,["kind","title","detail"])){en(n.kind,z+".kind",["condition","risk"]);str(n.title,z+".title",40);str(n.detail,z+".detail",100);}});
 });
 const stages=arr(s.stages,p+".stages",4,4);stages.forEach((t,j)=>{const q=`${p}.stages[${j}]`;if(obj(t,q,["period","change","condition"])){en(t.period,q+".period",[["months0_3","months3_12","years1_3","years3_5"][j]]);str(t.change,q+".change",80);str(t.condition,q+".condition",80);}});
 arr(s.actions,p+".actions",1,3).forEach((a,j)=>{const q=`${p}.actions[${j}]`;if(obj(a,q,["action","observation","reviewAfter","dimensions"])){str(a.action,q+".action",80);str(a.observation,q+".observation",80);str(a.reviewAfter,q+".reviewAfter",30);dims(a.dimensions,q+".dimensions");}});
 });
 if(issues.length)throw new PredictionValidationError(issues);return r;
}
/** Repair only the exact text leaves reported by validation. Never replace probabilities or whole reports. */
export function applyPredictionRepairs(candidate:string,answer:string,issues:PredictionIssue[]):string {
 if(!issues.length||issues.some(i=>!i.repairable))throw new Error("该错误不能局部修复");
 const data=JSON.parse(candidate),patch=JSON.parse(answer), allowed=new Set(issues.map(i=>i.path));
 if(!patch||Object.keys(patch).join()!=="repairs"||!Array.isArray(patch.repairs)||patch.repairs.length!==allowed.size)throw new Error("修复必须覆盖且仅覆盖指定字段");
 for(const item of patch.repairs){if(!item||Object.keys(item).sort().join()!=="path,value"||!allowed.delete(item.path)||typeof item.value!=="string")throw new Error("修复越过字段边界");
 const parts=item.path.replace(/^\$\./,"").replace(/\[(\d+)\]/g,".$1").split(".");if(parts.some((k:string)=>["__proto__","prototype","constructor"].includes(k)))throw new Error("非法修复路径");let node=data;for(const k of parts.slice(0,-1))node=node[k];node[parts.at(-1)!]=item.value;
 }
 return JSON.stringify(data);
}
