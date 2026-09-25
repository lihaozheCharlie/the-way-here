import { GraphViewport } from "../../shared/GraphViewport";
import { useState } from "react";
import { useRememberedPreview } from "../../shared/use-remembered-preview";
import type { LifeStageView, WikiPageSummary } from "@the-way-here/shared";
import { FileListRow } from "../../shared/FileMenu";
import { Icon } from "../../shared/ui";
import { ReadOnlyPageDialog } from "./ReadOnlyPageDialog";
import "./stage-focus.css";

export function StageFocus({ stage, revision }: { stage: LifeStageView; revision: number }) {
  const preview = useRememberedPreview(`stage:${stage.page.id}`);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groups = [
    { label: "相关的人", pages: stage.relatedPeople, angle: 210, tone: "people" },
    { label: "地点", pages: stage.relatedPlaces, angle: 330, tone: "places" },
    { label: "生活系统", pages: stage.relatedSystems, angle: 90, tone: "systems" },
  ];
  const width = 1000;
  let cursor = 30;
  const positioned = groups.map(group => {
    const size = Math.max(88, group.pages.length * 46);
    const y = cursor + size / 2;
    const leaves = group.pages.map((page, index) => ({ page, y: y + (index - (group.pages.length - 1) / 2) * 46 }));
    cursor += size + 30;
    return { ...group, y, leaves };
  });
  const height = Math.max(400, cursor);
  const centerY = height / 2;
  const curve = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`;
  const open = (page: WikiPageSummary) => preview.open(page.id);
  const sparse = stage.relatedEvents.length <= 2;
  return <>
    <section className="stage-focus stage-focus-network" aria-label="阶段关系与关键事件">
      <div className="stage-network-main">
        <header className="stage-network-header"><span>{stage.range}</span><h2><button type="button" onClick={() => open(stage.page)}>{stage.page.title}</button></h2><p>{stage.focus}</p></header>
        <GraphViewport label="阶段关系图谱" width={width} height={height}>
          {positioned.map(group => <g key={group.label} className={`stage-network-${group.tone}`}>
            <path className="stage-tree-edge" d={curve(150, centerY, 480, group.y)} />
            {!collapsed.includes(group.label) && group.leaves.map(leaf => <path className="stage-tree-edge stage-tree-leaf-edge" key={leaf.page.id} d={curve(480, group.y, 840, leaf.y)} />)}
          </g>)}
          <foreignObject x={35} y={centerY-70} width={140} height={140}>
            <button type="button" className="stage-tree-root" onClick={() => open(stage.page)} aria-label={`预览阶段：${stage.page.title}`}><b>{stage.page.title}</b><small>人生阶段</small></button>
          </foreignObject>
          {positioned.map(group => <g key={group.label} className={`stage-network-${group.tone}`}>
            <foreignObject x={390} y={group.y-23} width={180} height={46}><button type="button" className="stage-tree-category" aria-expanded={!collapsed.includes(group.label)} onClick={() => setCollapsed(current => current.includes(group.label) ? current.filter(item => item !== group.label) : [...current, group.label])}>● {group.label} · {group.pages.length || "暂无关联"}</button></foreignObject>
            {!collapsed.includes(group.label) && group.leaves.map(leaf => <foreignObject key={leaf.page.id} x={730} y={leaf.y-20} width={220} height={40}><button type="button" className="stage-network-leaf stage-tree-leaf" onClick={() => open(leaf.page)} title={leaf.page.title}>{leaf.page.title}</button></foreignObject>)}
          </g>)}
        </GraphViewport>
        {stage.relatedLetters.length > 0 && <div className="stage-network-letters"><span>近况回信</span>{stage.relatedLetters.map(page => <button type="button" key={page.id} onClick={() => open(page)}>{page.title}<Icon name="arrow" size={13} /></button>)}</div>}
      </div>
      <aside className={`stage-events${sparse ? " is-sparse" : ""}`} aria-label="关键事件">
        <header><h3>关键事件</h3><span aria-label={`${stage.relatedEvents.length} 条关键事件`}>{stage.relatedEvents.length}</span></header>
        <div className="stage-event-list" tabIndex={0}>{stage.relatedEvents.length ? stage.relatedEvents.map(event => <FileListRow key={event.id} page={event}><button type="button" className="stage-event" onClick={() => open(event)}><time>{event.start || "日期待补"}</time><b>{event.title.replace(/^\d+\s*/, "")}</b>{sparse && event.excerpt && <p>{event.excerpt}</p>}<Icon name="arrow" size={16} /></button></FileListRow>) : <p className="stage-events-empty">这个阶段还没有关联的关键事件。</p>}</div>
      </aside>
    </section>
    {preview.pageId && <ReadOnlyPageDialog key={preview.pageId} pageId={preview.pageId} revision={revision} onClose={preview.close} />}
  </>;
}
