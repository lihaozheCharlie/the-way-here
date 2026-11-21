import { useEffect, useRef, useState } from "react";
import type { DreamCitation, DreamCollection, DreamFinding, DreamRun } from "@the-way-here/shared";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { pageHref } from "../../shared/routing";
import { openContextAgent } from "../collaboration/model";
import { DreamCrumb, DreamHeading } from "./DreamInputs";
import { dreamLanes, dreamParagraphs, dreamTitle, pointKey, spaceDreamNodes, type PathNode } from "./dream-model";

const verdicts: Record<DreamFinding["verdict"], string> = { supported: "已印证", partial: "部分印证", unknown: "无法验证", contradicted: "被现实纠正" };
const colors = ["var(--accent-hover)", "var(--warm-ink)", "var(--ink-soft)", "var(--category-violet)"];
const evidenceKey = (cite: DreamCitation) => JSON.stringify([cite.pageId, cite.line, cite.quote]);

function FindingBadge({ verdict }: { verdict: DreamFinding["verdict"] }) {
  return <span className={`dream-status ${verdict}`}>{verdicts[verdict]}</span>;
}

export function DreamFork({ count = 3, animate = false }: { count?: number; animate?: boolean }) {
  const paths = Math.max(1, Math.min(count, 4));
  return <svg className={animate ? "dream-fork dream-fork-live" : "dream-fork"} viewBox="0 0 700 150" aria-hidden="true">
    <path d="M35 75H230" stroke={colors[0]} />
    {Array.from({ length: paths }, (_, i) => {
      const y = paths === 1 ? 75 : 28 + (94 / (paths - 1)) * i;
      return <path key={i} d={`M230 75C293 75 295 ${y} 360 ${y}H665`} stroke={colors[i]} strokeDasharray={i ? "6 7" : undefined} />;
    })}
    <circle cx="230" cy="75" r="7" fill={colors[1]} />
  </svg>;
}

function Evidence({ items, run }: { items: DreamCitation[]; run: DreamRun }) {
  const location = useLocation();
  if (!items.length) return null;
  const unique = [...new Map(items.map(item => [evidenceKey(item), item])).values()];
  return <ul className="dream-evidence">{unique.map((cite, i) => <li key={cite.pageId + cite.line + i}>
    {cite.pageId.startsWith("dream-") ? <b>你的自述</b> :
      <Link to={pageHref(cite.pageId)} state={{ returnTo: "/dreams/" + run.id + location.search, returnLabel: "返回梦境" }}>{cite.pageId.split("/").at(-1)} · 第 {cite.line} 行</Link>}
    {cite.date && <time className="dream-cite-date" dateTime={cite.date}>{cite.date}</time>}<p>「{cite.quote}」</p>
  </li>)}</ul>;
}

