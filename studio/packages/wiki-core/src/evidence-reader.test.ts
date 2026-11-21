import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("reads frozen passages and reverse links progressively and rejects a different library/version", () => {
  const dir = mkdtempSync(path.join(tmpdir(),"retrieval-reader-"));
  try {
    const file = path.join(dir,"evidence.json");
    writeFileSync(file,JSON.stringify({knowledgeBaseId:"demo",inputHash:"bound",pages:[
      {pageId:"source",markdown:"---\ntags: [海外]\n---\n我想搬家。\n后来停止计划。"},
      {pageId:"followup",markdown:"最终选择留下。"},
    ],retrieval:{profiles:[{pageId:"source",title:"原始记录",role:"personal",links:[],backlinks:["followup","foreign"],time:{bodyDateClues:[]}}]}}));
    const script = fileURLToPath(new URL("../../../../knowledge-engine/skills/common/retrieval/scripts/evidence_reader.py",import.meta.url));
    const base = [script,"--file",file,"--knowledge-base","demo","--hash","bound","--purpose","核实旧计划是否撤回"];
    const run = (...args:string[])=>JSON.parse(execFileSync("python3",[...base,...args],{encoding:"utf8"}));
    expect(run("--action","search","--terms","海外").result.total).toBe(0);
    expect(run("--action","search","--terms","搬家").result.results[0].matches[0].line).toBe(4);
    expect(run("--action","read","--page","source","--start","4","--limit","1").result.lines).toEqual([{line:4,text:"我想搬家。"}]);
    expect(run("--action","neighbors","--page","source").result.neighbors.map((n:any)=>n.pageId)).toEqual(["followup"]);
    expect(run("--action","overview","--offset","1","--limit","1").result.catalogue).toHaveLength(1);
    expect(spawnSync("python3",[...base,"--hash","wrong","--action","overview"]).status).not.toBe(0);
    expect(spawnSync("python3",[...base,"--knowledge-base","other","--action","overview"]).status).not.toBe(0);
    expect(spawnSync("python3",[...base,"--action","read","--page","foreign"]).status).not.toBe(0);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

it("orders dream operators by record date and aggregates a person across records", () => {
  const dir = mkdtempSync(path.join(tmpdir(),"retrieval-reader-"));
  try {
    const file = path.join(dir,"evidence.json");
    writeFileSync(file,JSON.stringify({knowledgeBaseId:"demo",inputHash:"bound",pages:[
      {pageId:"late",markdown:"导师说名额定了。"},
      {pageId:"early",markdown:"和导师聊了课题。\n导师提醒进度。"},
      {pageId:"undated",markdown:"导师的名字出现过。"},
    ],retrieval:{profiles:[
      {pageId:"late",title:"后来",role:"personal",time:{recordedDate:"2021-06-02"}},
      {pageId:"early",title:"当时",role:"personal",aliases:["老师"],time:{recordedDate:"2021-03-01"}},
      {pageId:"undated",title:"无日期",role:"wiki",time:{}},
    ]}}));
    const script = fileURLToPath(new URL("../../../../knowledge-engine/skills/common/retrieval/scripts/evidence_reader.py",import.meta.url));
    const base = [script,"--file",file,"--knowledge-base","demo","--hash","bound","--purpose","锚定时间线"];
    const run = (...args:string[])=>JSON.parse(execFileSync("python3",[...base,...args],{encoding:"utf8"}));
    expect(run("--action","chronology").result.records.map((r:any)=>[r.pageId,r.date]))
      .toEqual([["early","2021-03-01"],["late","2021-06-02"]]);
    expect(run("--action","chronology","--terms","名额").result.records.map((r:any)=>r.pageId)).toEqual(["late"]);
    const person = run("--action","person","--terms","导师").result;
    expect(person.total).toBe(4);
    expect(person.mentions.map((m:any)=>[m.pageId,m.line,m.ownPage])).toEqual([
      ["early",1,false],["early",2,false],["late",1,false],["undated",1,false],
    ]);
    expect(spawnSync("python3",[...base,"--action","person"]).status).not.toBe(0);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
