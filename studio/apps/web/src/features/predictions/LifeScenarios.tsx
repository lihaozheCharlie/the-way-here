import { useRef, useState } from "react";
import type { LifePredictionReport } from "@the-way-here/shared";
import { predictionPathwayLabels } from "@the-way-here/shared";
import { ScenarioEvidence, scenarioProbability as probability } from "./ScenarioEvidence";

const stageLabels = {months0_3:"0–3 个月 · 决定期",months3_12:"3–12 个月 · 扛压期",years1_3:"1–3 年 · 验证期",years3_5:"3–5 年 · 分化期"};
export { DimensionDashboard } from "./DimensionDashboard";
import { DimensionDashboard } from "./DimensionDashboard";
export function LifeScenarios({report}:{report:LifePredictionReport}) {
  const [selected,setSelected] = useState<string|undefined>(report.scenarios[0]?.id);
  const [step,setStep] = useState(0);
  const [clickedFuture,setClickedFuture] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const scenario = report.scenarios.find(s=>s.id===selected);
  const move = (next:number) => {setStep(next); heading.current?.focus({preventScroll:true});};
  return <>
    <section className="life-scenario-map" aria-label="现在的我与未来可能">
      <div className="prediction-tree life-scenario-tree" style={{width: `${Math.max(700, report.scenarios.length * 190)}px`}}>
        <button type="button" className="prediction-root" aria-pressed={!scenario} onClick={()=>{setSelected(undefined);setClickedFuture(undefined);setStep(0);}}><b>现在的我</b><span>{report.current}</span></button>
        {report.scenarios.length > 0 && <>
          <div className="life-connections">
            <svg className="prediction-top-lines" viewBox="0 0 1000 130" preserveAspectRatio="none" aria-hidden="true">{report.scenarios.map((s,i)=>{
              const x = (i + .5) * 1000 / report.scenarios.length;
              return <path key={s.id} className={selected===s.id?"selected":""} d={`M500 0 C500 35 ${x} 25 ${x} 55 L${x} 130`}/>;
            })}</svg>
            <div className="life-edge-labels" style={{gridTemplateColumns:`repeat(${report.scenarios.length},minmax(0,1fr))`}}>{report.scenarios.map(s=><span key={s.id} id={`pathway-${s.id}`} className={selected===s.id?"selected":""}>{predictionPathwayLabels[s.pathway]}</span>)}</div>
          </div>
          <div className="prediction-branches" style={{gridTemplateColumns:`repeat(${report.scenarios.length},minmax(0,1fr))`}}>{report.scenarios.map(s=><button key={s.id} type="button" aria-describedby={`pathway-${s.id}`} aria-pressed={selected===s.id} onClick={()=>{setSelected(s.id);setClickedFuture(s.id);setStep(0);}}><span className={s.probability===null?"life-probability-unknown":"prediction-pct"}>{probability(s)}</span><b>{s.title}</b></button>)}</div>
        </>}
      </div>
    </section>
    {report.scenarios.length > 3 && <p className="life-map-hint">共 {report.scenarios.length} 种未来可能 · 横向滚动查看，点击节点阅读详情</p>}
    {!report.scenarios.length && <div className="prediction-empty"><h2>未来的可能，还需要多了解一些</h2><p>补充近期的工作、居住或生活安排后，可以重新预测。</p></div>}
    {scenario?.pathway === "wildcard" && clickedFuture === scenario.id && <p className="prediction-wildcard-note" role="status">未来偶尔会带来意想不到的转弯。愿你保持清醒，也给变化留一点空间，慢慢找到自己的方向。</p>}
    {scenario && <><header className="dim-section-head"><h2>为什么可能这样走</h2></header><article className="prediction-detail life-scenario-detail" aria-label="所选生活情景">
      <header className="prediction-detail-head"><h2 ref={heading} tabIndex={-1}>{scenario.title}</h2><span>{step+1} / 3</span></header>
      <nav className="prediction-steps" aria-label="阅读步骤">{["五年生活","经历依据","整体节奏"].map((name,i)=><button key={name} type="button" aria-current={step===i?"step":undefined} onClick={()=>move(i)}>{name}</button>)}</nav>
      {step===0 && <section aria-label="五年生活">
        <p className="prediction-detail-summary">{scenario.overview}</p>
        <p className="prediction-day">{scenario.week}</p>
        <p className="prediction-choice"><b>这条路的取舍</b>{scenario.choice}</p>

      </section>}
      {step===1 && <ScenarioEvidence report={report} scenario={scenario}/>}
      {step===2 && <section aria-label="整体节奏"><ol className="life-stages">{scenario.stages.map(s=><li key={s.period}><h3>{stageLabels[s.period]}</h3><p>{s.change}</p><p>成立条件：{s.condition}</p></li>)}</ol></section>}
      <footer className="prediction-stage-controls">{step>0?<button className="prediction-next" type="button" onClick={()=>move(step-1)}>← 上一步</button>:<span/>}{step<2 && <button className="prediction-next" type="button" onClick={()=>move(step+1)}>{step===0?"看看经历依据 →":"看看整体节奏 →"}</button>}</footer>
    </article></>}
    <DimensionDashboard key={scenario?.id ?? "current"} report={report} scenario={scenario}/>
  </>;
}
