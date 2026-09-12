import { useSearchParams } from "react-router-dom";
import type { LifeMapView, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { PageLink } from "../../shared/routing";
import { Empty, Icon, Loading } from "../../shared/ui";
import { UnderstandingBanner } from "./UnderstandingLayout";
import { orderLifeStagesFromPresent } from "./life-atlas";

export function Timeline({ revision }: { revision: number }) {
  const { data, loading, error } = useApi<LifeMapView>("/api/views/life-map", revision);
  const [params, setParams] = useSearchParams();
  if (loading) return <Loading label="正在展开人生地图" />;
  if (error || !data) return <Empty>{error || "暂无人生阶段"}</Empty>;
  const orderedStages = orderLifeStagesFromPresent(data.stages);
  const selected = orderedStages.find((stage) => stage.page.id === params.get("stage")) || orderedStages.find((stage) => stage.current && stage.lane === 0) || orderedStages[0];
  const selectStage = (id: string) => setParams((current) => { const next = new URLSearchParams(current); next.set("stage", id); return next; });
  return (
    <div className="life-map-page understanding-life-page">
      <UnderstandingBanner tone="life" title="人生轨迹" description="沿着阶段与转折回看一路走来的变化。这里保留时间顺序，也保留同一时期并行发生的人生线索。" count={data.stages.length + data.events.length} countLabel="个阶段与转折" />
      <section className="understanding-timeline" aria-label="人生阶段时间线">
        <div className="understanding-timeline-item is-now"><i /><div><span>现在</span><p>从此刻向过去回看，新的经历会继续补在最上方。</p></div></div>
        {orderedStages.map((stage) => {
          const isSelected = selected?.page.id === stage.page.id;
          return <button type="button" key={stage.page.id} className={`understanding-timeline-item${isSelected ? " is-selected" : ""}${stage.relatedEvents.length ? " is-turning" : ""}${stage.lane > 0 ? " is-parallel" : ""}`} onClick={() => selectStage(stage.page.id)}>
            <i /><div><span>{stage.range}</span><b>{stage.page.title}</b><p>{stage.focus}</p><small>{stage.lane > 0 ? "并行人生线" : "人生主线"}{stage.relatedEvents.length ? ` · ${stage.relatedEvents.length} 个转折` : ""}</small></div>
          </button>;
        })}
      </section>

      {selected && <section className="stage-focus" aria-live="polite">
        <div className="stage-focus-copy"><span>{selected.lane > 0 ? "并行人生线" : "人生主线"} · {selected.range}</span><h2><PageLink page={selected.page}>{selected.page.title}</PageLink></h2><p>{selected.focus}</p>
        </div>
        <div className="stage-focus-turns" id="stage-turns"><header><b>转折坐标</b><span>{selected.relatedEvents.length || "待补充"}</span></header>{selected.relatedEvents.length ? selected.relatedEvents.map((event) => <PageLink page={event} key={event.id}><time>{event.start || "时间待查"}</time><b>{event.title.replace(/^\d+\s*/, "")}</b><Icon name="arrow" size={14} /></PageLink>) : <p>这个阶段还没有明确关联的转折。补充经历后，坐标会出现在这里。</p>}</div>
        <div className="stage-linked-dimensions">{([
          ["相关的人", selected.relatedPeople], ["地点", selected.relatedPlaces], ["生活系统", selected.relatedSystems], ["近况回信", selected.relatedLetters],
        ] as Array<[string, WikiPageSummary[]]>).map(([label, pages]) => pages.length ? <div key={label}><b>{label}</b><span>{pages.slice(0, 5).map((page) => <PageLink key={page.id} page={page}>{page.title}</PageLink>)}</span></div> : null)}</div>
      </section>}
      <PageAgentContext context={{ scope: "人生地图", title: selected?.page.title || "人生阶段", pageId: selected?.page.id, summary: selected?.focus, defaultMode: "write", suggestions: ["我想起一件属于这个阶段的重要经历，请帮我判断应该补充到哪里。", "结合这个阶段的证据，帮我梳理它如何影响了后来的选择。", "这个阶段还有一条并行的人生线没有记录，请帮我补充。"] }} />
    </div>
  );
}
