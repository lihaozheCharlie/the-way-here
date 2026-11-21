import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import type { DreamCollection, DreamEnvironment, DreamPointCandidate, DreamPointDescription, DreamPointInput, DreamRun, DreamRunListItem } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { pageHref } from "../../shared/routing";
import { ConfirmDeleteDialog } from "../../shared/ConfirmDeleteDialog";
import { Icon } from "../../shared/ui";
import { PageAgentContext } from "../desktop/InspectorContext";
import { openContextAgent } from "../collaboration/model";
import { DescribeDream, DreamCrumb, DreamEmpty, DreamHeading, PrepareDream } from "./DreamInputs";
import { DreamDetail, DreamFork } from "./DreamDetail";
import { dreamActive, dreamFinished, dreamTitle, pointInput, pointKey, type PathNode } from "./dream-model";
import "./dreams.css";

type Workspace = { knowledgeBaseId: string; decisions: DreamPointCandidate[]; described: DreamPointCandidate[]; collection: DreamCollection };
const emptyCollection: DreamCollection = { favorites: [], insights: [] };
const statuses: Record<DreamRun["status"], string> = { queued: "等待入梦", running: "做梦中", ready: "已醒来", partial: "部分完成", insufficient: "依据较少", failed: "核对未完成", cancelled: "已停止" };
const phases = [["ground", "钉住 T，封存当时的资料"], ["plan", "规划不同的选择"], ["analyze", "推演各条路径"], ["calibrate", "沿实际选择盲推，用于回测"], ["review", "回到真实时间线核对并整理结果"]] as const;
type Preparation = { point: DreamPointCandidate; environment?: DreamEnvironment; initial?: DreamPointInput; previousRunId?: string; nonce: number; correcting?: boolean };

function Progress({ run, busy, cancel, resume, again }: { run: DreamRun; busy: boolean; cancel: () => void; resume: () => void; again: () => void }) {
  const steps = phases.filter(([phase]) => phase !== "calibrate" || !!run.point.actualChoice && run.environment?.after !== 0)
    .map(([phase, label]) => [phase, phase === "review" && run.environment?.after === 0 ? "整理未核对的推演" : label] as const);
  const index = steps.findIndex(([phase]) => run.phase === phase);
  return <>
    <DreamCrumb label={statuses[run.status]} />
    <section className="dream-progress">
      <span className={`dream-status ${dreamActive(run) ? "supported" : ""}`}>{statuses[run.status]}</span>
      <h1>{dreamTitle(run)}</h1>
      {dreamActive(run) && <p className="dream-progress-intro dream-muted">{run.progress?.total
        ? `推演 ${run.progress.total} 条假如，再核对能查到的记录。` : "正在还原当时的处境。"}</p>}
      <DreamFork animate={dreamActive(run)} count={(run.progress?.total ?? run.point.alternatives?.length ?? 2) + 1} />
      <ol className="dream-phase-list" aria-label="入梦进度">{steps.map(([phase, label], i) => <li key={phase}
        aria-current={i === index && dreamActive(run) ? "step" : undefined}
        data-state={i === index && dreamActive(run) ? "active" : i < index || dreamFinished(run) ? "done" : "waiting"}><span aria-hidden="true" /><div>{label}
        {phase === "ground" && run.environment && <small>{run.environment.before} 条入梦前资料</small>}
        {phase === "review" && !!run.environment?.after && <small>{run.environment.after} 条入梦后资料可供核对</small>}
        {phase === "analyze" && run.progress && <small>已完成 {run.progress.finished} / {run.progress.total} 条</small>}</div></li>)}</ol>
      {run.error && <p className="dream-progress-feed" role="status">{run.error}</p>}
      {!!run.updates?.length && <details className="dream-progress-updates"><summary>梦的片段</summary>
        <ul>{run.updates.map(({ label, text }, i) => <li key={i}><b>{label}</b>　{text}</li>)}</ul>
      </details>}
      <div className="dream-actions">
        <Link className="dream-button" to="/dreams">{dreamActive(run) ? "离开去做别的，醒了通知我" : "返回梦境"}</Link>
        {dreamActive(run) && <button disabled={busy} onClick={cancel}>停止做梦</button>}
        {run.resumable && <button disabled={busy} className="dream-primary" onClick={resume}>继续核对</button>}
        {!dreamActive(run) && !run.report && <button disabled={busy} onClick={again}>重新入梦</button>}
        {!dreamActive(run) && run.report && <Link className="dream-button dream-primary" to={`/dreams/${run.id}`}>醒来</Link>}
      </div>
    </section>
  </>;
}

