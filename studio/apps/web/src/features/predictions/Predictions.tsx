import { useEffect, useRef, useState } from "react";
import type { PredictionView, PredictionThoughtKind } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import "./predictions.css";
import { PredictionProgress, UnderstandingDetails } from "./PredictionSetup";
import { LockedUnderstanding } from "./LockedUnderstanding";
import { LifeScenarios } from "./LifeScenarios";
import { TextArea } from "../../shared/form-controls";

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
  if (locked && !view.report) return <div className="prediction-page">
    <header className="prediction-setup-header"><p>看见未来</p><h1>基于过去的选择和习惯，看看未来可能通向的几条路</h1></header>
    <PredictionProgress score={view.understanding} />
    <LockedUnderstanding score={view.understanding} scan={scan} busy={generating} />
    {view.understanding.scannedAt && <UnderstandingDetails score={view.understanding} />}
  </div>;
  if (!view.report) return <div className="prediction-page">
    <header className="prediction-setup-header"><p>看见未来</p><h1>基于过去的选择和习惯，看看未来可能通向的几条路</h1></header>
    <PredictionProgress score={view.understanding} />
    <section className="prediction-ready" aria-labelledby="prediction-ready-heading" aria-busy={generating}>
      <span className="prediction-qualified">了解程度 {view.understanding.score}/100 · 已达标</span>
      <h2 id="prediction-ready-heading">看看未来的几种可能</h2>
      <p>从你的经历和选择出发，梳理接下来可能走向的生活。</p>
      <button type="button" className="prediction-cta" disabled={generating} onClick={submit}>{view.understanding.scanStatus === "running" ? "正在扫描…" : generating ? "正在预测…" : "预测未来"}</button>
      {view.status === "running" && <p role="status">{view.progress || "正在梳理可能的路径，完成后会显示在这里。"}</p>}
      {view.error && <p className="prediction-notice prediction-error" role="alert">这次预测没有完成：{view.error}。请重试。</p>}
      <details className="prediction-ready-thoughts">
        <summary>补充你的想法（可选）</summary>
        <label htmlFor="prediction-thoughts">你喜欢什么，想成为什么样的人？</label>
        <TextArea id="prediction-thoughts" rows={3} maxLength={maximum} value={thoughts} disabled={generating} onChange={event => {setThoughts(event.target.value);setThoughtKind("update");}} placeholder="一句话也可以，不填写也能开始预测。" />
        <p>仅用于本次预测，不会写入原始记录。 · {thoughts.length} / {maximum}</p>
      </details>
      {view.understanding.scanStatus === "running" && <p role="status">正在重新阅读资料，扫描完成后即可继续。</p>}
      {view.understanding.error && <p className="prediction-notice prediction-error" role="alert">{view.understanding.error}</p>}
    </section>
    <UnderstandingDetails score={view.understanding} compact />
  </div>;
  return <div className="prediction-page">
    <header className="prediction-header"><div><h1>看见未来</h1><p>基于过去的选择和习惯，看看未来可能通向的几条路。</p></div>
      <button type="button" className="prediction-refresh" disabled={generating || !canPredict} onClick={submit}>{view.understanding.scanStatus === "running" ? "扫描中…" : generating ? "正在预测…" : view.report ? "重新预测" : "看见未来"}</button>
    </header>
    {view.report && <button type="button" className="prediction-feedback-jump" onClick={()=>{thoughtsInput.current?.scrollIntoView({block:"center",behavior:"auto"});thoughtsInput.current?.focus({preventScroll:true});}}>写下你的想法 ↓</button>}
    {view.stale && view.status !== "failed" && !view.error && (!dismissedChange || dismissedChange !== (view.changeToken || "changed")) && view.status !== "running" && <aside className="prediction-update" role="status"><div><strong>{locked ? "请先扫描了解度，再更新预测" : "有更新，可以重新预测了"}</strong><p>资料或预测规则已发生变化，可能影响原来的判断。</p></div><button type="button" className="prediction-refresh" disabled={generating} onClick={locked ? scan : submit}>{locked ? "扫描了解度" : "重新预测"}</button><button type="button" className="prediction-dismiss" onClick={() => setDismissedChange(view.changeToken || "changed")}>暂时不用</button></aside>}
    {view.status === "running" && <p className="prediction-notice" role="status">{view.progress || "正在结合记录和你的想法梳理可能的路径"}。{view.report ? "你可以先阅读上一版。" : "完成后会显示在这里。"}</p>}
    {view.error && <p className="prediction-notice prediction-error" role="alert">这次预测没有完成：{view.error}。{view.report ? "当前展示的是上次成功生成的旧版，尚未更新。" : "请重新预测。"}</p>}
    <LifeScenarios key={view.generatedAt} report={view.report} />
    <section className="prediction-feedback" aria-labelledby="prediction-feedback-heading">
      <h2 id="prediction-feedback-heading"><label htmlFor="prediction-thoughts">说说你喜欢什么，想成为什么样的人</label></h2>
      <p>不必是完整的想法，一句话也可以。你说得越具体，预测就越能贴近你想要的生活。</p>
      <TextArea ref={thoughtsInput} id="prediction-thoughts" rows={4} maxLength={maximum} value={thoughts} disabled={generating} onChange={event => {setThoughts(event.target.value);setThoughtKind("update");}} placeholder="比如：我最近做产品原型时特别投入，很喜欢那种感觉；比起稳定，我更想成为一个不后悔自己选择的人……" />
      {locked && <p className="prediction-input-help">先扫描 Wiki 了解度，达到 {view.understanding.threshold} 分后可结合想法预测。</p>}
      <div className="prediction-thoughts-footer"><p>与已有记录一起用于预测，可修改或清空。<br/>不会写入原始记录。 · {thoughts.length} / {maximum}</p><button className="prediction-cta" type="button" disabled={generating || !canPredict} onClick={submit}>{view.understanding.scanStatus === "running" ? "扫描中…" : generating ? "正在预测…" : view.report ? "保存想法，更新预测" : "开始预测"}</button></div>
    </section>
    {view.generatedAt && <p className="prediction-date">更新于 {new Date(view.generatedAt).toLocaleString("zh-CN")} · 根据当时的记录与想法生成</p>}
    <p className="prediction-footnote">这是当前轨迹投出的影子。你的选择变了，它也会跟着变。</p>
  </div>;
}

export function Predictions({ knowledgeBaseId }: { knowledgeBaseId: string }) {
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
  return <>{(requestError || error) && <p role="alert">{requestError || error}</p>}<PredictionContent key={knowledgeBaseId} view={data} busy={busy} scan={() => void refresh("", true)} refresh={(thoughts,kind) => void refresh(thoughts,false,kind)} /><PageAgentContext context={{ scope: "看见未来", title: "聊聊未来的可能性", summary: data.report?.current || "从真实经历聊起，慢慢理解你想成为的人。", defaultMode: "read", suggestions: ["这条预测里有哪些假设还需要我补充？", "我想说说自己想成为什么样的人。"] }} /></>;
}
