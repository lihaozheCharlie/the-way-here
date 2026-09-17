import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PredictionBranch, PredictionDomain, PredictionOutcome, PredictionReport, PredictionView, PredictionThoughtKind, UnderstandingScore } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { pageHref } from "../../shared/routing";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent } from "../collaboration/model";
import "./predictions.css";
import { LifeScenarios } from "./LifeScenarios";
import { TextArea } from "../../shared/form-controls";

const confidenceLabels = { low: "证据有限", medium: "有一定依据", high: "依据较充分" };
export function Understanding({ score, scan, busy }: { score: UnderstandingScore; scan?: () => void; busy?: boolean }) {
  return <section className="prediction-score"><button className="prediction-refresh" type="button" onClick={scan} disabled={busy}>{score.scanStatus === "running" ? "正在扫描 Wiki…" : score.scannedAt ? "重新扫描" : "扫描 Wiki 了解度"}</button>
    <p>{score.scannedAt ? `上次扫描：${new Date(score.scannedAt).toLocaleString("zh-CN")}` : "尚未扫描。让 AI 阅读 Wiki，评估对你的了解是否足够。"}</p>
    {score.stale && <p>资料已有变化，可以重新扫描。</p>}{score.error && <p role="alert">{score.error}</p>}
    <details><summary>{score.scannedAt ? `了解程度 ${score.score} / 100 · 查看依据` : "了解度如何评估"}</summary>
    <p>这是资料覆盖程度，不是对你的评价，也不代表预测准确率。AI 根据 Wiki 内容的具体程度、覆盖和依据评估，达到 {score.threshold} 分开启预测，不要求多年记录。</p>
    {score.facets.map(facet => <div className="prediction-facet" key={facet.id}><span>{facet.label}</span><meter min={0} max={facet.max} value={facet.value} aria-label={facet.label} /><span>{facet.value} / {facet.max}</span>{facet.reason && <details className="prediction-facet-detail"><summary>查看判断与缺口</summary><p>{facet.reason}</p>{facet.gaps?.map((gap,i)=><p key={i}>{gap}</p>)}{facet.evidence?.map((e,i)=><blockquote key={i}>{e.quote} <Link to={pageHref(e.pageId)}>查看 Wiki 依据 →</Link></blockquote>)}</details>}</div>)}
    </details></section>;
}

