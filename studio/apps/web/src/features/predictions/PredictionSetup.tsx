import { Link } from "react-router-dom";
import type { UnderstandingScore } from "@the-way-here/shared";
import { pageHref, returnContextFor } from "../../shared/routing";
import { useI18n } from "../../shared/i18n";

const progressLabels = ["扫描资料", "了解程度达标", "生成预测"] as const;

export function PredictionProgress({ score }: { score: UnderstandingScore }) {
  const { t } = useI18n();
  const current = score.scanStatus === "running" || (!score.scannedAt && !score.unlocked) ? 0 : score.unlocked ? 2 : 1;
  return <ol className="prediction-unlock-progress" aria-label={t("解锁进度")}>
    {progressLabels.map((label, index) => <li key={label} data-state={index < current ? "done" : index === current ? "active" : "todo"} aria-current={index === current ? "step" : undefined}>
      <span className="prediction-step-dot" aria-hidden="true">{index < current ? <svg viewBox="0 0 16 16" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.5" /></svg> : index + 1}</span>
      <span>{t(label)}{index < current && <span className="sr-only">{t("（已完成）")}</span>}</span>
    </li>)}
  </ol>;
}

export function UnderstandingDetails({ score, compact = false }: { score: UnderstandingScore; compact?: boolean }) {
  const { t, locale } = useI18n();
  return <details className={`prediction-assessment${compact ? " is-compact" : ""}`}>
    <summary>{compact ? t("查看了解度依据") : t("查看四个维度的评估依据")}</summary>
    <div className="prediction-assessment-body">
      {score.facets.map(facet => <div className="prediction-facet" key={facet.id}>
        <span>{t(facet.label)}</span><meter min={0} max={facet.max} value={facet.value} aria-label={t(facet.label)} /><span>{facet.value} / {facet.max}</span>
        {(facet.reason || facet.gaps?.length || facet.evidence?.length) ? <details className="prediction-facet-detail">
          <summary>{t("查看判断与缺口")}</summary>
          {facet.reason && <p>{facet.reason}</p>}
          {facet.gaps?.map((gap, index) => <p key={index}>{gap}</p>)}
          {facet.evidence?.map((evidence, index) => <blockquote key={index}>{evidence.quote} <Link to={pageHref(evidence.pageId)} state={returnContextFor("/predict-self")}>{t("查看 Wiki 依据 →")}</Link></blockquote>)}
        </details> : null}
      </div>)}
      <p>{t("这是资料覆盖程度，不是对你的评价，也不代表预测准确率；根据各维度的具体内容与依据评估，达到 ${threshold} 分开启预测，不计入字数或记录条数。", { threshold: score.threshold })}</p>
      {score.scannedAt && <p>{t("扫描于 ${when}", { when: new Date(score.scannedAt).toLocaleString(locale === "en" ? "en" : "zh-CN") })}</p>}
      {compact && score.stale && <p>{t("资料已有变化，本次预测将结合最新记录。")}</p>}
    </div>
  </details>;
}
