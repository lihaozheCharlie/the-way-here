import { Link } from "react-router-dom";
import type { LifePredictionReport, LifeScenario } from "@the-way-here/shared";
import { pageHref } from "../../shared/routing";
import { useI18n } from "../../shared/i18n";

const confidence = {low:"证据有限",medium:"有一定依据",high:"依据较充分"};
export const scenarioProbability = (s:LifeScenario) => s.probability === null ? "暂不能估计" : `${s.probability}%${s.probabilityBasis === "conditional" ? " · 假设成立时" : ""}`;

export function ScenarioEvidence({report,scenario}:{report:LifePredictionReport;scenario:LifeScenario}) {
  const { t } = useI18n();
  const evidence=scenario.evidenceIds.map(id=>report.evidence.find(e=>e.id===id)).filter(e=>e!==undefined);
  const caveats=[...scenario.assumptions,...scenario.counterEvidence,...scenario.unknowns];
  const estimate = scenario.probability === null ? t("暂不能估计") : `${scenario.probability}%${scenario.probabilityBasis === "conditional" ? t(" · 假设成立时") : ""}`;
  return <section aria-label={t("经历依据")}>
    <p className="prediction-evidence-summary">{scenario.probabilityReason}</p>
    <p className="prediction-evidence-estimate">{estimate} · {t(confidence[scenario.confidence])}{scenario.probability!==null && ` ${t("· 五年内的主观估计")}`}</p>
    {scenario.probabilityBasis === "conditional" && <p className="prediction-evidence-condition">{t("成立条件：")}{scenario.probabilityCondition}</p>}
    {caveats.length>0 && <details className="prediction-caveats"><summary>{t("什么会改变这个判断")}</summary>{caveats.map((text,i)=><p key={i}>{text}</p>)}</details>}
    <details className="prediction-evidence-sources"><summary>{t("查看原文 · ${count} 条", { count: evidence.length })}</summary>
      <ol className="prediction-clues">{evidence.map(e=><li key={e.id} className="prediction-source">
        <h3>{e.cue}</h3><blockquote>{e.quote}</blockquote>
        {e.pageId==="prediction-input/current"?<span>{t("本次补充")}</span>:<Link to={pageHref(e.pageId)} state={{returnTo:"/predict-self",returnLabel:"返回看见未来"}}>{e.pageId.split("/").pop()} →</Link>}
      </li>)}</ol>
    </details>
  </section>;
}
