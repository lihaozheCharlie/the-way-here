import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { LifePredictionReport, LifeScenario } from "@the-way-here/shared";
import { predictionPathwayLabels, type PredictionPathway } from "@the-way-here/shared";
import { pageHref } from "../../shared/routing";

const stageLabels = {year1:"第1年 · 探索积累",years2_3:"第2—3年 · 关键转折",years4_5:"第4—5年 · 生活状态",months0_3:"0–3 个月 · 决定期",months3_12:"3–12 个月 · 扛压期",years1_3:"1–3 年 · 验证期",years3_5:"3–5 年 · 分化期"};
const kinds = {fact:"处境",wish:"愿望",plan:"计划",action:"行动",outcome:"结果",hypothesis:"假设"};
const confidence = {low:"证据有限",medium:"有一定依据",high:"依据较充分"};
const probability = (s: LifeScenario) => s.probability === null ? "暂不能估计" : `${s.probability}%`;
export { DimensionDashboard } from "./DimensionDashboard";
import { DimensionDashboard } from "./DimensionDashboard";
export function LifeScenarios({report}:{report:LifePredictionReport}) {
  const [selected,setSelected] = useState<string|undefined>(report.scenarios[0]?.id);
  const [step,setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const scenario = report.scenarios.find(s=>s.id===selected);
  const move = (next:number) => {setStep(next); heading.current?.focus({preventScroll:true});};
  return <>
    <section className="life-scenario-map" aria-label="现在的我与未来可能">
      <div className="prediction-tree life-scenario-tree" style={{width: `${Math.max(700, report.scenarios.length * 190)}px`}}>
        <button type="button" className="prediction-root" aria-pressed={!scenario} onClick={()=>{setSelected(undefined);setStep(0);}}><b>现在的我</b><span>{report.current}</span></button>
        {report.scenarios.length > 0 && <>
          <div className="life-connections">
            <svg className="prediction-top-lines" viewBox="0 0 1000 130" preserveAspectRatio="none" aria-hidden="true">{report.scenarios.map((s,i)=>{
              const x = (i + .5) * 1000 / report.scenarios.length;
              return <path key={s.id} className={selected===s.id?"selected":""} d={`M500 0 C500 35 ${x} 25 ${x} 55 L${x} 130`}/>;
            })}</svg>
            <div className="life-edge-labels" style={{gridTemplateColumns:`repeat(${report.scenarios.length},minmax(0,1fr))`}}>{report.scenarios.map(s=><span key={s.id} id={`pathway-${s.id}`} className={selected===s.id?"selected":""}>走法 · {(Object.hasOwn(predictionPathwayLabels, s.pathway ?? "") ? predictionPathwayLabels[s.pathway as PredictionPathway] : s.pathway) ?? "旧版未记录"}</span>)}</div>
          </div>
          <div className="prediction-branches" style={{gridTemplateColumns:`repeat(${report.scenarios.length},minmax(0,1fr))`}}>{report.scenarios.map(s=><button key={s.id} type="button" aria-describedby={`pathway-${s.id}`} aria-pressed={selected===s.id} onClick={()=>{setSelected(s.id);setStep(0);}}><span className={s.probability===null?"life-probability-unknown":"prediction-pct"}>{probability(s)}</span><b>{s.title}</b></button>)}</div>
        </>}
      </div>
    </section>
    {report.scenarios.length > 3 && <p className="life-map-hint">共 {report.scenarios.length} 种未来可能 · 横向滚动查看，点击节点阅读详情</p>}
    {!report.scenarios.length && <div className="prediction-empty"><h2>未来的可能，还需要多了解一些</h2>{report.gaps.map((gap,i)=><p key={i}>{gap}</p>)}</div>}
    {scenario && <><header className="dim-section-head"><h2>为什么可能这样走</h2></header><article className="prediction-detail life-scenario-detail" aria-label="所选生活情景">
      <header className="prediction-detail-head"><h2 ref={heading} tabIndex={-1}>{scenario.title}</h2><span>{step+1} / 3</span></header>
      <nav className="prediction-steps" aria-label="阅读步骤">{["五年生活","经历依据","整体节奏"].map((name,i)=><button key={name} type="button" aria-current={step===i?"step":undefined} onClick={()=>move(i)}>{name}{i===1?` · ${scenario.evidenceIds.length}`:""}</button>)}</nav>
      {step===0 && <section aria-label="五年生活">
        <p className="prediction-detail-summary">{scenario.lenses.life}</p>
        <p className="prediction-day">{scenario.week}</p>
        <p className="prediction-choice"><b>这条路的取舍</b>{scenario.choice}</p>
        <details className="prediction-caveats"><summary>工作与居住安排</summary><p>{scenario.lenses.work}</p><p>{scenario.environment}</p></details>
      </section>}
      {step===1 && <section aria-label="经历依据">
        <details className="prediction-probability-reason"><summary>{probability(scenario)} · {confidence[scenario.confidence]} · 查看估计依据</summary><p>{report.probabilityScope}</p><p>{scenario.probabilityReason}</p><p>情景概率是主观估计，未经统计校准；不代表你有多向往这条路。</p></details>
        <ol className="prediction-clues">{scenario.evidenceIds.map(id=>{const e=report.evidence.find(item=>item.id===id)!;return <li key={id}><h3>{e.cue}</h3><span className="life-evidence-kind">{kinds[e.kind]}</span><p>{e.interpretation}</p><details className="prediction-source"><summary>查看原话 · {e.pageId==="prediction-input/current"?"本次补充":e.pageId.split("/").pop()}</summary><blockquote>{e.quote}</blockquote>{e.pageId!=="prediction-input/current" && <Link to={pageHref(e.pageId)} state={{returnTo:"/predict-self",returnLabel:"返回看见未来"}}>打开完整记录 →</Link>}</details></li>;})}</ol>
        <details className="prediction-caveats"><summary>哪些条件与反例会改变判断</summary>{[...scenario.assumptions,...scenario.counterEvidence,...scenario.unknowns].map((t,i)=><p key={i}>{t}</p>)}{scenario.factors.map((f,i)=><div key={i} className={`prediction-factor ${f.direction}`}><svg className="prediction-factor-icon" viewBox="0 0 12 12" role="img" aria-label={f.direction==="support"?"助力":"阻力"}><path d={f.direction==="support"?"M6 2 11 10H1Z":"M1 2H11L6 10Z"}/></svg><span>{f.label}：{f.mechanism}</span><span className="prediction-factor-track" role="meter" aria-label={`${f.label}的相对影响`} aria-valuemin={0} aria-valuemax={3} aria-valuenow={f.strength}><i style={{width:`${f.strength/3*100}%`}}/></span></div>)}</details>
      </section>}
      {step===2 && <section aria-label="整体节奏"><ol className="life-stages">{scenario.stages.map(s=><li key={s.period}><h3>{stageLabels[s.period]}</h3><p>{s.change}</p><p>成立条件：{s.condition}</p></li>)}</ol>{scenario.actions.filter(a=>!a.dimensions?.length || a.dimensions.includes("work")).map((a,i)=><details className="prediction-cross" key={i}><summary>{a.action}</summary><p>{a.observation} · {a.reviewAfter}回看</p></details>)}{scenario.forks.length>0 && <details className="prediction-cross"><summary>可能改变方向的分岔</summary>{scenario.forks.map((f,i)=><div key={i}><h3>{f.condition}</h3><p>成立时：{f.then}</p><p>不成立时：{f.otherwise}</p></div>)}</details>}</section>}
      <footer className="prediction-stage-controls">{step>0?<button className="prediction-next" type="button" onClick={()=>move(step-1)}>← 上一步</button>:<span/>}{step<2 && <button className="prediction-next" type="button" onClick={()=>move(step+1)}>{step===0?"看看经历依据 →":"看看整体节奏 →"}</button>}</footer>
    </article></>}
    <DimensionDashboard key={scenario?.id ?? "current"} report={report} scenario={scenario}/>
  </>;
}