export function PredictionContent({ view, refresh, busy, scan }: { view: PredictionView; refresh: (thoughts: string, kind: PredictionThoughtKind) => void; busy: boolean; scan?: () => void }) {
  const locked = !view.understanding.unlocked;
  const [thoughts, setThoughts] = useState(view.thoughts || "");
  const [thoughtKind, setThoughtKind] = useState<PredictionThoughtKind>(view.thoughtKind || "update");
  const [dismissedChange, setDismissedChange] = useState<string>();

  const thoughtsInput = useRef<HTMLTextAreaElement>(null);
  const maximum = 4000;
  const generating = busy || view.status === "running" || view.understanding.scanStatus === "running";
  const canPredict = !locked;
  const submit = () => refresh(thoughts, thoughtKind);
  return <div className="prediction-page">
    <header className="prediction-header"><div><h1>看见未来</h1><p>基于过去的选择和习惯，看看未来可能通向的几条路。</p></div>
      <button type="button" className="prediction-refresh" disabled={generating || !canPredict} onClick={submit}>{view.understanding.scanStatus === "running" ? "扫描中…" : generating ? "正在预测…" : view.report ? "重新预测" : "看见未来"}</button>
    </header>
    {view.report && <button type="button" className="prediction-feedback-jump" onClick={()=>{thoughtsInput.current?.scrollIntoView({block:"center",behavior:"auto"});thoughtsInput.current?.focus({preventScroll:true});}}>写下你的想法 ↓</button>}
    {view.stale && view.status !== "failed" && !view.error && (!dismissedChange || dismissedChange !== (view.changeToken || "changed")) && view.status !== "running" && <aside className="prediction-update" role="status"><div><strong>{locked ? "请先扫描了解度，再更新预测" : "有更新，可以重新预测了"}</strong><p>资料或预测规则已发生变化，可能影响原来的判断。</p></div><button type="button" className="prediction-refresh" disabled={generating} onClick={locked ? scan : submit}>{locked ? "扫描了解度" : "重新预测"}</button><button type="button" className="prediction-dismiss" onClick={() => setDismissedChange(view.changeToken || "changed")}>暂时不用</button></aside>}
    {view.status === "running" && <p className="prediction-notice" role="status">正在结合记录和你的想法梳理可能的路径。{view.report ? "你可以先阅读上一版。" : "完成后会显示在这里。"}</p>}
    {view.error && <p className="prediction-notice prediction-error" role="alert">这次预测没有完成：{view.error}。{view.report ? "当前展示的是上次成功生成的旧版，尚未更新。" : "请重新预测。"}</p>}
    {view.report ? view.report.version === 5 ? <LifeScenarios key={view.generatedAt} report={view.report} /> : <><p className="prediction-notice">这是上次的旧版预测。重新预测后，将展示统一的四维生活情景。</p><PredictionExplorer key={view.generatedAt} report={view.report} /></> : view.status !== "running" && <section className="prediction-empty"><h2>{locked ? "先看看 Wiki 对你的了解" : "可以开始第一次预测了"}</h2><p>扫描会说明已经了解什么、还缺哪些内容。补充 Wiki 后可以再次扫描。</p>{locked && <Link className="prediction-cta" to="/sources">添加一篇记录 →</Link>}</section>}
    {!view.report && <Understanding score={view.understanding} scan={scan} busy={generating} />}
    <section className="prediction-feedback" aria-labelledby="prediction-feedback-heading">
      <h2 id="prediction-feedback-heading"><label htmlFor="prediction-thoughts">说说你喜欢什么，想成为什么样的人</label></h2>
      <p>不必是完整的想法，一句话也可以。你说得越具体，预测就越能贴近你想要的生活。</p>
      <TextArea ref={thoughtsInput} id="prediction-thoughts" rows={4} maxLength={maximum} value={thoughts} disabled={generating} onChange={event => {setThoughts(event.target.value);setThoughtKind("update");}} placeholder="比如：我最近做产品原型时特别投入，很喜欢那种感觉；比起稳定，我更想成为一个不后悔自己选择的人……" />
      {locked && <p className="prediction-input-help">先扫描 Wiki 了解度，达到 {view.understanding.threshold} 分后可结合想法预测。</p>}
      <div className="prediction-thoughts-footer"><p>与已有记录一起用于预测，可修改或清空。<br/>不会写入原始记录。 · {thoughts.length} / {maximum}</p><button className="prediction-cta" type="button" disabled={generating || !canPredict} onClick={submit}>{view.understanding.scanStatus === "running" ? "扫描中…" : generating ? "正在预测…" : view.report ? "保存想法，更新预测" : "开始第一次预测"}</button></div>
    </section>
    {view.generatedAt && <p className="prediction-date">更新于 {new Date(view.generatedAt).toLocaleString("zh-CN")} · 根据当时的记录与想法生成</p>}
    <p className="prediction-footnote">这是当前轨迹投出的影子。你的选择变了，它也会跟着变。</p>
  </div>;
}

export function PredictionExplorer({ report }: { report: PredictionReport }) {
  const [domainId, setDomainId] = useState(report.domains[0]?.id);
  const domain = report.domains.find(item => item.id === domainId)!;
  return <>
    <div className="prediction-domains" role="group" aria-label="预测领域">{report.domains.map(item => <button type="button" key={item.id} aria-pressed={domainId === item.id} onClick={() => setDomainId(item.id)}>{item.title}</button>)}</div>
    <p className="prediction-horizon">{report.horizon} · 情景概率（估计）· 下一级为所选路线内的概率</p>
    <DomainTree key={domain.id} domain={domain} />
    <details className="prediction-cross"><summary>这些概率怎么看</summary><p>百分比是依据当前资料、在所列情景范围内的主观估计。每组路线合计 100%；下一级是在所选路线中两种走势的条件分配。它不包含未列出的变化，也不是经统计验证的发生率。依据充分程度另外标注。</p></details>
  </>;
}

