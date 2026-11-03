import { describe, expect, it } from 'vitest';
import type { WikiIndex } from '@the-way-here/wiki-core';
import { buildMobileUnderstandingProjection } from './understanding-projection.js';
// Anonymous in-memory transport fixture. No user files or knowledge rules.
const source = {id:'source',relativePath:'vault/demo/sources/one.md',title:'一天',category:'sources',type:'source',aliases:[],tags:[],locations:[],sources:[],excerpt:'用户原话',modifiedAt:'2026-10-30',start:'2026-10-30',isSource:true,markdown:'# 一天\n\n用户原话',renderedMarkdown:'用户原话',properties:{},sections:[],outgoingLinks:[],incomingLinks:[]};
const card = {...source,id:'line',relativePath:'vault/demo/wiki/主线.md',title:'主线',category:'personal-lines',isSource:false,renderedMarkdown:'## 另一种解释\n\n仍有未知',outgoingLinks:[{resolvedId:'source'}]};
function index() { const pages=[source,card]; return {config:{knowledgeBaseId:'demo'},lastIndexedAt:'2026-10-30',list:(filter?:any)=>pages.filter(p=>!filter?.category||p.category===filter.category),get:(id:string)=>pages.find(p=>p.id===id)} as unknown as WikiIndex; }
describe('mobile understanding projection',()=> {
 it('keeps source identity and quotes in a single KB transport',()=> { const p=buildMobileUnderstandingProjection(index()); expect(p.knowledgeBaseId).toBe('demo'); expect(p.sourceCount).toBe(1); expect(p.cards[0]?.evidence[0]).toMatchObject({path:source.relativePath,excerpt:'用户原话',isSource:true}); });
 it('does not add ungrounded people or future claims',()=> { const p=buildMobileUnderstandingProjection(index()); expect(p.people).toEqual([]); expect(p.stages).toEqual([]); expect(p).not.toHaveProperty('prediction'); });
});

it('projects explicit cycle fields and leaves absent causal steps unknown',()=>{
 const base=index();const originalGet=base.get.bind(base),originalList=base.list.bind(base);
 const cycle={...card,category:'cycles',properties:{trigger:'面对评价',cost:'精力透支',occurrence_count:5},renderedMarkdown:'## 自动反应\n\n急于证明自己\n\n## 小实验\n\n先核对一条事实'};
 const projected={...base,list:(filter?:any)=>originalList().map(p=>p.id==='line'?cycle:p).filter(p=>!filter?.category||p.category===filter.category),get:(id:string)=>id==='line'?cycle:originalGet(id)} as unknown as WikiIndex;
 const value=buildMobileUnderstandingProjection(projected).cards.find(p=>p.id==='line')!.cycle!;
 expect(value.steps.find(s=>s.id==='trigger')?.body).toBe('面对评价');expect(value.steps.find(s=>s.id==='response')?.body).toContain('急于证明');expect(value.steps.find(s=>s.id==='relief')?.body).toBeNull();expect(value.occurrenceCount).toBe(5);expect(value.experiment).toContain('核对一条事实');
});
it('projects only explicit turning-point before and after text',()=> {
 const event={...card,id:'turn',category:'events',incomingLinks:[],outgoingLinks:[],properties:{turning_point:true,before:'明确的转折前'},sections:[{level:2,heading:'转折后',body:'明确的转折后'}]};
 const projected={...index(),list:(filter?:any)=>[event].filter(p=>!filter?.category||p.category===filter.category),get:(id:string)=>id==='turn'?event:undefined} as unknown as WikiIndex;
 const node=buildMobileUnderstandingProjection(projected).nodes[0]!;
 expect(node.before).toBe('明确的转折前');expect(node.after).toBe('明确的转折后');
 event.sections=[];expect(buildMobileUnderstandingProjection(projected).nodes[0]!.after).toBeNull();
});
