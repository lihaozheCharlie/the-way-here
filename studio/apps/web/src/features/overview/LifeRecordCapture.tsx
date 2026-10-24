import { useEffect, useId, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { isTerminalRunStatus, type WikiRun } from "@the-way-here/shared";
import { api } from "../../api";
import { TextArea } from "../../shared/form-controls";
import { pageHref } from "../../shared/routing";
import { Icon } from "../../shared/ui";
import { openContextAgent } from "../collaboration/model";
import { wikiPageIdFromChange } from "../collaboration/wiki-change-link";
import { CaptureVoice } from "../desktop/CaptureVoice";
import { CaptureFolderDialog, CaptureHistoryDialog } from "./CaptureDialogs";
import { useCaptureDraft } from "./useCaptureDraft";
import "./today.css";
import "./life-record-capture.css";

export function LifeRecordCapture({ knowledgeBaseId, standalone = false }: { knowledgeBaseId: string; standalone?: boolean }) {
  const legacyKey = `${standalone ? "desktop" : "today"}.capture.${knowledgeBaseId}`;
  const capture = useCaptureDraft(knowledgeBaseId, legacyKey);
  const { draft, key } = capture;
  const [runId, setRunId] = useState(() => localStorage.getItem(`${key}.run`) || localStorage.getItem(`${legacyKey}.run`) || "");
  const [run, setRun] = useState<WikiRun>();
  const [starting, setStarting] = useState(false), [voiceActive, setVoiceActive] = useState(false), [preview, setPreview] = useState("");
  const [dialog, setDialog] = useState<"history" | "folder" | null>(null), [error, setError] = useState("");
  const [savingOriginal, setSavingOriginal] = useState(false), [savedOriginalId, setSavedOriginalId] = useState("");
  const submitting = useRef(false), input = useRef<HTMLTextAreaElement>(null), transcriptView = useRef<HTMLDivElement>(null);
  const voiceRange = useRef({ start: 0, end: 0, text: "" });
  const headingId = useId();
  const busy = starting || savingOriginal || Boolean(runId && (!run || !isTerminalRunStatus(run.status)));
  const callbacks = useRef(capture); callbacks.current = capture;
  useEffect(() => { const node = transcriptView.current; if (node) node.scrollTop = node.scrollHeight; }, [preview]);
  useEffect(() => {
    if (!runId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await api<WikiRun>(`/api/runs/${encodeURIComponent(runId)}`);
        if (!active) return;
        if (next.knowledgeBaseId !== knowledgeBaseId || next.outputTarget?.kind !== "life-record") throw new Error("记录任务与当前知识库不一致");
        setRun(next); setError("");
        if (isTerminalRunStatus(next.status)) {
          localStorage.removeItem(`${key}.run`); localStorage.removeItem(`${legacyKey}.run`); setRunId("");
          if (next.status === "completed" && next.result?.outputPageId) { callbacks.current.reset(); void callbacks.current.refresh().catch(callbacks.current.fail); }
          else setError(next.error || "整理未完成，原话已保留，可以再次发送。");
          return;
        }
      } catch (reason) {
        if (active) {
          const message = reason instanceof Error ? reason.message : "暂时无法获取进度，正在重试…";
          setError(message);
          if (message.includes("任务不存在") || message.includes("不一致")) { localStorage.removeItem(`${key}.run`); localStorage.removeItem(`${legacyKey}.run`); setRunId(""); return; }
        }
      }
      if (active) timer = setTimeout(() => void refresh(), 1500);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [runId, key, legacyKey, knowledgeBaseId]);

  function openPreferences() {
    window.dispatchEvent(new Event("open-preferences"));
  }
  function talkAboutDraft() {
    if (!draft.text.trim() || standalone) return;
    openContextAgent({
      mode: "read",
      prompt: draft.text,
      displayPrompt: draft.text,
      contextOverride: { scope: "此刻", title: "随手记", summary: "先聊聊这段还没保存的话。已经写下的记录留在本机。", suggestions: [], defaultMode: "read" },
    });
  }
  async function saveOriginal() {
    if (!draft.text.trim() || busy || voiceActive || draft.status === "saved" || submitting.current) return;
    submitting.current = true; setSavingOriginal(true); setError(""); setSavedOriginalId("");
    try {
      const savedDraft = await capture.flush();
      const page = await api<{ id: string }>("/api/capture/original", { method: "POST", body: JSON.stringify({
        knowledgeBaseId, id: draft.id, revision: savedDraft?.revision || draft.revision, text: draft.text, folder: draft.folder, diaryDate: draft.diaryDate,
      }) });
      setSavedOriginalId(page.id);
      capture.reset();
      void capture.refresh().catch(capture.fail);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "原文还在，没有保存成功。"); }
    finally { submitting.current = false; setSavingOriginal(false); }
  }
  async function submit() {
    if (!draft.text.trim() || busy || voiceActive || submitting.current) return;
    submitting.current = true; setStarting(true); setError(""); setRun(undefined); setSavedOriginalId("");
    try {
      const savedDraft = await capture.flush();
      const next = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({
        knowledgeBaseId, mode: "read", title: "整理当天日记", sourceModule: standalone ? "随手记" : "此刻", prompt: "请将原话整理成当天的日记。", displayPrompt: draft.text,
        outputTarget: { kind: "life-record", label: "随手记", originalText: draft.text, diaryDate: draft.diaryDate, folder: draft.folder, captureId: draft.id, captureRevision: savedDraft?.revision || draft.revision },
      }) });
      localStorage.setItem(`${key}.run`, next.id); setRunId(next.id); setRun(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发送失败，原话已保留。"); }
    finally { submitting.current = false; setStarting(false); }
  }
  const pendingCount = capture.history.filter(e => e.status === "draft" || e.text !== (e.originalText ?? e.content)).length;
  const badge = draft.status === "saved" ? "补充中" : draft.text.trim() ? "待整理" : "新记录";
  return <section className="today-capture life-record-capture" aria-labelledby={headingId}>
    <header className="capture-heading"><div>{standalone ? <h1 id={headingId}>随手记</h1> : <h2 id={headingId}>随手记</h2>}<span className="capture-badge">{badge}</span></div><button type="button" className="capture-history-trigger" disabled={busy || voiceActive || !capture.ready} onClick={() => { void capture.flush().then(() => capture.refresh()).then(() => setDialog("history")).catch(capture.fail); }}><Icon name="history" size={17} />历史记录{pendingCount > 0 && <span>{pendingCount} 待整理</span>}</button></header>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="capture-editor-body">
        {voiceActive ? <div className="capture-live-editor" ref={transcriptView} role="textbox" aria-label="此刻的记录，语音临时转写" aria-readonly="true" tabIndex={0}>{voiceRange.current.text.slice(0,voiceRange.current.start)}<span className="capture-temporary-text">{preview || "正在听…"}</span>{voiceRange.current.text.slice(voiceRange.current.end)}</div> : <TextArea ref={input} voice={false} rows={5} maxLength={50_000} disabled={busy} aria-label="此刻的记录" placeholder="此刻发生了什么？写下来，或说一段……" value={draft.text} onChange={event => { capture.setText(event.target.value); setRun(undefined); setSavedOriginalId(""); }} onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void submit(); }
        }} />}
        <CaptureVoice disabled={busy || !capture.ready} hasText={Boolean(draft.text.trim())} onActive={active => {
          if (active) { voiceRange.current = { start: input.current?.selectionStart ?? draft.text.length, end: input.current?.selectionEnd ?? draft.text.length, text: draft.text }; setPreview(""); }
          else { localStorage.removeItem(`${key}.voice`); setPreview(""); }
          setVoiceActive(active);
        }} onProgress={text => {
          setPreview(text);
          const { start, end, text: base } = voiceRange.current;
          try { localStorage.setItem(`${key}.voice`, `${base.slice(0,start)}${text}${base.slice(end)}`); } catch { /* Native transcript and complete audio remain on disk. */ }
        }} onText={text => {
          const { start, end, text: base } = voiceRange.current;
          capture.setText(`${base.slice(0,start)}${text}${base.slice(end)}`);
          setRun(undefined);
          requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start+text.length,start+text.length); });
        }} actions={<>{!standalone && draft.text.trim() && <button type="button" className="capture-chat" disabled={busy || voiceActive || !capture.ready} onClick={talkAboutDraft}>先聊聊这段</button>}{draft.text.trim() && <button type="button" className="capture-stash" disabled={busy || voiceActive || !capture.ready} onClick={() => { setStarting(true); void capture.stash().then(() => setRun(undefined)).catch(capture.fail).finally(() => setStarting(false)); }}>暂存</button>}{draft.status !== "saved" && <button type="button" className="capture-stash" disabled={!draft.text.trim() || busy || voiceActive || !capture.ready} onClick={() => void saveOriginal()}>{savingOriginal ? "正在保存原文…" : "只存原文、稍后再整理"}</button>}<button type="submit" className="desktop-primary" disabled={!draft.text.trim() || busy || voiceActive || !capture.ready}><Icon name="journal" size={18} />{savingOriginal ? "正在保存原文…" : busy ? "正在整理…" : "整理成日记"}</button></>} />
      </div>
      <footer className="capture-footer"><button type="button" disabled={busy || voiceActive || !capture.ready || draft.status === "saved"} className="capture-destination" title={draft.status === "saved" ? "继续补充将更新原文件；移动文件请在生活记录中操作" : "选择保存目录"} onClick={() => setDialog("folder")}><Icon name="folder" size={16} /><span>保存到 <span>生活记录 / <strong>{draft.folder}</strong></span></span>{draft.status !== "saved" && <Icon name="down" size={13} />}</button><span role="status">{voiceActive ? "浅灰文字为临时转写，完成录音后会校准" : busy ? "正在整理，原话已保留" : capture.status}</span></footer>
    </form>
    <p className="capture-trust">整理成日记会把这段文字发给当前模型，只用来写成一篇日记。只存原文则留在本机，不发送。模型可以在<button type="button" onClick={openPreferences}>偏好设置</button>里更换或停用。</p>
    {(error || capture.error) && <p className="capture-error" role="alert">{error || capture.error}</p>}
    {savedOriginalId && <p role="status" className="capture-saved">原文已留在本机，没有发给模型。<NavLink to={pageHref(savedOriginalId)}>查看记录 <Icon name="arrow" size={14} /></NavLink></p>}
    {run?.status === "completed" && run.result?.outputPageId && <p role="status" className="capture-saved">已整理成日记并保存在本机。<NavLink to={pageHref(run.result.outputPageId)}>查看记录 <Icon name="arrow" size={14} /></NavLink>{(run.changes || []).filter((change) => change.kind !== "deleted" && wikiPageIdFromChange(change.path, run.configSnapshot?.paths.wiki)).map((change) => {
      const pageId = wikiPageIdFromChange(change.path, run.configSnapshot?.paths.wiki)!;
      return <NavLink key={change.path} to={pageHref(pageId)}>理解有更新</NavLink>;
    })}</p>}
    {dialog === "history" && <CaptureHistoryDialog entries={capture.history} restore={capture.restore} remove={capture.remove} close={() => setDialog(null)} />}
    {dialog === "folder" && <CaptureFolderDialog knowledgeBaseId={knowledgeBaseId} folder={draft.folder} defaultFolder={capture.defaultFolder} choose={capture.chooseFolder} close={() => setDialog(null)} />}
  </section>;
}