function DomainTree({ domain }: { domain: PredictionDomain }) {
  const [branchIndex, setBranchIndex] = useState(0);
  const [outcomeIndex, setOutcomeIndex] = useState(0);
  const branch = domain.branches[branchIndex];
  const outcome = branch?.outcomes[outcomeIndex];
  const count = domain.branches.length;
  const center = (i: number, n: number) => {
    const gap = 17.5;
    const width = (700 - gap * (n - 1)) / n;
    return width / 2 + i * (width + gap);
  };
  const x = (i: number) => center(i, count);
  return <section aria-label={`${domain.title}的未来路径`}>
    {!branch ? <div className="prediction-empty"><h2>这一面，还需要多了解一些</h2><p>{domain.current}</p>{domain.gaps.map((gap, i) => <p key={i}>{gap}</p>)}<Link to="/sources">补充相关经历 →</Link></div> : <>
      <div className="prediction-tree">
        <div className="prediction-root"><b>现在的你</b><span>{domain.current}</span></div>
        <svg className="prediction-top-lines" viewBox="0 0 700 120" preserveAspectRatio="none" aria-hidden="true">{domain.branches.map((item, i) => <path key={i} data-tone={i === 1 ? "bold" : "growth"} style={{ strokeWidth: 2 + item.probability * .15 }} className={branchIndex === i ? "selected" : ""} d={`M350 0 C350 62 ${x(i)} 60 ${x(i)} 120`} />)}</svg>
        <div className="prediction-branches" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>{domain.branches.map((item, i) => <button type="button" key={i} data-tone={i === 1 ? "bold" : "growth"} title={item.probabilityReason} aria-pressed={branchIndex === i} onClick={() => { setBranchIndex(i); setOutcomeIndex(0); }}><span className="prediction-pct">{item.probability}%</span><b>{item.title}</b></button>)}</div>
        {/* Separate connector band ends exactly at the top of the outcome row; card height never stretches the curves. */}
        <svg className="prediction-fork-lines" viewBox="0 0 700 88" preserveAspectRatio="none" aria-hidden="true">{branch.outcomes.map((item, i) => { const end = center(i, branch.outcomes.length); return <g key={i} data-tone={i === 0 ? "growth" : "caution"} className={outcomeIndex === i ? "selected" : ""}><path style={{ strokeWidth: 1.5 + item.probability * .025 }} d={`M${x(branchIndex)} 0 C${x(branchIndex)} 44 ${end} 44 ${end} 88`} /><circle cx={end} cy="85" r="3" /></g>; })}</svg>
        <div className="prediction-outcomes" style={{ gridTemplateColumns: `repeat(${branch.outcomes.length}, minmax(0, 1fr))` }}>{branch.outcomes.map((item, i) => <button type="button" key={i} data-tone={i === 0 ? "growth" : "caution"} title={item.probabilityReason} aria-pressed={outcomeIndex === i} onClick={() => setOutcomeIndex(i)}>
          <span className="prediction-pct">{item.probability}%</span><b>{item.title}</b><span className="prediction-ledger-scale">影响力弱 → 强</span>
          {item.factors.map((factor, j) => <span className={`prediction-factor ${factor.direction}`} key={j}>
            <svg className="prediction-factor-icon" viewBox="0 0 12 12" role="img" aria-label={factor.direction === "support" ? "助力" : "阻力"}><path d={factor.direction === "support" ? "M6 2 11 10H1Z" : "M1 2H11L6 10Z"} /></svg>
            <span className="prediction-factor-text">{factor.label}</span><span className="prediction-factor-track" role="meter" aria-label={`${factor.label}的相对影响`} aria-valuemin={0} aria-valuemax={3} aria-valuenow={factor.strength} aria-valuetext={["弱", "中", "强"][factor.strength - 1]}><i style={{ width: `${factor.strength / 3 * 100}%` }} /></span>
          </span>)}
        </button>)}</div>
      </div>
      <p className="prediction-tree-hint">{branch.choice}</p>
      {outcome && <OutcomeDetail key={`${branchIndex}-${outcomeIndex}`} outcome={outcome} branch={branch} domainTitle={domain.title} />}
      <details className="prediction-cross"><summary>展开当前处境</summary><p>{domain.currentDetail}</p></details>
      {domain.gaps.length > 0 && <details className="prediction-cross"><summary>这一面还有哪些未知</summary>{domain.gaps.map((gap, i) => <p key={i}>{gap}</p>)}</details>}
    </>}
  </section>;
}

