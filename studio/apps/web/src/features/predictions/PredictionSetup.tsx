import { Link } from "react-router-dom";
import type { UnderstandingScore } from "@the-way-here/shared";
import { pageHref } from "../../shared/routing";

export function PredictionProgress({ score }: { score: UnderstandingScore }) {
  const current = score.scanStatus === "running" || (!score.scannedAt && !score.unlocked) ? 0 : score.unlocked ? 2 : 1;
  return <ol className="prediction-unlock-progress" aria-label="解锁进度">
    {["扫描资料", "了解程度达标", "生成预测"].map((label, index) => <li key={label} data-state={index < current ? "done" : index === current ? "active" : "todo"} aria-current={index === current ? "step" : undefined}>
      <span className="prediction-step-dot" aria-hidden="true">{index < current ? <svg viewBox="0 0 16 16" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.5" /></svg> : index + 1}</span>
      <span>{label}{index < current && <span className="sr-only">（已完成）</span>}</span>
    </li>)}
  </ol>;
}

export function UnderstandingDetails({ score, compact = false }: { score: UnderstandingScore; compact?: boolean }) {
  return <details className={`prediction-assessment${compact ? " is-compact" : ""}`}>
    <summary>{compact ? "查看了解度依据" : "查看四个维度的评估依据"}</summary>
    <div className="prediction-assessment-body">
      {score.facets.map(facet => <div className="prediction-facet" key={facet.id}>
        <span>{facet.label}</span><meter min={0} max={facet.max} value={facet.value} aria-label={facet.label} /><span>{facet.value} / {facet.max}</span>
        {(facet.reason || facet.gaps?.length || facet.evidence?.length) ? <details className="prediction-facet-detail">
          <summary>查看判断与缺口</summary>
          {facet.reason && <p>{facet.reason}</p>}
          {facet.gaps?.map((gap, index) => <p key={index}>{gap}</p>)}
          {facet.evidence?.map((evidence, index) => <blockquote key={index}>{evidence.quote} <Link to={pageHref(evidence.pageId)}>查看 Wiki 依据 →</Link></blockquote>)}
        </details> : null}
      </div>)}
      <p>这是资料覆盖程度，不是对你的评价，也不代表预测准确率；根据各维度的具体内容与依据评估，达到 {score.threshold} 分开启预测，不计入字数或记录条数。</p>
      {score.scannedAt && <p>扫描于 {new Date(score.scannedAt).toLocaleString("zh-CN")}</p>}
      {compact && score.stale && <p>资料已有变化，本次预测将结合最新记录。</p>}
    </div>
  </details>;
}
