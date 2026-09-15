import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { LifeDimension, LifePredictionReport, LifeScenario } from "@the-way-here/shared";
import { pageHref } from "../../shared/routing";
const labels = {health:"健康",work:"工作",play:"玩乐",love:"爱"};
const dimensionOrder: LifeDimension[] = ["health","work","play","love"];
const kinds = {fact:"处境",wish:"愿望",plan:"计划",action:"行动",outcome:"结果",hypothesis:"假设"};
const confidence = {low:"证据有限",medium:"有一定依据",high:"依据较充分"};
const probability = (s: LifeScenario) => s.probability === null ? "暂不能估计" : `${s.probability}%`;
export function DimensionDashboard({report,scenario}:{report:LifePredictionReport;scenario?:LifeScenario}) {
  return <div className="life-dashboard-wrap">
    <div className="life-dashboard" role="group" aria-label="四维仪表盘">
      {dimensionOrder.map(id=>{
        const dim = report.dimensions.find(d=>d.id===id)!;
        const focus = scenario?.dimensions.find(d=>d.id===id);
        const moves = scenario?.actions.filter(a=>a.dimensions?.includes(id)) ?? [];
        return <div key={id} className={`life-dashboard-card${focus?" is-focused":""}`}>
          <span className="life-dashboard-label">{labels[id]}</span>
          {focus ? <>
            <p className="life-dashboard-main">{focus.future}</p>
            <p className="life-dashboard-sub life-dashboard-gain">获得：{focus.gain}</p>
            <p className="life-dashboard-sub life-dashboard-cost">代价：{focus.cost}</p>
            {moves.map((a,i)=><p key={i} className="life-dashboard-move"><b>要做到这一点：</b>{a.action}<span>（{a.reviewAfter}回看）</span></p>)}
          </> : <>
            <p className="life-dashboard-main">{dim.current}</p>
            <p className="life-dashboard-sub">想要：{dim.desired}</p>
            {dim.constraints.map((c,i)=><p key={i} className="life-dashboard-sub">{c}</p>)}
          </>}
        </div>;
      })}
    </div>
  </div>;
}
export function LifeScenarios({report}:{report:LifePredictionReport}) {
  const [lens,setLens] = useState<"work"|"life">("work");
  const [selected,setSelected] = useState<string|undefined>(undefined);
  const [step,setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const scenario = report.scenarios.find(s=>s.id===selected);
  const move = (next:number) => {setStep(next); heading.current?.focus({preventScroll:true});};
  return <>
    <div className="prediction-domains" role="group" aria-label="预测领域">{(["work","life"] as const).map(id=><button key={id} type="button" aria-pressed={lens===id} onClick={()=>setLens(id)}>{id==="work"?"工作":"生活"}</button>)}</div>
    <p className="prediction-horizon">同一组五年生活 · {lens==="work"?"从工作看":"从生活看"} · 情景概率估计{report.probabilityMode==="independent"?"，可并存、不相加":"，在所列范围内合计100%"}</p>
    <div className="prediction-root"><b>现在的你</b><span>{report.current}</span></div>
    <p className="life-dashboard-hint">健康、工作、玩乐、爱——四个维度像仪表盘，选一条路看它们如何变化</p>
    <DimensionDashboard report={report} scenario={scenario}/>
    {report.scenarios.length>0 && <div className="prediction-tree life-scenario-tree">
      <svg className="prediction-top-lines" viewBox="0 0 700 90" preserveAspectRatio="none" aria-hidden="true">{report.scenarios.map((s,i)=><path key={s.id} className={selected===s.id?"selected":""} style={{strokeWidth:2+(s.probability??0)*.05}} d={`M350 0 C350 45 ${(i+.5)*700/report.scenarios.length} 45 ${(i+.5)*700/report.scenarios.length} 90`}/>)}</svg>
      <div className="prediction-branches" style={{gridTemplateColumns:`repeat(${report.scenarios.length},minmax(0,1fr))`}}>{report.scenarios.map(s=><button key={s.id} type="button" aria-pressed={selected===s.id} onClick={()=>{setSelected(selected===s.id?undefined:s.id);setStep(0);}}><span className={s.probability===null?"life-probability-unknown":"prediction-pct"}>{probability(s)}</span><b>{s.title}</b><ul className="life-branch-highlights">{dimensionOrder.map(id=>{const d=s.dimensions.find(x=>x.id===id)!;return <li key={id}><span className="life-branch-highlight-label">{labels[id]}</span><span className="life-branch-highlight-text">{d.gain}</span></li>;})}</ul></button>)}</div>
    </div>}
    {scenario && <article className="prediction-detail life-scenario-detail" aria-label="所选生活情景">
      <header className="prediction-detail-head"><h2 ref={heading} tabIndex={-1}>{scenario.title}</h2><span>{step+1} / 3</span></header>
      <nav className="prediction-steps" aria-label="阅读步骤">{["五年生活","经历依据","怎样走到这里"].map((name,i)=><button key={name} type="button" aria-current={step===i?"step":undefined} onClick={()=>move(i)}>{name}{i===1?` · ${scenario.evidenceIds.length}`:""}</button>)}</nav>
      {step===0 && <section aria-label="五年生活">
        <p className="prediction-detail-summary">{scenario.lenses[lens]}</p>
        <p className="prediction-day">{scenario.week}</p>
        <p className="prediction-choice"><b>这条路的取舍</b>{scenario.choice}</p>
        <p className="prediction-day">居住与环境：{scenario.environment}</p>
      </section>}
      {step===1 && <section aria-label="经历依据">
        <details className="prediction-probability-reason"><summary>{probability(scenario)} · {confidence[scenario.confidence]} · 查看估计依据</summary><p>{report.probabilityScope}</p><p>{scenario.probabilityReason}</p><p>情景概率是主观估计，未经统计校准；不代表你有多向往这条路。</p></details>
        <ol className="prediction-clues">{scenario.evidenceIds.map(id=>{const e=report.evidence.find(item=>item.id===id)!;return <li key={id}><h3>{e.cue}</h3><span className="life-evidence-kind">{kinds[e.kind]}</span><p>{e.interpretation}</p><details className="prediction-source"><summary>查看原话 · {e.pageId==="prediction-input/current"?"本次补充":e.pageId.split("/").pop()}</summary><blockquote>{e.quote}</blockquote>{e.pageId!=="prediction-input/current" && <Link to={pageHref(e.pageId)} state={{returnTo:"/predict-self",returnLabel:"返回预测自己"}}>打开完整记录 →</Link>}</details></li>;})}</ol>
        <details className="prediction-caveats"><summary>哪些条件与反例会改变判断</summary>{[...scenario.assumptions,...scenario.counterEvidence,...scenario.unknowns].map((t,i)=><p key={i}>{t}</p>)}{scenario.factors.map((f,i)=><div key={i} className={`prediction-factor ${f.direction}`}><svg className="prediction-factor-icon" viewBox="0 0 12 12" role="img" aria-label={f.direction==="support"?"助力":"阻力"}><path d={f.direction==="support"?"M6 2 11 10H1Z":"M1 2H11L6 10Z"}/></svg><span>{f.label}：{f.mechanism}</span><span className="prediction-factor-track" role="meter" aria-label={`${f.label}的相对影响`} aria-valuemin={0} aria-valuemax={3} aria-valuenow={f.strength}><i style={{width:`${f.strength/3*100}%`}}/></span></div>)}</details>
      </section>}
      {step===2 && <section aria-label="怎样走到这里"><ol className="life-stages">{scenario.stages.map((s,i)=><li key={s.period}><h3>{["第1年 · 探索积累","第2—3年 · 关键转折","第4—5年 · 生活状态"][i]}</h3><p>{s.change}</p><p className="prediction-day">成立条件：{s.condition}</p></li>)}</ol><h3>现在先验证什么</h3><ol className="prediction-actions">{scenario.actions.map((a,i)=><li key={i}><h3>{a.action}</h3>{a.dimensions && a.dimensions.length>0 && <p className="life-action-dims">对应：{a.dimensions.map(d=>labels[d]).join("、")}</p>}<p>留意：{a.observation}</p><span>{a.reviewAfter}回看</span></li>)}</ol>{scenario.forks.length>0 && <details className="prediction-cross"><summary>可能改变方向的分岔</summary>{scenario.forks.map((f,i)=><div key={i}><h3>{f.condition}</h3><p>成立时：{f.then}</p><p>不成立时：{f.otherwise}</p></div>)}</details>}</section>}
      <footer className="prediction-stage-controls">{step>0?<button className="prediction-next" type="button" onClick={()=>move(step-1)}>← 上一步</button>:<span/>}{step<2 && <button className="prediction-next" type="button" onClick={()=>move(step+1)}>{step===0?"看看经历依据 →":"看看路径与行动 →"}</button>}</footer>
    </article>}
    {report.gaps.length>0 && <details className="prediction-cross" open={!scenario}><summary>还缺少哪些了解</summary>{report.gaps.map((g,i)=><p key={i}>{g}</p>)}</details>}
    <details className="prediction-cross"><summary>这些选择如何相互影响</summary>{report.tensions.map((t,i)=><p key={i}>{t}</p>)}</details>
    {report.changes.length>0 && <details className="prediction-cross"><summary>这次什么改变了判断</summary>{report.changes.map((t,i)=><p key={i}>{t}</p>)}</details>}
  </>;
}
