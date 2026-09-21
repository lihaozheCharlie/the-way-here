import { Link } from "react-router-dom";
import type { LifePredictionReport, LifeScenario } from "@the-way-here/shared";
import { pageHref } from "../../shared/routing";

const confidence = {low:"证据有限",medium:"有一定依据",high:"依据较充分"};
export const scenarioProbability = (s:LifeScenario) => s.probability === null ? "暂不能估计" : `${s.probability}%${s.probabilityBasis === "conditional" ? " · 假设成立时" : ""}`;

export function ScenarioEvidence({report,scenario}:{report:LifePredictionReport;scenario:LifeScenario}) {
  const evidence=scenario.evidenceIds.map(id=>report.evidence.find(e=>e.id===id)).filter(e=>e!==undefined);
  const caveats=[...scenario.assumptions,...scenario.counterEvidence,...scenario.unknowns];
  return <section aria-label="经历依据">
    <p className="prediction-evidence-summary">{scenario.probabilityReason}</p>
    <p className="prediction-evidence-estimate">{scenarioProbability(scenario)} · {confidence[scenario.confidence]}{scenario.probability!==null && " · 五年内的主观估计"}</p>
    {scenario.probabilityBasis === "conditional" && <p className="prediction-evidence-condition">成立条件：{scenario.probabilityCondition}</p>}
    {caveats.length>0 && <details className="prediction-caveats"><summary>什么会改变这个判断</summary>{caveats.map((text,i)=><p key={i}>{text}</p>)}</details>}
    <details className="prediction-evidence-sources"><summary>查看原文 · {evidence.length} 条</summary>
      <ol className="prediction-clues">{evidence.map(e=><li key={e.id} className="prediction-source">
        <h3>{e.cue}</h3><blockquote>{e.quote}</blockquote>
        {e.pageId==="prediction-input/current"?<span>本次补充</span>:<Link to={pageHref(e.pageId)} state={{returnTo:"/predict-self",returnLabel:"返回看见未来"}}>{e.pageId.split("/").pop()} →</Link>}
      </li>)}</ol>
    </details>
  </section>;
}
