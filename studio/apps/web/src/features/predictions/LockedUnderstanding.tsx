import { Link } from "react-router-dom";
import type { UnderstandingScore } from "@the-way-here/shared";

export function LockedUnderstanding({ score, scan, busy }: {
  score: UnderstandingScore;
  scan?: () => void;
  busy: boolean;
}) {
  const scanned = Boolean(score.scannedAt);
  const scanning = score.scanStatus === "running";
  const progress = Math.min(100, Math.max(0, score.score));
  const gaps = score.facets.filter(facet => facet.gaps?.length);
  const gapSummary = gaps.slice(0, 2).map(facet => `${facet.label}：${facet.gaps![0]}`).join("；");
  return <section className="prediction-lock" aria-labelledby="prediction-lock-heading" aria-busy={scanning}>
    {scanned ? <div className="prediction-ring" role="progressbar" aria-label="对你的了解程度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress} / 100，目标 ${score.threshold} 分`}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="70" />
        <circle cx="80" cy="80" r="70" pathLength="100" strokeDasharray={`${progress} 100`} visibility={progress === 0 ? "hidden" : undefined} />
        <line className="prediction-goal-tick" x1="144" y1="80" x2="157" y2="80" transform={`rotate(${score.threshold * 3.6} 80 80)`} />
      </svg>
      <div aria-hidden="true"><b>{progress}%</b><span>了解程度</span></div>
    </div> : <svg className="prediction-lock-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="11" y="21" width="26" height="21" rx="4" />
      <path d="M16 21v-7a8 8 0 0 1 16 0v7M24 29v5" strokeLinecap="round" />
    </svg>}
    <h2 id="prediction-lock-heading">{scanned ? `还差一点，目标是 ${score.threshold} 分` : "先了解你一点，再看见未来"}</h2>
    <p>{scanned
      ? `${gapSummary || "目前的资料还不足以支持预测"}。补充相关文档并收进已有理解后，再重新扫描。`
      : `还没有扫描过资料。点一下开始，我会阅读 Wiki 里健康、工作、娱乐、爱四个维度的记录，评估现在是否足够了解你——这不是对你的评价，达到 ${score.threshold} 分就能开始预测。`}</p>
    <div className="prediction-lock-actions">
      {scanned && <Link className="prediction-cta" to="/sources">补充文档 →</Link>}
      <button className={scanned ? "prediction-refresh" : "prediction-cta"} type="button" disabled={busy} onClick={scan}>
        {scanning ? "正在扫描…" : scanned ? "重新扫描" : "开始扫描"}
      </button>
    </div>
    {score.stale && <p>资料已有变化，可以重新扫描。</p>}
    {score.error && <p className="prediction-notice prediction-error" role="alert">{score.error}</p>}
    {scanning && <p role="status">正在阅读资料，完成后会更新了解程度。{scanned && "当前显示上次扫描结果。"}</p>}
  </section>;
}