function Points({ points, described, runs, fresh, discovering, discovery, choose, discover, preferences, prefer, busy, inspect }: {
  points: DreamPointCandidate[]; described: DreamPointCandidate[]; runs: DreamRun[]; fresh: string[];
  discovering: boolean; discovery?: number; choose: (point: DreamPointCandidate) => void; discover: () => void;
  preferences: NonNullable<DreamCollection["pointPreferences"]>; busy: boolean;
  prefer: (key: string, preference: "saved" | "ignored" | null) => void;
  inspect: (point: DreamPointInput) => Promise<DreamEnvironment>;
}) {
  const { search } = useLocation();
  const [tab, setTab] = useState<"stages" | "mine" | "saved" | "ignored">(() => new URLSearchParams(search).get("tab") === "mine" ? "mine" : "stages");
  const [coverage, setCoverage] = useState<Record<string, number | null>>({});
  const inspecting = useRef(new Set<string>());
  const all = [...points, ...described];
  const shown = tab === "stages" ? points.filter(point => preferences[pointKey(point.source)] !== "ignored")
    : tab === "mine" ? described : all.filter(point => preferences[pointKey(point.source)] === tab);
  const groups = new Map<string, { title?: string; points: DreamPointCandidate[] }>();
  if (tab === "stages") {
    for (const point of points) {
      if (point.source.kind === "life-stage") groups.set(point.source.pageId, { title: point.title, points: [] });
    }
    const other = { title: "其他时刻", points: [] as DreamPointCandidate[] };
    for (const point of shown) {
      const stageId = point.source.kind === "life-stage" ? point.source.pageId : point.stageId;
      const group = stageId ? groups.get(stageId) : undefined;
      (group ?? other).points.push(point);
    }
    groups.set("other", other);
  } else {
    groups.set(tab, { points: shown.sort((a, b) => (a.stageStart ?? a.suggestedDecisionAt?.earliest ?? "9999")
      .localeCompare(b.stageStart ?? b.suggestedDecisionAt?.earliest ?? "9999")) });
  }
  const visibleGroups = [...groups].filter(([, group]) => group.points.length > 0);
  return <>
    <DreamCrumb label="入梦点" />
    <DreamHeading title="入梦点" description="人生里有分岔的时刻，梦从这里开始。">
      <button disabled={discovering} onClick={discover}>{discovering ? "正在重新发现…" : "重新发现"}</button>
      <Link className="dream-button dream-primary" to="/dreams/describe">＋ 描述我的入梦点</Link>
    </DreamHeading>
    <div className="dream-segment" aria-label="入梦点来源">
      {([["stages", "按人生阶段"], ["mine", `我描述的 ${described.length}`], ["saved", "已收藏"], ["ignored", "已忽略"]] as const).map(([key, label]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {discovering && <p className="dream-note" role="status">正在查找有日期的决策和生活记录…</p>}
    {discovery !== undefined && !discovering && <p className="dream-note" role="status">{discovery ? `新发现 ${discovery} 个入梦点` : "这次没有找到新的入梦点。"}</p>}
    {!visibleGroups.length && <DreamEmpty title={{ stages: "还没有可自动发现的入梦点", mine: "你还没有描述过入梦点", saved: "还没有收藏的入梦点", ignored: "还没有忽略的入梦点" }[tab]}>
      {tab === "stages" || tab === "mine" ? <Link className="dream-button dream-primary" to="/dreams/describe">描述一个入梦点</Link> : null}</DreamEmpty>}
    {visibleGroups.map(([id, group]) => <section key={id} className="dream-section dream-point-group">{group.title && <h2>{group.title}</h2>}
      {group.points.map(point => {
        const key = pointKey(point.source);
        const count = runs.filter(run => pointKey(run.point.source) === key).length;
        const preference = preferences[key];
        const newlyFound = point.fresh || fresh.includes(key);
        return <details className={`dream-point ${newlyFound ? "fresh" : ""}`} key={key} onToggle={event => {
          if (!event.currentTarget.open || !point.suggestedDecisionAt || inspecting.current.has(key)) return;
          inspecting.current.add(key);
          void inspect({ ...point.source, decisionAt: point.suggestedDecisionAt }).then(
            result => setCoverage(current => ({ ...current, [key]: result.after })),
            () => setCoverage(current => ({ ...current, [key]: null })),
          );
        }}>
          <summary><span><b>{point.title}</b><small>{point.suggestedDecisionAt?.earliest ?? "时间待确认"}{point.reason ? " · " + point.reason : ""}</small></span>
            <span className="dream-status">{newlyFound ? "新发现" : count ? `梦过 ${count} 次` : point.source.kind === "self-described" ? "你的自述" : "人生记录"}</span></summary>
          <div className="dream-point-body">{point.notes?.actualChoice && <p>实际选择 · {point.notes.actualChoice}</p>}
            {point.notes?.aftermath && <p>后来 · {point.notes.aftermath}</p>}
            {point.reason && <p><b>发现依据</b>　{point.reason}</p>}
            {typeof coverage[key] === "number" && <p><b>可核对程度</b>　{coverage[key] ? `入梦后有 ${coverage[key]} 条有日期的记录` : "入梦后暂无有日期的记录"}</p>}
            <div className="dream-actions"><button className="dream-primary" onClick={() => choose(point)}>从这里入梦</button>
              {preference === "ignored" ? <button disabled={busy} onClick={() => prefer(key, null)}>恢复入梦点</button> : <>
                <button disabled={busy} aria-pressed={preference === "saved"} onClick={() => prefer(key, preference === "saved" ? null : "saved")}>{preference === "saved" ? "取消收藏入梦点" : "收藏入梦点"}</button>
                {point.source.kind !== "self-described" && <button disabled={busy} onClick={() => prefer(key, "ignored")}>这不是分岔，忽略</button>}
              </>}
              {"pageId" in point.source && <Link className="dream-button" to={pageHref(point.source.pageId)} state={{returnTo:"/dreams/points",returnLabel:"返回入梦点"}}>查看原始依据</Link>}{point.source.kind === "conversation" && <Link className="dream-button" to={`/conversation?detached=true&run=${point.source.pointId}`}>查看原对话</Link>}</div>
          </div>
        </details>;
      })}
    </section>)}
  </>;
}

export function Dreams({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const { "*": path = "" } = useParams();
  const go = useNavigate();
  const location = useLocation();
  const query = "?knowledgeBaseId=" + encodeURIComponent(knowledgeBaseId);
  const [revision, refresh] = useState(0);
  const [filter, setFilter] = useState<"all" | "live" | "done" | "star">("all");
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DreamRun>();
  const [loadingPoint, setLoadingPoint] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<number>();
  const [discovering, setDiscovering] = useState(false);
  const [preparation, setPreparation] = useState<Preparation>();
  const [fork, setFork] = useState<{ title: string; sourceRunId?: string; date?: string; scenario?: string }>();
  const [deletedRuns, setDeletedRuns] = useState<string[]>([]);
  const prepSequence = useRef(0);
  const data = useApi<Workspace>("/api/dreams/workspace" + query, revision);
  const candidates = useApi<{ points: DreamPointCandidate[] }>("/api/dreams/points" + query, revision);
  const history = useApi<{ runs: DreamRunListItem[] }>("/api/dreams" + query, revision);
  const [runId, mode] = path.split("/");
  const detail = useApi<DreamRun>(runId && !["points", "describe", "prepare", "insights"].includes(runId) ? `/api/dreams/${encodeURIComponent(runId)}${query}` : "", revision);
  // A failed background refresh keeps the last good snapshot on screen; only a real
  // miss (unknown id or deletion announced over SSE) replaces the view with an error.
  const run = runId && detail.data?.id === runId && detail.data?.knowledgeBaseId === knowledgeBaseId && !deletedRuns.includes(runId) ? detail.data : undefined;
  const runs = history.data?.runs ?? [];
  const previousAvailable = !!run?.previousRunId && runs.some(item => item.id === run.previousRunId);
  const previous = useApi<DreamRun>(run?.previousRunId && previousAvailable && mode !== "progress" ? `/api/dreams/${encodeURIComponent(run.previousRunId)}${query}` : "", revision);
  const known = data.data?.knowledgeBaseId === knowledgeBaseId ? data.data : undefined;
  const collection = known?.collection ?? emptyCollection;
  const preferences = collection.pointPreferences ?? {};
  const points = [...(known?.decisions ?? []), ...(candidates.data?.points ?? [])];
  const update = () => refresh(x => x + 1);
  const pending = runs.some(dreamActive) || !!(run && dreamActive(run));
  useEffect(() => {
    const events = new EventSource("/api/events");
    const dream = (event: Event) => { try {
      const payload = JSON.parse((event as MessageEvent).data) as { id?: string; knowledgeBaseId?: string; deleted?: boolean };
      if (payload.knowledgeBaseId !== knowledgeBaseId) return;
      if (payload.deleted && payload.id) setDeletedRuns(current => current.includes(payload.id!) ? current : [...current, payload.id!]);
      update();
    } catch {} };
    events.addEventListener("dream", dream);
    events.addEventListener("open", update);
    events.addEventListener("index", update);
    return () => events.close();
  }, [knowledgeBaseId]);
  useEffect(() => { setDeletedRuns([]); }, [knowledgeBaseId]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(update, 6000);
    return () => window.clearInterval(timer);
  }, [pending]);
  useEffect(() => { setError(""); }, [path]);
  // A fork abandoned mid-description must not leak into an unrelated later description.
  useEffect(() => { if (path !== "describe") setFork(undefined); }, [path]);

  async function act<T>(operation: () => Promise<T>, done?: (value: T) => void) {
    setBusy(true); setError("");
    try { const result = await operation(); done?.(result); update(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  const post = <T,>(url: string, body?: unknown) => api<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  const inspect = (point: DreamPointInput) => post<DreamEnvironment>("/api/dreams/environment", { knowledgeBaseId, point });

  function prepare(point: DreamPointCandidate, initial?: DreamPointInput, previousRunId?: string, correcting?: boolean) {
    const nonce = ++prepSequence.current;
    setPreparation({ point, initial, previousRunId, nonce, correcting });
    go("/dreams/prepare");
    if (initial?.decisionAt || point.suggestedDecisionAt) {
      setLoadingPoint(true);
      void inspect({ ...point.source, decisionAt: initial?.decisionAt ?? point.suggestedDecisionAt })
        .then(environment => setPreparation(current => current?.nonce === nonce ? { ...current, environment } : current))
        .catch(() => undefined)
        .finally(() => { if (prepSequence.current === nonce) setLoadingPoint(false); });
    } else setLoadingPoint(false);
  }

  function saveDescription(description: DreamPointDescription, enter: boolean) {
    const proposed = { ...description, scenario: fork?.scenario };
    void act(() => post<DreamPointCandidate>("/api/dreams/points" + query, proposed), point => {
      if (enter) prepare(point, undefined, fork?.sourceRunId); else go("/dreams/points?tab=mine");
      setEntry(""); setFork(undefined);
    });
  }
  function start(point: DreamPointInput) {
    void act(() => post<DreamRun>("/api/dreams", { knowledgeBaseId, point, previousRunId: preparation?.previousRunId }),
      result => go(`/dreams/${result.id}/progress`));
  }
  function discover() {
    setDiscovering(true); setDiscovery(undefined); setError("");
    void post<{ points: DreamPointCandidate[] }>("/api/dreams/discover" + query).then(result => {
      setFresh(result.points.map(point => pointKey(point.source))); setDiscovery(result.points.length); update();
    }).catch(reason => setError(reason.message)).finally(() => setDiscovering(false));
  }
  function rerun(current: DreamRun, node?: PathNode, correcting = false) {
    prepare({ source: current.point.source, title: current.point.title, suggestedDecisionAt: current.point.decisionAt }, {
      ...pointInput(current), reviewFocus: node ? [node.date, node.label].filter(Boolean).join(" · ").slice(0, 300) : undefined,
    }, current.id, correcting);
  }
  function forkFrom(current: DreamRun, node: PathNode) {
    setFork({ title: `如果在「${node.label}」再选一次`, sourceRunId: current.id, date: node.date ?? (node.year ? String(node.year) : undefined),
      scenario: `承接上一份梦境中的假设情境：${node.text}`.slice(0, 2400) });
    setEntry("");
    go("/dreams/describe");
  }

  let content;
  if (path === "points") content = (data.loading && !known) || (candidates.loading && !candidates.data) ? <p role="status">正在查找入梦点…</p> :
    <Points key={location.search} points={points} described={known?.described ?? []} runs={runs} fresh={fresh}
    discovering={discovering} discovery={discovery} choose={prepare} discover={discover} preferences={preferences} busy={busy} inspect={inspect}
    prefer={(key, preference) => void act(() => post("/api/dreams/points/preference" + query, { key, preference }))} />;
  else if (path === "describe") content = <DescribeDream initial={fork?.title ?? entry} initialDate={fork?.date} scenario={fork?.scenario} busy={busy} save={saveDescription} />;
  else if (path === "prepare") content = preparation ? loadingPoint ? <p role="status">正在查看入梦环境…</p> :
    <PrepareDream key={preparation.nonce} {...preparation} busy={busy} start={start} inspect={inspect}
      recommend={async (point, signal) => (await api<{ suggestions: string[] }>("/api/dreams/suggestions", {
        method: "POST", body: JSON.stringify({ knowledgeBaseId, point }), signal,
      })).suggestions} /> :
    <DreamEmpty title="先选择一个入梦点"><Link to="/dreams/points">浏览入梦点</Link></DreamEmpty>;
  else if (path === "insights") content = <><DreamCrumb label="已收藏的洞察" /><DreamHeading title="从梦境带回的洞察" />
    {collection.insights.length ? collection.insights.map(item => <article className="dream-panel" key={item.runId + item.key + item.savedAt}><p>{item.text}</p>
      {item.sourceDeleted ? <small>来源梦境已删除</small> : <Link to={`/dreams/${item.runId}`}>回到梦境</Link>}</article>) :
      <DreamEmpty title="还没有收藏的洞察"><Link to="/dreams">返回梦境</Link></DreamEmpty>}</>;
  else if (run) content = dreamActive(run) || mode === "progress" || !run.report ? <Progress run={run} busy={busy}
    cancel={() => void act(() => post(`/api/dreams/${run.id}/cancel${query}`))}
    resume={() => void act(() => post(`/api/dreams/${run.id}/resume${query}`))} again={() => rerun(run)} /> :
    <DreamDetail key={run.id} run={run} previous={previousAvailable && !previous.error && previous.data?.id === run.previousRunId ? previous.data : undefined}
      previousMissing={!!history.data && !previousAvailable} collection={collection} busy={busy}
      favorite={() => void act(() => post(`/api/dreams/${run.id}/favorite${query}`, { on: !collection.favorites.includes(run.id) }))}
      rerun={() => rerun(run)} save={key => void act(() => post(`/api/dreams/${run.id}/insights${query}`, { key }))}
      correct={node => rerun(run, node, true)} fork={node => forkFrom(run, node)} />;
  else if (path) content = detail.error ? <DreamEmpty title="无法打开这个梦境" text={detail.error}><Link to="/dreams">返回梦境</Link></DreamEmpty> : <p role="status">正在打开梦境…</p>;
  else {
    const shown = runs.filter(item => filter === "all" || filter === "live" && dreamActive(item) || filter === "done" && dreamFinished(item) || filter === "star" && collection.favorites.includes(item.id));
    const suggestions = points.filter(point => preferences[pointKey(point.source)] !== "ignored").slice(0, 3);
    content = <>
      <header className="dream-entry"><h1>今晚，在哪里入梦？</h1><p>描述一个你想重新选择的时刻，或者从人生阶段里挑一个。</p>
        <form className="dream-ask" onSubmit={event => { event.preventDefault(); if (entry.trim()) { setFork(undefined); go("/dreams/describe"); } }}>
          <input aria-label="描述入梦点" placeholder="例如：如果当年我选了另一个专业……" value={entry} maxLength={300} onChange={event => setEntry(event.target.value)} />
          <button className="dream-primary" disabled={!entry.trim()}>描述并入梦</button>
        </form>
        <p className="dream-entry-hint">{suggestions.length ? "或从人生阶段里挑" : "可以从这样的假如说起"}</p>
        <div className="dream-chips">
          {suggestions.length ? suggestions.map(point => <button key={pointKey(point.source)} onClick={() => prepare(point)}>{point.title} <small>{point.suggestedDecisionAt?.earliest.slice(0,7)}</small></button>) :
            ["如果大学选了另一个专业", "如果毕业时没有留在这座城市", "如果当年接受了那个 offer"].map(text => <button key={text} onClick={() => { setEntry(text); document.querySelector<HTMLInputElement>(".dream-ask input")?.focus(); }}>{text}</button>)}
          <Link className="dream-button" to="/dreams/points">全部入梦点 · 重新发现</Link>
        </div>
      </header>
      <div className="dream-library-head"><h2>我的梦境 <small>{runs.length} 个梦</small></h2>
        <div className="dream-segment" aria-label="梦境筛选">{([["all","全部"],["live","做梦中"],["done","已醒来"],["star","已收藏"]] as const).map(([key,label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
      </div>
      {history.loading && !history.data ? <p role="status">正在打开梦境…</p> : shown.length ? <div className="dream-grid">{shown.map(item => <article className="dream-card-frame" key={item.id}>
        <Link className="dream-card" to={`/dreams/${item.id}${dreamActive(item) ? "/progress" : ""}`}>
        <span className={`dream-status ${dreamActive(item) ? "supported" : ""}`}>{item.status === "ready" && item.verification === "unreviewed" ? "未核对的梦" : item.status === "partial" && item.resumable ? "核对未完成" : statuses[item.status]}{dreamActive(item) && item.progress ? ` · ${item.progress.finished}/${item.progress.total} 条` : ""}</span>
        <h3>{dreamTitle(item)}</h3>
        <p>{(dreamActive(item) && item.updates?.at(-1)?.text) || item.point.decisionAt.earliest}</p>
        <DreamFork count={(item.branchCount ?? item.progress?.total ?? item.point.alternatives?.length ?? 2) + 1} />
        <div className="dream-card-foot">{item.finishedAt ? new Date(item.finishedAt).toLocaleDateString() : item.point.decisionAt.earliest}{collection.favorites.includes(item.id) ? " · 已收藏" : ""}<span>打开梦境 →</span></div>
        </Link>
        <button className="dream-card-delete" type="button" title="删除梦境" aria-label={`删除梦境「${dreamTitle(item)}」`} onClick={() => setDeleteTarget(item)}><Icon name="trash" size={17} /></button>
      </article>)}</div> : <DreamEmpty title={filter === "all" ? "还没有梦" : filter === "star" ? "还没有收藏的梦" : "这个分类里暂时没有梦"} text={filter === "all" ? "选一个入梦点，第一个梦会出现在这里。" : undefined} />}
      {!!collection.insights.length && <Link className="dream-insights-link" to="/dreams/insights">查看已收藏的洞察 →</Link>}
    </>;
  }
  const alert = error || (["", "points", "insights"].includes(path) ? history.error || data.error || candidates.error : undefined);
  return <div className="dream-page">
    {alert && <div className="dream-error" role="alert">{alert} <button className="dream-ghost" onClick={() => { setError(""); update(); }}>刷新</button>
      {alert.includes("更适合聊聊") && <button onClick={() => openContextAgent({ mode: "read", attachedContext: preparation ? {
        topicId: `dream-point-${pointKey(preparation.point.source)}`, title: preparation.point.title,
        currentUnderstanding: preparation.point.notes?.situation ?? preparation.point.title,
        reason: "用户想聊聊这个时刻的经历和感受。",
      } : undefined })}>聊聊这段</button>}</div>}
    {content}
    {deleteTarget && createPortal(<ConfirmDeleteDialog title="删除这个梦境？"
      description={dreamActive(deleteTarget) ? "这次推演会停止，梦境档案将从本机删除。" : "梦境档案将从本机删除。"}
      itemName={`${dreamTitle(deleteTarget)} · ${new Date(deleteTarget.createdAt).toLocaleString()}`}
      impact="此操作无法撤销。已收藏为洞察的内容会留在「已有理解」。" confirmLabel="删除梦境"
      onClose={() => setDeleteTarget(undefined)} onConfirm={async () => {
        await api(`/api/dreams/${deleteTarget.id}${query}`, { method: "DELETE" });
        update();
      }} />, document.body)}
    <PageAgentContext context={{ scope: "梦境", title: run ? dreamTitle(run) : "聊聊另一个选择", summary: run?.report?.summary,
      defaultMode: "read", suggestions: ["这段推演用了哪些依据？", "我想补充当时的处境。"] }} />
  </div>;
}
