import { useState } from "react";
import type { LifeDimension, LifePredictionReport, LifeScenario } from "@the-way-here/shared";

const dimensions = ["health", "work", "play", "love"] as const;
const labels = { health: "健康", love: "爱", play: "娱乐", work: "工作" };

/** Health, work, play and love use distinct marks beside their visible labels. */
function DimensionIcon({ id }: { id: typeof dimensions[number] }) {
  return <span className={`dim-row-icon ${id}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {id === "health" && <path d="M12 21s-7.5-4.8-9.6-9.4C.9 8.1 2.6 4.5 6 4.1c2-.2 3.6.9 6 3.4 2.4-2.5 4-3.6 6-3.4 3.4.4 5.1 4 3.6 7.5C19.5 16.2 12 21 12 21Z"/>}
    {id === "love" && <path d="M12 20s-7-4.35-9-8.5C1.5 8 3 5 6.5 5c2 0 3.5 1.3 5.5 3.6C14 5.3 15.5 4 17.5 4 21 4 22.5 8 21 11.5 19 15.65 12 20 12 20Z"/>}
    {id === "play" && <><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 9h.01M8 14c1 1.5 2.5 2 4 2s3-.5 4-2"/></>}
    {id === "work" && <><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 6V4h8v2M3 11a22 22 0 0 0 18 0M10 12h4"/></>}
  </svg></span>;
}

function Mark({ kind }: { kind: "gain" | "risk" | "arrow" | "chevron" }) {
  return <svg className="dim-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "gain" ? <path d="m5 12 4 4L19 6"/> : kind === "risk" ? <><path d="m12 3 10 18H2Z"/><path d="M12 9v4m0 4h.01"/></> : <path d={kind === "arrow" ? "M4 12h16m-6-6 6 6-6 6" : "m6 9 6 6 6-6"}/>}
  </svg>;
}

export function DimensionDashboard({ report, scenario }: { report: LifePredictionReport; scenario?: LifeScenario }) {
  const [expanded, setExpanded] = useState<LifeDimension | null>("health");
  return <section className="life-dimensions" aria-label="四个维度">
    <header className="dim-section-head"><h2>四个维度：{scenario ? "会怎样变化，以及要怎么做才能走到这里" : "现在的你，以及想去的方向"}</h2><span>点标题行折叠 · 点行动项展开详情</span></header>
    {dimensions.map(id => {
      const current = report.dimensions.find(d => d.id === id);
      const future = scenario?.dimensions.find(d => d.id === id);
      const conditions = future?.notes.filter(note => note.kind === "condition") ?? [];
      const risks = future?.notes.filter(note => note.kind === "risk") ?? [];
      const actions = scenario?.actions.filter(action => action.dimensions?.includes(id)) ?? [];
      const share = future?.gainShare;
      return <details className="dim-row" key={id} open={expanded === id}>
        <summary className="dim-row-summary" onClick={event => { event.preventDefault(); setExpanded(expanded === id ? null : id); }}>
          <DimensionIcon id={id}/>
          <span className="dim-row-main"><span className="dim-row-top"><b>{labels[id]}</b><span className={`dim-row-verdict ${future?.verdict?.tone ?? "mixed"}`}><i aria-hidden="true"/>{future?.verdict?.label ?? (future ? "收益与代价" : current ? "当前状态" : "待补充")}</span></span>
            <span className="dim-row-line">{future?.future ?? current?.current ?? "重新预测后补充此维度"}</span>
          </span>
          {future && <span className="dim-row-meta">
            {share == null ? <span className="dim-balance-empty">权衡依据待补充</span> : <>
              <span className="dim-row-bar" role="img" aria-label={`收益权衡 ${share}%，代价权衡 ${100-share}%`}><i className="gain" style={{width:`${share}%`}}/><i className="cost" style={{width:`${100-share}%`}}/></span>
              <span className="dim-balance-labels"><span><i className="gain"/>收益 {share}%</span><span><i className="cost"/>代价 {100-share}%</span></span>
            </>}
          </span>}
          <span className="dim-row-chev"><Mark kind="chevron"/></span>
        </summary>
        <div className="dim-row-body" key={scenario?.id ?? "current"}>
          <div className="dim-timeline">
            <div className="dim-time-block"><span className="dim-time-tag">现在</span><p>{current?.current ?? "尚待了解"}</p></div>
            <span className="dim-time-arrow"><Mark kind="arrow"/></span>
            <div className="dim-time-block future"><span className="dim-time-tag">{scenario ? "未来" : "想要"}</span><p>{future?.future ?? (scenario ? "尚待补充独立分析" : current?.desired ?? "尚待了解")}</p></div>
          </div>
          {future && <div className="dim-factors">
            <section className="dim-factor gain"><h3><Mark kind="gain"/>有利因素</h3>{future.gains.length ? <ul>{future.gains.map((text,i) => <li key={i}><Mark kind="gain"/><span>{text}</span></li>)}</ul> : <p>暂未给出有利因素。</p>}</section>
            <section className="dim-factor risk"><h3><Mark kind="risk"/>需要关注</h3>{future.costs.length || risks.length ? <ul>
              {future.costs.map((text,i) => <li key={`cost-${i}`}><Mark kind="risk"/><span>{text}</span></li>)}
              {risks.map((note,i) => <li key={`risk-${i}`}><Mark kind="risk"/><span><b>{note.title}</b><span className="dim-factor-detail">{note.detail}</span></span></li>)}
            </ul> : <p>暂未给出需要关注的因素。</p>}</section>
          </div>}
          <div className="dim-actions">
            {scenario ? <>
              <div className="dim-actions-head"><h3>想走稳这条路，{id === "love" ? "关系" : labels[id]}上要注意 <span>· 共 {actions.length} 条行动</span></h3>{actions.length > 0 && <span>点行动项查看详情</span>}</div>
              {conditions.map((note,i) => <div className="dim-premise" key={i}><b>前提：{note.title}</b><p>{note.detail}</p></div>)}
              <div className="dim-step-list">{actions.map((action,i) => <details className={`dim-step${i === 0 ? " current" : ""}`} key={`${i}-${action.action}`} open={i === 0}>
                <summary className="dim-step-summary"><span className="dim-step-num">{i+1}</span><span className="dim-step-body">{action.reviewAfter && <span className="dim-step-time">{action.reviewAfter}回看</span>}<span className="dim-step-text">{action.action}</span></span><span className="dim-step-chevron"><Mark kind="chevron"/></span></summary>
                <p className="dim-step-detail"><b>观察重点：</b>{action.observation || "尚未给出观察重点。"}</p>
              </details>)}</div>
              {!actions.length && <p className="dim-empty">这份报告尚未给出此维度的具体行动。</p>}
            </> : <><h3>当前的限制与牵挂</h3>{current?.constraints.length ? current.constraints.map((text,i) => <p className="dim-empty" key={i}>{text}</p>) : <p className="dim-empty">尚待了解。</p>}</>}
          </div>
        </div>
      </details>;
    })}
    {scenario && <p className="dim-balance-note">收益与代价为五档主观权衡，不是健康或幸福评分；依据不足时留空。</p>}
  </section>;
}