function PathExplorer({ run, fork, correct }: { run: DreamRun; fork: (node: PathNode) => void; correct: (node: PathNode) => void }) {
  const report = run.report!;
  const lanes = dreamLanes(run, report);
  const start = run.point.decisionAt.earliest;
  const end = run.until ?? run.finishedAt?.slice(0, 10) ?? run.createdAt.slice(0, 10);
  const startYear = Number(start.slice(0, 4));
  const years = [...new Set([startYear, Math.max(startYear, Number(end.slice(0, 4))),
    ...lanes.flatMap(lane => lane.nodes.flatMap(node => node.year ? [node.year] : []))])].sort((a,b) => a-b);
  const [hidden, setHidden] = useState<string[]>([]);
  const [query, setQuery] = useSearchParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const active = lanes.filter(lane => !hidden.includes(lane.id));
  const hasUndated = active.some(lane => lane.nodes.some(node => node.year === undefined));
  const selected = active.flatMap(lane => lane.nodes).find(node => node.id === query.get("node"));
  const selectedId = selected?.id;
  const yearParam = query.get("year");
  const displayedYear = yearParam === "undated" && hasUndated ? undefined :
    years.find(value => String(value) === yearParam) ?? years[0];
  function setSelection(year?: number, node?: PathNode) {
    setQuery(current => {
      const next = new URLSearchParams(current);
      next.set("year", String(year ?? "undated"));
      if (node) next.set("node", node.id); else next.delete("node");
      return next;
    }, { replace: true, preventScrollReset: true });
  }
  function revealInspector() {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function openNode(node: PathNode, trigger: HTMLElement | SVGElement) {
    triggerRef.current = trigger;
    if (selectedId === node.id) revealInspector();
    else setSelection(node.year, node);
  }
  useEffect(() => {
    if (!selectedId) return;
    const frame = requestAnimationFrame(revealInspector);
    return () => cancelAnimationFrame(frame);
  }, [selectedId]);
  const baseline = 64 + Math.ceil((lanes.length - 1) / 2) * 60;
  const chartHeight = baseline + Math.floor((lanes.length - 1) / 2) * 60 + 46;
  const firstDay = Date.parse(start);
  const duration = Math.max(86400000, Date.parse(end) - firstDay);
  const left = 200, right = 748;
  const datedX = (date: string) => left + (right - left) * Math.max(0, Math.min(1, (Date.parse(date) - firstDay) / duration));
  const reviewEvidence = selected?.entry?.review.evidence ?? [];
  const basis = selected?.entry?.basis.filter(item => !reviewEvidence.some(cite => evidenceKey(cite) === evidenceKey(item))) ?? [];
  return <section className="dream-section">
    <h2>人生路径</h2>
    <div className="dream-path-layout">
    <div className="dream-map dream-panel">
      <div className="dream-filters">{lanes.map((lane, index) => <button style={{ "--path-color": colors[index] } as React.CSSProperties} key={lane.id} className="dream-lane" aria-pressed={!hidden.includes(lane.id)} onClick={() => {
        const visible = !hidden.includes(lane.id);
        if (visible && active.length <= 1) return;
        setHidden(current => visible ? [...current, lane.id] : current.filter(id => id !== lane.id));
        if (visible && lane.nodes.some(node => node.id === selectedId)) setSelection(displayedYear);
      }} aria-label={index ? `梦 ${String.fromCharCode(64 + index)} · ${lane.title}` : lane.title}>
        {index ? `梦 ${String.fromCharCode(64 + index)} · ` : ""}{lane.title}
      </button>)}</div>
      {run.point.actualChoice && <p className="dream-real-choice"><b>现实选择</b>　{run.point.actualChoice}</p>}
      <div className="dream-chart-scroll"><svg className="dream-chart" viewBox={`0 0 810 ${chartHeight}`} aria-label="人生路径图">
        <path d={`M25 ${baseline}H106`} stroke={colors[0]} strokeWidth="3" />
        {years.map(tick => <line key={tick} x1={datedX(`${tick}-01-01`)} x2={datedX(`${tick}-01-01`)} y1="26" y2={chartHeight - 25} stroke={tick === displayedYear ? "var(--record-selection-line)" : "var(--line)"} strokeDasharray="4 6" />)}
        {lanes.map((lane, i) => {
          const y = baseline + 60 * Math.ceil(i / 2) * (i % 2 ? -1 : 1);
          const dim = hidden.includes(lane.id);
          const positions = spaceDreamNodes(lane.nodes.map(node => node.year ? datedX(node.date ?? `${node.year}-07-01`) : undefined), left, right, 57);
          return <g key={lane.id} opacity={dim ? .19 : 1}>
            <path d={`M106 ${baseline}C145 ${baseline} 148 ${y} 180 ${y}H772`} fill="none" stroke={colors[i]} strokeWidth="2.8" strokeDasharray={i ? "5 6" : undefined} />
            {lane.nodes.map((node, n) => {
              const verdict = node.entry?.review.verdict;
              const r = selected?.id === node.id ? 10 : 8;
              const fill = verdict === "unknown" || verdict === "partial" ? "var(--paper)" : colors[i];
              const x = positions[n]!;
              const spaced = positions.every((other, idx) => idx === n || Math.abs(other - x) >= 92);
              return <g key={node.id} className="dream-chart-node" transform={`translate(${x} ${y})`} role={dim ? undefined : "button"} aria-label={dim ? undefined : lane.title + " · " + node.label} tabIndex={dim ? undefined : 0}
                aria-description={verdict ? verdicts[verdict] : "真实记录"}
                aria-pressed={dim ? undefined : selectedId === node.id} onClick={dim ? undefined : event => openNode(node, event.currentTarget)}
                onKeyDown={event => { if (!dim && ["Enter", " "].includes(event.key)) { event.preventDefault(); openNode(node, event.currentTarget); } }}>
                <title>{node.label}</title><circle className="dream-chart-hit" r="24" fill="transparent" />
                {verdict === "contradicted" ? <rect x="-6" y="-6" width="12" height="12" rx="2" fill="var(--paper)" stroke={colors[i]} strokeWidth="2.5" transform="rotate(45)" /> :
                  <circle r={r} fill={fill} stroke={colors[i]} strokeWidth="2.5" />}
                {verdict === "partial" && <path d={`M0 -${r} A${r} ${r} 0 0 1 0 ${r} Z`} fill={colors[i]} />}
                {verdict === "supported" && <path d="M-3 0L-1 2L3 -2" stroke="var(--paper)" strokeWidth="1.5" fill="none" />}
                {!dim && spaced && <text y="-15" textAnchor="middle" className="dream-chart-caption" aria-hidden="true">{node.label.length > 10 ? node.label.slice(0, 10) + "…" : node.label}</text>}
              </g>;
            })}
          </g>;
        })}
        <circle cx="106" cy={baseline} r="8" fill={colors[1]} /><text x="88" y={baseline - 21}>入梦点</text>
      </svg></div>
      <div className="dream-segment dream-years" aria-label="年份">{[...years, ...(hasUndated ? [undefined] : [])].map(tick =>
        <button key={tick ?? "undated"} aria-pressed={displayedYear === tick} onClick={() => setSelection(tick)}>{tick ?? "时间未标注"}</button>)}</div>
      <div className="dream-slices"><b>{displayedYear ?? "时间未标注"}</b>{active.map(lane => {
        const nodes = lane.nodes.filter(node => node.year === displayedYear);
        return <div key={lane.id}><strong>{lane.title}</strong>{nodes.length ? nodes.map(node => <button key={node.id} className="dream-slice-node" aria-pressed={selectedId === node.id} onClick={event => openNode(node, event.currentTarget)}>
          <b>{node.label}</b><span>{node.text}</span>
        </button>) : <small>{lane.nodes.length ? "这一年没有单独的节点" : "这条路暂缺可展示的节点"}</small>}</div>;
      })}</div>
    </div>
    <div className="dream-panel dream-node-inspector">
      {selected ? <><div className="dream-heading"><h3 ref={headingRef} tabIndex={-1}>{selected.label}</h3><button className="dream-ghost" onClick={() => {
        setSelection(displayedYear);
        if (triggerRef.current?.isConnected) triggerRef.current.focus();
      }}>返回说明</button></div>
        {selected.date && <time dateTime={selected.date}>{selected.date}</time>}
        {dreamParagraphs(selected.text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {selected.entry?.condition && <p className="dream-muted">{selected.entry.condition}</p>}
        {(selected.entry || selected.evidence?.length) && <details key={selected.id} className="dream-version">
          <summary>查看依据与核对</summary>
          {selected.entry && <><FindingBadge verdict={selected.entry.review.verdict} /><p>{selected.entry.review.text}</p></>}
          <Evidence run={run} items={selected.evidence ?? reviewEvidence} />
          {!!basis.length && <><h4>推演时的依据</h4><Evidence run={run} items={basis} /></>}
        </details>}
        <div className="dream-actions">{selected.entry && <button onClick={() => fork(selected)}>以这个节点再梦一次</button>}<button onClick={() => correct(selected)}>我觉得不对，补充一下</button></div>
      </> : <p className="dream-muted">点一个节点，看看那时你会怎么做。实线是现实，虚线是梦里的路。</p>}
    </div>
    </div>
  </section>;
}

export function DreamDetail({ run, previous, previousMissing, collection, busy, favorite, rerun, save, fork, correct }: {
  run: DreamRun; previous?: DreamRun; previousMissing: boolean; collection: DreamCollection; busy: boolean; favorite: () => void; rerun: () => void;
  save: (key: number) => void; fork: (node: PathNode) => void; correct: (node?: PathNode) => void;
}) {
  const report = run.report!;
  const title = dreamTitle(run);
  const [confirm, setConfirm] = useState<number>();
  const nodes = report.branches.flatMap(branch => branch.timeline);
  const corrected = nodes.filter(node => node.review.verdict === "contradicted");
  const saved = collection.favorites.includes(run.id);
  const reviewedCount = nodes.filter(node => node.review.verdict !== "unknown" && node.review.evidence.length).length;
  const validated = report.verification !== "unreviewed" && reviewedCount > 0;
  const hits = report.backtest?.filter(item => item.review.verdict === "supported").length ?? 0;
  const confidence = !validated ? "未核对" : reviewedCount < nodes.length / 2 ? "中低"
    : reviewedCount >= 3 && report.backtest?.length && hits >= 2 && hits > report.backtest.length / 2 ? "较高" : "中";
  const takeaways = validated ? report.takeaways ?? [] : [];
  const isFork = previous && pointKey(previous.point.source) !== pointKey(run.point.source);
  const prior = !isFork ? previous?.report : undefined;
  const branchNames = new Set(report.branches.map(branch => branch.title));
  const priorNames = new Set(prior?.branches.map(branch => branch.title) ?? []);
  const added = [...branchNames].filter(title => !priorNames.has(title));
  const removed = [...priorNames].filter(title => !branchNames.has(title));
  const updated = prior ? report.branches.flatMap(branch => {
    const old = prior.branches.find(item => item.title === branch.title);
    if (!old) return [];
    return branch.timeline.flatMap(entry => {
      const before = old.timeline.find(item => item.horizon === entry.horizon);
      if (!before) return [{ branch: branch.title, node: entry.horizon, detail: "本版新增节点" }];
      if (before.review.verdict !== entry.review.verdict) return [{ branch: branch.title, node: entry.horizon, detail: `${verdicts[before.review.verdict]} → ${verdicts[entry.review.verdict]}` }];
      return before.possibility !== entry.possibility || before.review.revision !== entry.review.revision || before.review.text !== entry.review.text
        ? [{ branch: branch.title, node: entry.horizon, detail: "推演或核对说明有更新" }] : [];
    });
  }) : [];
  const forkChoices = dreamLanes(run, report).slice(1).flatMap(lane => lane.nodes.at(-1) ?? []);
  const talk = (text: string) => openContextAgent({ mode: "read", attachedContext: { topicId: `dream-${run.id}`, title,
    currentUnderstanding: text, reason: "这是从梦境带回来的推演，想结合我的实际情况继续聊。" } });
  return <>
    <DreamCrumb label={title} />
    <DreamHeading title={title}>
      <button disabled={busy} aria-pressed={saved} onClick={favorite}>{saved ? "已收藏" : "收藏"}</button><button onClick={rerun}>再梦一次</button>
      {run.resumable && <Link className="dream-button" to={`/dreams/${run.id}/progress`}>继续核对</Link>}
    </DreamHeading>
    <div className="dream-filters"><span className="dream-status">入梦点 {run.point.decisionAt.earliest}{run.point.decisionAt.latest !== run.point.decisionAt.earliest && ` 至 ${run.point.decisionAt.latest}`}</span>
      {run.until && <span className="dream-status">梦到 {run.until}</span>}
      {nodes.length > 0 && <span className="dream-status">现实与 {report.branches.filter(branch => branch.timeline.length > 0).length} 条假如</span>}
      {!validated && nodes.length > 0 && <span className="dream-status">未核对的梦</span>}
      {run.finishedAt && <time className="dream-muted" dateTime={run.finishedAt}>{new Date(run.finishedAt).toLocaleString()} 醒来</time>}
      {run.previousRunId && (previousMissing ? <small>关联梦境已删除</small> :
        <Link to={`/dreams/${run.previousRunId}`}>{isFork ? "查看来源梦境" : "查看上一版"}</Link>)}</div>
    {(report.summary?.trim() || nodes.length === 0) && <section className="dream-summary">
      <h2>梦境总结</h2>
      {report.summary?.trim() ? dreamParagraphs(report.summary).map((paragraph, index) => <p key={index}>{paragraph}</p>)
        : <p>这次梦没有展开到后来的生活。</p>}
    </section>}
    {nodes.length > 0 && <PathExplorer run={run} fork={fork} correct={correct} />}
    {validated && report.branches.length > 0 && <section className="dream-section"><h2>路径对比</h2>
      <div className="dream-table"><table><thead><tr><th scope="col">对比</th><th scope="col">现实</th>{report.branches.map(branch => <th scope="col" key={branch.id}>{branch.title}</th>)}</tr></thead><tbody>
        {report.comparison?.length ? report.comparison.map((row,i) => <tr key={i}><th scope="row">{row.dimension}</th><td>{row.actual}</td>{report.branches.map(branch => {
          const cell = row.branches.find(item => item.id === branch.id);
          return <td key={branch.id}><p>{cell?.text ?? "暂无对比"}</p></td>;
        })}</tr>) : <tr><th scope="row">路径落点</th><td>{report.actualPath.text}</td>{report.branches.map(branch => {
          const last = branch.timeline.at(-1);
          return <td key={branch.id}><p>{last?.review.revision ?? last?.possibility ?? "暂无推演"}</p></td>;
        })}</tr>}
      </tbody></table></div>
    </section>}
    {report.decision?.trim() && report.decision.trim() !== title && <details className="dream-panel dream-version dream-original">
      <summary>查看原始推演设定</summary>
      {dreamParagraphs(report.decision).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </details>}
    {prior && <details className="dream-panel dream-version"><summary>与上一版的差别</summary>
      {added.length > 0 && <p>本版新增　{added.join("、")}</p>}
      {removed.length > 0 && <p>仅在上一版　{removed.join("、")}</p>}
      {updated.length > 0 && <ul>{updated.map(item => <li key={item.branch + item.node}>{item.branch} · {item.node} · {item.detail}</li>)}</ul>}
      {prior.summary && prior.summary !== report.summary && <><h4>上一版摘要</h4><p>{prior.summary}</p></>}
      {!added.length && !removed.length && !updated.length && prior.summary === report.summary && <p>两版的路径和摘要相同。</p>}
    </details>}
    {validated && <details className="dream-panel dream-version">
      <summary>查看整份梦境的核对</summary>
      <p className="dream-muted">可信度 {confidence}</p>
      {report.unchanged && <p>{report.unchanged}</p>}
      {report.changed && <p>{report.changed}</p>}
      <div className="dream-filters">{Object.entries(verdicts).map(([key,label]) => <span key={key} className={`dream-status ${key}`}>{nodes.filter(n=>n.review.verdict===key).length} {label}</span>)}
        {!!report.backtest?.length && <span className="dream-status">回测命中 {hits}/{report.backtest.length}</span>}</div>
      {!!report.backtest?.length && <details><summary>查看回测依据</summary>{report.backtest.map(({claim,review},i) => <div key={i}><p>{claim}</p><p>{verdicts[review.verdict]} · {review.text}</p><Evidence items={review.evidence} run={run} /></div>)}</details>}
    </details>}
    {(report.branchLimitReason || report.branches.some(branch => branch.gaps.length > 0)) && <details className="dream-panel dream-version">
      <summary>查看推演里的资料缺口</summary>
      {report.branchLimitReason && <p>{report.branchLimitReason}</p>}
      {report.branches.filter(branch => branch.gaps.length > 0).map(branch => <div key={branch.id}><h4>{branch.title}</h4>
        <ul>{branch.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></div>)}
    </details>}
    {validated && corrected.length > 0 && <details className="dream-panel dream-version">
      <summary>查看修正过的节点</summary>
      {corrected.map((entry, i) => <div key={i}><h4>{entry.horizon}</h4>
        {entry.review.revision && <p>{entry.review.revision}</p>}
        <p>原推演　{entry.possibility}</p>
        <p>{entry.review.text}</p><Evidence run={run} items={entry.review.evidence} />
      </div>)}
    </details>}
    <section className="dream-section">{takeaways.length > 0 && <h2>带回现实</h2>}
      {takeaways.map((text,key) => {
        const isSaved = collection.insights.some(item => item.runId === run.id && item.key === key && item.text === text);
        return <div className="dream-panel dream-takeaway" key={key}><p>{text}</p><div className="dream-actions"><button className="dream-primary" onClick={() => talk(text)}>以此聊聊</button>
          <button disabled={isSaved || busy} onClick={() => setConfirm(key)}>{isSaved ? "已收藏为洞察" : "收藏为洞察"}</button></div>
          {confirm === key && !isSaved && <div className="dream-note" role="group" aria-label="确认收藏洞察">以梦境启示的身份保存到「已有理解」。
            <div className="dream-actions"><button disabled={busy} onClick={() => save(key)}>确认收藏</button><button onClick={() => setConfirm(undefined)}>取消</button></div></div>}
        </div>;
      })}
      {forkChoices.length > 0 && <h2 className="dream-fork-heading">从这个梦里再分岔</h2>}
      <div className="dream-actions">{forkChoices.map(node => <button key={node.id} onClick={() => fork(node)}>在「{node.label}」再梦一次</button>)}
        <button onClick={() => correct()}>补充你记得的，重新核对</button></div>
    </section>
  </>;
}
