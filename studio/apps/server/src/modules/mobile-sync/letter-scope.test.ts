import { describe, expect, it } from 'vitest';
import type { WikiIndex } from '@the-way-here/wiki-core';
import { resolveLetterScope } from './letter-scope.js';
function fixture() {
 const pages = [
  {id:'recent',relativePath:'vault/demo/sources/recent.md',title:'近况',aliases:[],isSource:true,start:'2026-10-20',modifiedAt:'2026-10-20',markdown:'原话：最近在学习'},
  {id:'old',relativePath:'vault/demo/sources/old.md',title:'过去',aliases:[],isSource:true,start:'2020-01-01',modifiedAt:'2026-10-20',markdown:'原话：过去的经历'},
  {id:'private',relativePath:'vault/demo/sources/private.md',title:'外部',aliases:[],isSource:true,start:'2026-10-20',modifiedAt:'2026-10-20',markdown:'外部内容',externalSource:{status:'available'}},
  {id:'person',relativePath:'vault/demo/wiki/person.md',title:'阿宁',aliases:['小宁'],isSource:false,category:'entities',modifiedAt:'2026-10-20',markdown:'综合页',incomingLinks:[],outgoingLinks:[{resolvedId:'old'}]},
 ];
 return {config:{knowledgeBaseId:'demo',paths:{sources:'vault/demo/sources',wiki:'vault/demo/wiki'}},list:()=>pages,get:(id:string)=>pages.find(p=>p.id===id)} as unknown as WikiIndex;
}
describe('frozen mobile letter scope',()=> {
 it('uses event date, excludes external contents and freezes exact body',()=> { const result=resolveLetterScope(fixture(),{},[],new Date('2026-10-30T00:00:00Z')); expect(result.sourcePaths).toEqual(['vault/demo/sources/recent.md']); expect(result.documents[0]?.markdown).toContain('最近在学习'); expect(result.hash).toMatch(/^[a-f0-9]{64}$/); });
 it('resolves an explicitly selected person through existing links',()=> { expect(resolveLetterScope(fixture(),{scope:'指定人物或人生线',scopeDetail:'小宁'}).sourcePaths).toEqual(['vault/demo/sources/old.md']); });
 it('rejects foreign sources and missing person, without silently broadening',()=> { expect(()=>resolveLetterScope(fixture(),{scope:'全部'},['vault/other/sources/x.md'])).toThrow(); expect(()=>resolveLetterScope(fixture(),{scope:'指定人物或人生线',scopeDetail:'不存在'})).toThrow(); });
 it('enforces future-voice minimum on server, not just UI',()=> { expect(()=>resolveLetterScope(fixture(),{scope:'全部',voice:'未来的你'})).toThrow('30'); });
 it('explicit selection narrows all-time scope',()=> { expect(resolveLetterScope(fixture(),{scope:'全部'},['vault/demo/sources/old.md']).documents).toHaveLength(1); });
});

it('rejects ambiguous legacy names and freezes only the exact selected page',()=> {
 const original=fixture();const pages=original.list();
 const duplicate={...pages.find(p=>p.id==='person')!,id:'second-person',relativePath:'vault/demo/wiki/second-person.md',incomingLinks:[],outgoingLinks:[{resolvedId:'recent'}]};
 const all=[...pages,duplicate];const index={...original,list:()=>all,get:(id:string)=>all.find(p=>p.id===id)} as unknown as WikiIndex;
 expect(()=>resolveLetterScope(index,{scope:'指定人物或人生线',scopeDetail:'阿宁'})).toThrow('重新选择');
 expect(()=>resolveLetterScope(index,{scope:'指定人物或人生线',scopeDetail:'小宁'})).toThrow('重新选择');
 expect(resolveLetterScope(index,{scope:'指定人物或人生线',scopeDetail:'vault/demo/wiki/person.md'}).sourcePaths).toEqual(['vault/demo/sources/old.md']);
 expect(resolveLetterScope(index,{scope:'指定人物或人生线',scopeDetail:'second-person'}).sourcePaths).toEqual(['vault/demo/sources/recent.md']);
});
