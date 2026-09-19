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
  return <section className="prediction-lock" aria-labelledby="prediction-lock-heading" aria-busy={scanning}>
    {scanned ? <div className="prediction-ring" role="progressbar" aria-label="对你的了解程度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="70" />
        <circle cx="80" cy="80" r="70" pathLength="100" strokeDasharray={`${progress} 100`} visibility={progress === 0 ? "hidden" : undefined} />
      </svg>
      <div aria-hidden="true"><b>{progress}%</b><span>对你的了解程度</span></div>
    </div> : <svg className="prediction-lock-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="11" y="21" width="26" height="21" rx="4" />
      <path d="M16 21v-7a8 8 0 0 1 16 0v7M24 29v5" strokeLinecap="round" />
    </svg>}
    <h2 id="prediction-lock-heading">{scanned ? "再了解你一点，就能打开" : "看见未来，尚未解锁"}</h2>
    <p>{scanned
      ? `了解程度达到 ${score.threshold}% 后解锁。补充文档，让我更了解你的经历和选择，再重新扫描。`
      : "还没有扫描过你的资料。点击「扫描了解程度」，看看我们已经了解了多少。"}</p>
    <div className="prediction-lock-actions">
      {scanned && <Link className="prediction-cta" to="/sources">补充文档 →</Link>}
      <button className={scanned ? "prediction-refresh" : "prediction-cta"} type="button" disabled={busy} onClick={scan}>
        {scanning ? "正在扫描…" : scanned ? "重新扫描" : "扫描了解程度"}
      </button>
    </div>
    {scanning && <p role="status">正在阅读资料，完成后会更新了解程度。{scanned && "当前显示上次扫描结果。"}</p>}
  </section>;
}
