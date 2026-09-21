import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { isTerminalRunStatus, type WikiRun } from "@the-way-here/shared";
import { api } from "../../api";
import { TextArea } from "../../shared/form-controls";
import { pageHref } from "../../shared/routing";
import { Icon } from "../../shared/ui";
import { CaptureVoice } from "../desktop/CaptureVoice";

export function LifeRecordCapture({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const key = `today.capture.${knowledgeBaseId}`;
  const [draft, setDraft] = useState(() => localStorage.getItem(key) || "");
  const [runId, setRunId] = useState(() => localStorage.getItem(`${key}.run`) || "");
  const [run, setRun] = useState<WikiRun>();
  const [starting, setStarting] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = starting || Boolean(runId && (!run || !isTerminalRunStatus(run.status)));
  useEffect(() => { localStorage.setItem(key, draft); }, [key, draft]);
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
          localStorage.removeItem(`${key}.run`);
          setRunId("");
          if (next.status === "completed" && next.result?.outputPageId) setDraft("");
          else setError(next.error || "整理未完成，原话已保留，可以再次发送。");
          return;
        }
      } catch (reason) {
        if (active) {
          const message = reason instanceof Error ? reason.message : "暂时无法获取进度，正在重试…";
          setError(message);
          if (message.includes("任务不存在") || message.includes("不一致")) {
            localStorage.removeItem(`${key}.run`); setRunId(""); return;
          }
        }
      }
      if (active) timer = setTimeout(() => void refresh(), 1500);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [runId, key, knowledgeBaseId]);

  async function submit() {
    if (!draft.trim() || busy || voiceActive || submitting.current) return;
    submitting.current = true; setStarting(true); setError(""); setRun(undefined);
    try {
      const next = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({
        knowledgeBaseId, mode: "read", title: "整理一条生活记录", prompt: "请整理这段生活记录。", displayPrompt: draft,
        outputTarget: { kind: "life-record", label: "随手记", originalText: draft },
      }) });
      localStorage.setItem(`${key}.run`, next.id); setRunId(next.id); setRun(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发送失败，原话已保留。"); }
    finally { submitting.current = false; setStarting(false); }
  }

  return <section className="today-capture" aria-labelledby="today-capture-title">
    <h2 id="today-capture-title">随手记一笔</h2>
    <p>写下来，或者说一段。我会帮你整理成一条生活记录。</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="today-composer">
        <TextArea ref={input} voice={false} rows={5} maxLength={50_000} disabled={busy} aria-label="此刻的记录" placeholder="此刻发生了什么，先留下来……" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
        }} />
        <div className="today-composer-tools">
          {!busy ? <CaptureVoice onActive={setVoiceActive} onText={text => {
            const start = input.current?.selectionStart ?? draft.length;
            const end = input.current?.selectionEnd ?? draft.length;
            setDraft(value => `${value.slice(0, start)}${text}${value.slice(end)}`);
            requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + text.length, start + text.length); });
          }} /> : <span role="status">正在整理，完成后会自动保存…</span>}
          <button type="submit" className="desktop-primary" disabled={!draft.trim() || busy || voiceActive}><Icon name="up" size={16} />{busy ? "正在整理…" : "整理并保存"}</button>
        </div>
      </div>
      <p className="today-capture-hint">AI 整理后保存为新的 Markdown 文件，同时保留你的原话。</p>
    </form>
    {error && <p className="today-capture-error" role="alert">{error}</p>}
    {run?.status === "completed" && run.result?.outputPageId && <p role="status" className="today-capture-saved">已保存到生活记录。<NavLink to={pageHref(run.result.outputPageId)}>查看记录 <Icon name="arrow" size={14} /></NavLink></p>}
  </section>;
}
