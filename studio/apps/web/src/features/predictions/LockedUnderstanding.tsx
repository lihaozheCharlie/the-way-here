import { Link } from "react-router-dom";
import type { UnderstandingScore } from "@the-way-here/shared";
import { useI18n } from "../../shared/i18n";

export function LockedUnderstanding({ score, scan, busy }: {
  score: UnderstandingScore;
  scan?: () => void;
  busy: boolean;
}) {
  const scanned = Boolean(score.scannedAt);
  const scanning = score.scanStatus === "running";
  const progress = Math.min(100, Math.max(0, score.score));
  const gaps = score.facets.filter(facet => facet.gaps?.length);
  const { t } = useI18n();
  const gapSummary = gaps.slice(0, 2).map(facet => t("${label}：${gap}", { label: t(facet.label), gap: facet.gaps![0] })).join(t("；"));
  return <section className="prediction-lock" aria-labelledby="prediction-lock-heading" aria-busy={scanning}>
    {scanned ? <div className="prediction-ring" role="progressbar" aria-label={t("对你的了解程度")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={t("${progress} / 100，目标 ${score.threshold} 分", { progress, "score.threshold": score.threshold })}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="70" />
        <circle cx="80" cy="80" r="70" pathLength="100" strokeDasharray={`${progress} 100`} visibility={progress === 0 ? "hidden" : undefined} />
        <line className="prediction-goal-tick" x1="144" y1="80" x2="157" y2="80" transform={`rotate(${score.threshold * 3.6} 80 80)`} />
      </svg>
      <div aria-hidden="true"><b>{progress}%</b><span>{t("了解程度")}</span></div>
    </div> : <svg className="prediction-lock-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="11" y="21" width="26" height="21" rx="4" />
      <path d="M16 21v-7a8 8 0 0 1 16 0v7M24 29v5" strokeLinecap="round" />
    </svg>}
    <h2 id="prediction-lock-heading">{scanned ? t("材料还不够，目标是 ${threshold} 分", { threshold: score.threshold }) : t("先看看记录够不够，再谈以后")}</h2>
    <p>{scanned
      ? t("${lead}。这不是算命，也不是给你打分。补充相关文档并收进已有理解后，再重新扫描。", { lead: gapSummary || t("目前的资料还不足以支持预测") })
      : t("还没有扫描过资料。点一下开始，我会阅读 Wiki 里健康、工作、娱乐、爱四个维度的记录，看现有材料够不够谈后面的路。这不是算命，也不是对你的评价；材料达到 ${score.threshold} 分才开始推测可能的路。", { "score.threshold": score.threshold })}</p>
    <div className="prediction-lock-actions">
      {scanned && <Link className="prediction-cta" to="/sources">{t("补充文档 →")}</Link>}
      <button className={scanned ? "prediction-refresh" : "prediction-cta"} type="button" disabled={busy} onClick={scan}>
        {scanning ? t("正在扫描…") : scanned ? t("重新扫描") : t("开始扫描")}
      </button>
    </div>
    {score.stale && <p>{t("资料已有变化，可以重新扫描。")}</p>}
    {score.error && <p className="prediction-notice prediction-error" role="alert">{t(score.error)}</p>}
    {scanning && <p role="status">{t("正在阅读资料，完成后会更新了解程度。")}{scanned && t("当前显示上次扫描结果。")}</p>}
  </section>;
}
