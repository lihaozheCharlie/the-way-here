import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DreamEnvironment, DreamHorizon, DreamPointCandidate, DreamPointDescription, DreamPointInput } from "@the-way-here/shared";
import { Link } from "react-router-dom";
import { dateRange } from "./dream-model";

export function DreamCrumb({ label, points = false }: { label: string; points?: boolean }) {
  return <nav className="dream-crumb" aria-label="梦境导航"><Link to="/dreams">梦境</Link><span aria-hidden="true">/</span>
    {points && <><Link to="/dreams/points">入梦点</Link><span aria-hidden="true">/</span></>}{label}</nav>;
}
export function DreamHeading({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <header className="dream-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="dream-actions">{children}</div>}</header>;
}
export function DreamEmpty({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return <div className="dream-empty"><strong>{title}</strong>{text && <p>{text}</p>}{children}</div>;
}

export function DescribeDream({ initial, initialDate, scenario, busy, save }: {
  initial: string; initialDate?: string; scenario?: string; busy: boolean; save: (description: DreamPointDescription, enter: boolean) => void;
}) {
  const [title, setTitle] = useState(initial);
  const [when, setWhen] = useState(initialDate ?? "");
  const [actualChoice, setActualChoice] = useState("");
  const [aftermath, setAftermath] = useState("");
  const [situation, setSituation] = useState("");
  const [error, setError] = useState("");
  const decisionAt = dateRange(when);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (when.trim() && !decisionAt) { setError("请填写年份、年月、日期或有效的日期区间。"); return; }
    if (!title.trim()) return;
    setError("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    save({ title, decisionAt, situation, actualChoice, aftermath }, submitter?.value === "enter");
  }
  return <>
    <DreamCrumb label="描述入梦点" points />
    <DreamHeading title="描述一个入梦点" description="从你记得的那个时刻说起。下面三个问题，答得出来就答。" />
    <div className="dream-columns"><form className="dream-fields" onSubmit={submit}>
      {scenario && <p className="dream-note">承接上一版的假设情境。{scenario}</p>}
      <label>你想回到哪个时刻？<textarea required rows={2} maxLength={300} value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：大四那年，我放弃了保研，直接去工作" /></label>
      <label>1 · 大概是什么时候？<input value={when} onChange={e => setWhen(e.target.value)} placeholder="例如：2018-06 至 2018-08" /><small>记得年月就可以，入梦前再确认时间。</small></label>
      <label>2 · 你当时实际选了什么？<input maxLength={1200} value={actualChoice} onChange={e => setActualChoice(e.target.value)} /></label>
      <label>3 · 之后发生了哪些大事？<textarea rows={3} maxLength={2400} value={aftermath} onChange={e => setAftermath(e.target.value)} placeholder="可以写下年份和发生的事" /></label>
      <label>当时的处境（可选）<textarea rows={2} maxLength={2400} value={situation} onChange={e => setSituation(e.target.value)} /></label>
      {error && <p role="alert" className="dream-error">{error}</p>}
      <div className="dream-actions"><button disabled={busy} type="submit" value="save">保存为入梦点</button><button className="dream-primary" disabled={busy} type="submit" value="enter">保存并入梦</button></div>
    </form><aside className="dream-panel dream-meter">
      <h3>这个梦能拿到多少环境</h3>
      {[[title.trim(), "描述了这个时刻"], [decisionAt, "给出了入梦时间"], [actualChoice.trim(), "知道你当时选了什么"], [aftermath.trim(), "有后续的真实时间点"]].map(([on, label]) => <p key={String(label)}><span className={on ? "filled" : ""} aria-label={on ? "已填写" : "待补充"} />{String(label)}</p>)}
      <p className="dream-confidence">可信度上限 <b>{decisionAt && actualChoice.trim() && aftermath.trim() ? "中" : "中低"}</b></p>
      <div className="dream-note">依据主要来自你的自述。补上后来发生的事，可以帮助核对梦境。</div>
    </aside></div>
  </>;
}

type Alternative = { text: string; chosen: boolean; from: string };
export function PrepareDream({ point, initial, environment, busy, start, inspect, recommend, correcting }: {
  point: DreamPointCandidate; initial?: DreamPointInput; environment?: DreamEnvironment; busy: boolean; correcting?: boolean;
  start: (input: DreamPointInput) => void; inspect: (input: DreamPointInput) => Promise<DreamEnvironment>;
  recommend: (input: DreamPointInput, signal: AbortSignal) => Promise<string[]>;
}) {
  const initialDate = initial?.decisionAt ?? point.suggestedDecisionAt;
  const [earliest, setEarliest] = useState(initialDate?.earliest ?? "");
  const [latest, setLatest] = useState(initialDate?.latest ?? "");
  const [editing, setEditing] = useState(!initialDate);
  const [situation, setSituation] = useState(initial?.situation ?? point.notes?.situation ?? "");
  const [actualChoice, setActual] = useState(initial?.actualChoice ?? point.notes?.actualChoice ?? environment?.actualChoice ?? "");
  const [aftermath, setAftermath] = useState(initial?.aftermath ?? point.notes?.aftermath ?? "");
  const [horizon, setHorizon] = useState<DreamHorizon>(initial?.horizon ?? "now");
  const [supplement, setSupplement] = useState(initial?.supplement ?? "");
  const base = initial?.alternatives?.length ? initial.alternatives : environment?.suggestions?.length ? environment.suggestions
    : point.source.kind === "self-described" && /^如果/.test(point.title) ? [point.title.slice(0, 240)] : [];
  const [options, setOptions] = useState<Alternative[]>(base.map(text => ({ text, chosen: true, from: initial ? "上一版梦境" : "入梦点提供的线索" })));
  const [added, setAdded] = useState("");
  const [automatic, setAutomatic] = useState(!initial?.alternatives?.length && base.length < 2);
  const [error, setError] = useState("");
  const [recommending, setRecommending] = useState(false);
  const [recommendationStatus, setRecommendationStatus] = useState("");
  const picked = options.filter(option => option.chosen);
  const count = picked.length;
  const [coverage, setCoverage] = useState(environment);
  const inspectRef = useRef(inspect);
  const recommendation = useRef<AbortController | undefined>(undefined);
  const supplementInput = useRef<HTMLTextAreaElement>(null);
  inspectRef.current = inspect;
  useEffect(() => {
    const end = latest || earliest;
    if (!earliest || end < earliest) { setCoverage(undefined); return; }
    let current = true;
    const timer = setTimeout(() => {
      void inspectRef.current({ ...point.source, decisionAt: { earliest, latest: end }, situation, aftermath, horizon, supplement }).then(result => {
        if (current) setCoverage(result);
      }).catch(() => { if (current) setCoverage(undefined); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [earliest, latest, point.source, situation, aftermath, horizon, supplement]);
  useEffect(() => () => recommendation.current?.abort(), [earliest, latest, situation, actualChoice]);
  useEffect(() => {
    if (!correcting) return;
    const frame = requestAnimationFrame(() => supplementInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [correcting]);
  const decisionAt = earliest && (latest || earliest) >= earliest ? { earliest, latest: latest || earliest } : undefined;
  const confidence = coverage ? !coverage.before || !coverage.after ? "中低" : coverage.before >= 3 && coverage.after >= 3 && actualChoice.trim() ? "较高" : "中" : undefined;
  const input = (): DreamPointInput => ({
    ...point.source, decisionAt, situation, actualChoice, aftermath, horizon, supplement,
    question: initial?.question, scenario: initial?.scenario ?? point.notes?.scenario, reviewFocus: initial?.reviewFocus,
  });

  async function suggest() {
    if (!decisionAt) { setEditing(true); setError("请先确认入梦时间。"); return; }
    const controller = new AbortController();
    recommendation.current = controller;
    setRecommending(true);
    setRecommendationStatus("");
    setError("");
    try {
      const suggestions = await recommend(input(), controller.signal);
      if (controller.signal.aborted) return;
      setOptions(current => {
        let chosen = automatic ? Math.min(current.length, 2) : current.filter(option => option.chosen).length;
        const newOptions = suggestions.filter(text => !current.some(option => option.text === text));
        return [...current, ...newOptions.map(text => ({ text, chosen: chosen++ < 2, from: "根据入梦时的资料推荐" }))];
      });
      if (suggestions.length) setAutomatic(false);
      setRecommendationStatus(suggestions.length ? "可以勾选想梦见的假如。" : "这次没有找到可推荐的备选，可以自己添加。");
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (recommendation.current === controller) setRecommending(false);
    }
  }

  function add() {
    const text = added.trim();
    if (!text) return;
    if (options.some(option => option.text === text)) { setError("已经添加了这个假如。"); return; }
    setOptions(current => [...current, { text, chosen: count < 3, from: "你添加的" }]);
    setAutomatic(false); setAdded(""); setError("");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!decisionAt) { setError("请确认入梦时间。"); setEditing(true); return; }
    if (!count && !automatic) { setError("至少选一个假如，或让梦境建议。"); return; }
    start({ ...input(), alternatives: automatic ? undefined : picked.map(option => option.text) });
  }
  return <>
    <DreamCrumb label="入梦准备" points /><DreamHeading title="入梦准备" description={point.title} />
    <form className="dream-columns" onSubmit={submit}><div className="dream-steps">
      <section className="dream-panel"><h3><span>1</span>入梦点 T <small>{decisionAt?.earliest ?? "待确认"}{decisionAt && decisionAt.latest !== decisionAt.earliest ? " 至 " + decisionAt.latest : ""}</small></h3>
        {!editing && situation && <p>{situation}</p>}
        {!editing && !situation && point.reason && <p>{point.reason}</p>}
        {editing && <div className="dream-fields">
          <div className="dream-date-fields"><label>开始日期<input type="date" required value={earliest} onChange={e => setEarliest(e.target.value)} /></label><label>结束日期<input type="date" min={earliest} value={latest} onChange={e => setLatest(e.target.value)} /></label></div>
          <small>记得具体日期就填同一天。只记得范围时，会以范围起点封存当时的资料。</small>
          <label>当时的处境<textarea rows={2} value={situation} maxLength={2400} onChange={e => setSituation(e.target.value)} /></label>
        </div>}
        <button type="button" className="dream-ghost" onClick={() => setEditing(!editing)}>{editing ? "收起修改" : "我记得不太一样，修改"}</button>
      </section>
      <section className="dream-panel"><h3><span>2</span>你实际选了 <small>用于对照和回测</small></h3><label className="dream-field"><span className="dream-sr">实际选择</span><textarea rows={2} value={actualChoice} onChange={e => setActual(e.target.value)} maxLength={1200} placeholder="补充你当时实际做的选择（可选）" /></label></section>
      <section className="dream-panel"><h3><span>3</span>想梦见的另一种选择 <small>最多 3 条</small></h3>
        {options.map(option => <label className="dream-option" key={option.text}>
          <input type="checkbox" checked={option.chosen && !automatic} disabled={!automatic && !option.chosen && count >= 3} onChange={() => {
            setOptions(current => current.map(item => item === option ? { ...item, chosen: automatic || !item.chosen } : automatic ? { ...item, chosen: false } : item));
            setAutomatic(false);
          }} /><span><strong>{option.text}</strong><small>{option.from}</small></span>
        </label>)}
        <div className="dream-recommend">
          <button type="button" disabled={recommending || busy} onClick={() => void suggest()}>{recommending ? "正在寻找备选…" : "推荐几个假如"}</button>
          <label><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)} /> 入梦时自动规划</label>
        </div>
        {recommendationStatus && <p className="dream-muted" role="status">{recommendationStatus}</p>}
        <div className="dream-add"><input aria-label="自己加一个假如" placeholder="自己加一个：如果当时……" value={added} maxLength={240} onChange={e => setAdded(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} /><button type="button" disabled={!added.trim()} onClick={add}>添加</button></div>
      </section>
      <section className="dream-panel"><h3><span>4</span>梦多远</h3><div className="dream-segment">{([["one-year", "到 T 之后 1 年"], ["three-years", "到 T 之后 3 年"], ["now", "一直到现在"]] as const).map(([key, label]) =>
        <button type="button" key={key} aria-pressed={key === horizon} onClick={() => setHorizon(key)}>{label}</button>)}</div>
        {coverage?.until && <p className="dream-muted dream-horizon">推演到 {coverage.until}。现实记录用于核对这段时间。</p>}</section>
      <section className="dream-panel dream-fields"><h3><span>5</span>补充你记得的 <small>可选</small></h3>
        {initial?.reviewFocus && <p className="dream-note">请重新核对这一处：{initial.reviewFocus}</p>}
        <textarea ref={supplementInput} aria-label="补充你记得的" rows={3} maxLength={2400} value={supplement} onChange={e => setSupplement(e.target.value)} placeholder="当时的顾虑、想补充或纠正的地方……" />
        <label>后来实际发生的事<textarea rows={2} maxLength={2400} value={aftermath} onChange={e => setAftermath(e.target.value)} placeholder="记得日期的话，可以一起填上" /></label>
      </section>
      {error && <p role="alert" className="dream-error">{error}</p>}
      <footer className="dream-stick">
        {confidence === "中低" && <button className="dream-ghost" type="button" onClick={() => supplementInput.current?.focus()}>补充你记得的</button>}
        <small>可以离开，醒来后会通知你</small><Link to="/dreams" className="dream-button">取消</Link><button disabled={busy || recommending || (!count && !automatic)} className="dream-primary" type="submit">{busy ? "正在入梦…" : "入梦"}</button></footer>
    </div><aside className="dream-panel dream-meter">
      <h3>这次梦能拿到的环境</h3>
      {coverage ? <><p>入梦前的有日期记录 <b>{coverage.before}</b></p><p>入梦后的有日期记录 <b>{coverage.after}</b></p></> : <p>确认日期后可查看资料范围。</p>}
      <p>实际选择 <b>{actualChoice ? "已补充" : "待核对"}</b></p>
      {confidence && <p>可信度上限 <b>{confidence}</b></p>}
      {coverage && !coverage.after && <div className="dream-note">这段时间暂无后续记录。这次会保留推演，节点标为无法验证。</div>}
      <div className="dream-note">{automatic ? "由梦境规划备选路径。" : `现实对照 + ${count} 条假如`}<br />推演使用当时的信息，后续资料用来核对。</div>
    </aside></form>
  </>;
}