export function OutcomeDetail({ outcome, branch, domainTitle }: { outcome: PredictionOutcome; branch: PredictionBranch; domainTitle: string }) {
  const [stage, setStage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  function navigate(next: number) {
    setStage(next);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  return <article className="prediction-detail">
    <header className="prediction-detail-head"><h2 ref={heading} tabIndex={-1}>{outcome.title}</h2><span>{stage} / 3</span></header>
    <nav className="prediction-steps" aria-label="阅读步骤">{["未来图景", "经历依据", "尝试行动"].map((label, i) => <button key={label} type="button" aria-current={stage === i + 1 ? "step" : undefined} onClick={() => navigate(i + 1)}>{label}{i === 1 ? ` · ${outcome.evidence.length}` : ""}</button>)}</nav>
    <div className="prediction-stage" key={stage}>
      {stage === 1 && <section aria-label="未来图景">
        <p className="prediction-detail-summary">{outcome.summary}</p>
        <p className="prediction-day">{branch.dailyLife}</p>
        <p className="prediction-choice"><b>这条路的取舍</b>{branch.choice}</p>
      </section>}
      {stage === 2 && <section aria-label="经历依据">
        <p className="prediction-reason">{branch.summary}</p>
        <details className="prediction-probability-reason"><summary>为什么估计为 {branch.probability}% → {outcome.probability}%</summary><p>这条路线：{branch.probabilityReason}</p><p>这条路线下的结果：{outcome.probabilityReason}</p><p>依据充分程度：{confidenceLabels[outcome.confidence]}</p></details>
        <ol className="prediction-clues">{outcome.evidence.map((evidence, i) => <li key={i}>
          <h3>{evidence.cue}</h3><p>{evidence.interpretation}</p>
          <details className="prediction-source"><summary>查看原话 · {evidence.pageId === "prediction-input/current" ? "本次补充的想法" : evidence.pageId.split("/").pop()?.replace(/\.md$/, "")}</summary><blockquote>{evidence.quote}</blockquote>{evidence.pageId !== "prediction-input/current" && <Link to={pageHref(evidence.pageId)} state={{ returnTo: "/predict-self", returnLabel: "返回看见未来" }}>打开完整记录 →</Link>}</details>
        </li>)}</ol>
        <details className="prediction-caveats"><summary>哪些线索还不足以确定</summary>{outcome.counterEvidence.map((text, i) => <p key={i}>{text}</p>)}{outcome.unknowns.map((text, i) => <p key={i}>{text}</p>)}<h3>影响这个结果的因素</h3>{outcome.factors.map((factor,i) => <p key={i}><b>{factor.label}：</b>{factor.mechanism}</p>)}</details>
      </section>}
      {stage === 3 && <section aria-label="尝试行动">
        <ol className="prediction-actions">{outcome.actions.map((action, i) => <li key={i}><h3>{action.action}</h3><p>留意：{action.observation}</p><span>{action.reviewAfter}回看</span></li>)}</ol>
        <details className="prediction-caveats"><summary>还需要具备的条件</summary><ul>{outcome.conditions.map((text,i) => <li key={i}>{text}</li>)}</ul></details>
        <button className="prediction-cta" type="button" onClick={() => openContextAgent({ mode: "read", prompt: `我正在看「看见未来 / ${domainTitle} / ${branch.title} / ${outcome.title}」。这是待验证的情景。请结合当前知识库与我讨论它是否适合我，并核对依据。情景：${outcome.summary}\n取舍：${branch.choice}\n未知：${outcome.unknowns.join("；")}\n依据页面：${outcome.evidence.map(e => e.pageId).join("；")}` })}>和 ta 聊聊这条路 →</button>
      </section>}
    </div>
    <footer className="prediction-stage-controls">{stage > 1 ? <button type="button" className="prediction-next" onClick={() => navigate(stage - 1)}>← {stage === 2 ? "返回图景" : "返回依据"}</button> : <span />} {stage < 3 && <button type="button" className="prediction-next" onClick={() => navigate(stage + 1)}>{stage === 1 ? "看看经历依据 →" : "可以先做什么 →"}</button>}</footer>
  </article>;
}

export function Predictions({ revision, knowledgeBaseId }: { revision: number; knowledgeBaseId: string }) {
  const [localRevision, setLocalRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const { data, error } = useApi<PredictionView>(`/api/predictions?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`, localRevision);
  useEffect(() => {
    const events = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout>;
    const refreshView = () => { clearTimeout(timer); timer = setTimeout(() => setLocalRevision(value => value + 1), 300); };
    for (const event of ["open", "prediction", "index", "file"]) events.addEventListener(event, refreshView);
    return () => { clearTimeout(timer); events.close(); };
  }, []);
  useEffect(() => {
    if (data?.status !== "running" && data?.understanding.scanStatus !== "running" && !busy) return;
    const timer = window.setInterval(() => setLocalRevision(value => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [data?.status, data?.understanding.scanStatus, busy]);
  async function refresh(thoughts: string, scanning = false, thoughtKind: PredictionThoughtKind = "update") {
    setBusy(true); setRequestError("");
    try { await api(scanning ? "/api/predictions/scan" : "/api/predictions/refresh", { method: "POST", body: JSON.stringify({ knowledgeBaseId, thoughts, thoughtKind }) }); setLocalRevision(value => value + 1); }
    catch (reason: any) { setRequestError(reason.message); }
    finally { setBusy(false); }
  }
  if (!data || data.knowledgeBaseId !== knowledgeBaseId) return <div className="prediction-page" role={error ? "alert" : "status"}><h1>看见未来</h1><p>{error || "正在整理对你的了解…"}</p>{error && <button onClick={() => setLocalRevision(value => value + 1)}>重试</button>}</div>;
  return <>{(requestError || error) && <p role="alert">{requestError || error}</p>}<PredictionContent key={knowledgeBaseId} view={data} busy={busy} scan={() => void refresh("", true)} refresh={(thoughts,kind) => void refresh(thoughts,false,kind)} /><ContextualAgentDock revision={revision} context={{ scope: "看见未来", title: "聊聊未来的可能性", summary: data.report?.summary || "从真实经历聊起，慢慢理解你想成为的人。", defaultMode: "read", launcherLabel: "聊聊这些可能性", compactLauncher: true, suggestions: ["这条预测里有哪些假设还需要我补充？", "我想说说自己想成为什么样的人。"] }} /></>;
}
