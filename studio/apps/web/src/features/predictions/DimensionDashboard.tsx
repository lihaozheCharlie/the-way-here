import { useState } from "react";
import type { LifeDimension, LifePredictionReport, LifeScenario } from "@the-way-here/shared";

const dimensions = ["health", "love", "play", "finance"] as const;
const labels = { health: "健康", love: "爱 / 关系", play: "玩乐", finance: "财务" };
const noteLabels = { action: "行动", condition: "前提", risk: "警示" };

/** Keep the four marks from the supplied interaction reference, including the two different hearts. */
function DimensionIcon({ id }: { id: typeof dimensions[number] }) {
  return <span className={`dim-row-icon ${id}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {id === "health" && <path d="M12 21s-7.5-4.8-9.6-9.4C.9 8.1 2.6 4.5 6 4.1c2-.2 3.6.9 6 3.4 2.4-2.5 4-3.6 6-3.4 3.4.4 5.1 4 3.6 7.5C19.5 16.2 12 21 12 21Z"/>}
    {id === "love" && <path d="M12 20s-7-4.35-9-8.5C1.5 8 3 5 6.5 5c2 0 3.5 1.3 5.5 3.6C14 5.3 15.5 4 17.5 4 21 4 22.5 8 21 11.5 19 15.65 12 20 12 20Z"/>}
    {id === "play" && <><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 9h.01M8 14c1 1.5 2.5 2 4 2s3-.5 4-2"/></>}
    {id === "finance" && <><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h.01"/></>}
  </svg></span>;
}

export function DimensionDashboard({ report, scenario }: { report: LifePredictionReport; scenario?: LifeScenario }) {
  const [expanded, setExpanded] = useState<LifeDimension | null>("health");
  return <section className="life-dimensions" aria-label="四个维度">
    <header className="dim-section-head"><h2>四个维度：{scenario ? "会怎样变化，以及要怎么做才能走到这里" : "现在的你，以及想去的方向"}</h2><span>点任意一行展开</span></header>
    {dimensions.map(id => {
      const current = report.dimensions.find(d => d.id === id);
      const future = scenario?.dimensions.find(d => d.id === id);
      const notes = (future?.notes ?? []).map(note => ({...note}));
      for (const action of scenario?.actions.filter(a => a.dimensions?.includes(id)) ?? []) {
        const detail = `${action.observation} · ${action.reviewAfter}回看`;
        const existing = notes.find(note => note.kind === "action" && note.title === action.action);
        if (existing) existing.detail = `${existing.detail} ${detail}`;
        else notes.push({kind:"action",title:action.action,detail});
      }
      const gain = future?.gains ?? (future ? [future.gain] : []);
      const cost = future?.costs ?? (future ? [future.cost] : []);
      const share = future?.gainShare;
      return <details className="dim-row" key={id} open={expanded === id}>
        <summary className="dim-row-summary" onClick={event => { event.preventDefault(); setExpanded(expanded === id ? null : id); }}>
          <DimensionIcon id={id}/>
          <span className="dim-row-main"><span className="dim-row-top"><b>{labels[id]}</b><span className={`dim-row-verdict ${future?.verdict?.tone ?? "mixed"}`}>{future?.verdict?.label ?? (future ? "收益与代价" : current ? "当前状态" : "待补充")}</span></span>
            <span className="dim-row-line">{future ? <><span className="up-word">{gain.join("、")}</span> ／ <span className="down-word">{cost.join("、")}</span></> : current?.current ?? "尚无独立财务分析，重新预测后补充"}</span>
          </span>
          <span className="dim-row-bar" role="img" aria-label={share == null ? "暂无收益与代价比重" : `收益比重 ${share}%，代价比重 ${100-share}%`}>
            {share != null && <><i className="gain" style={{width:`${share}%`}}/><i className="cost" style={{width:`${100-share}%`}}/></>}
          </span><span className="dim-row-chev" aria-hidden="true">▾</span>
        </summary>
        <div className="dim-row-body">
          <p className="dim-transition"><b>现在</b> {current?.current ?? "尚待了解"} → <b>{scenario ? "未来" : "想要"}</b> {future?.future ?? (scenario ? "尚待补充独立分析" : current?.desired ?? "尚待了解")}</p>
          {future && <div className="dim-tags">{([ ["gain", gain], ["cost", cost] ] as const).flatMap(([kind, items]) => items.map((text,i) => <span className={`dim-tag ${kind}`} key={`${kind}-${i}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d={kind === "gain" ? "M5 12l5 5L20 7" : "M12 8v5M12 16h.01"}/></svg>{text}</span>))}</div>}
          {scenario ? <><div className="dim-notes-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>想走稳这条路，{id === "love" ? "关系" : labels[id]}上要注意 <span>· {notes.length} 条，点开看详情</span></div>
            {notes.length ? notes.map((note,i) => <details className="note-item" key={i}><summary className="note-summary"><span className={`note-tag ${note.kind}`}>{noteLabels[note.kind]}</span><span className="note-title">{note.title}</span><span className="note-chev" aria-hidden="true">▾</span></summary><p className="note-detail">{note.detail}</p></details>) : <p className="dim-transition">这份报告尚未给出此维度的具体注意点。</p>}
          </> : current?.constraints.map((text,i) => <p className="dim-transition" key={i}>{text}</p>)}
        </div>
      </details>;
    })}
    <div className="dim-legend"><span><i className="gain"/>绿色 = 收益比重</span><span><i className="cost"/>棕色 = 代价／风险比重</span></div>
  </section>;
}
