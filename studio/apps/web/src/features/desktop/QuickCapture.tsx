import { CaptureVoice } from "./CaptureVoice";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WikiPage, VaultInfo } from "@the-way-here/shared";
import { api } from "../../api";
import { TextArea } from "../../shared/form-controls";

export function QuickCapture({ vault }: { vault?: VaultInfo }) {
  const key = `desktop.capture.${vault?.knowledgeBaseId || "loading"}`;
  const [draft, setDraft] = useState(() => localStorage.getItem(key) || "");
  const [title, setTitle] = useState(() => localStorage.getItem(`${key}.title`) || "");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const latest = useRef({ draft, title });
  latest.current = { draft, title };
  const persist = useCallback(() => {
    if (latest.current.draft || latest.current.title) {
      localStorage.setItem(key, latest.current.draft);
      localStorage.setItem(`${key}.title`, latest.current.title);
    } else { localStorage.removeItem(key); localStorage.removeItem(`${key}.title`); }
  }, [key]);
  useEffect(() => {
    const timer = window.setTimeout(persist, 300);
    return () => clearTimeout(timer);
  }, [draft, title, persist]);
  useEffect(() => {
    window.addEventListener("pagehide", persist);
    return () => { window.removeEventListener("pagehide", persist); persist(); };
  }, [persist]);
  useEffect(() => {
    if (!message) { setFeedbackVisible(false); return; }
    setFeedbackVisible(true);
    if (failed) return;
    const fade = window.setTimeout(() => setFeedbackVisible(false), 1600);
    const clear = window.setTimeout(() => setMessage(""), 1800);
    return () => { clearTimeout(fade); clearTimeout(clear); };
  }, [message, failed]);
  async function save() {
    if (!draft.trim() || !vault || saving || voiceActive) return;
    setSaving(true); setMessage(""); setFailed(false);
    try {
      await api<WikiPage>("/api/capture", { method: "POST", body: JSON.stringify({ title: title.trim() || `随手记 ${new Date().toISOString().replace(/[:.]/g, "-")}`, markdown: draft, knowledgeBaseId: vault.knowledgeBaseId }) });
      latest.current = { draft: "", title: "" };
      setDraft(""); setTitle(""); localStorage.removeItem(key); localStorage.removeItem(`${key}.title`);
      setMessage("已保存到生活记录，原话完整保留");
    } catch (e: any) { setFailed(true); setMessage(e.message); } finally { setSaving(false); }
  }
  return <section className="quick-capture"><h1>随手记</h1><p>此刻发生了什么，先留下来。</p><label>保存到<span className="capture-space">{vault?.name || "正在打开知识库…"}</span></label><input aria-label="记录标题（可选）" placeholder="标题（可选）" value={title} disabled={saving} onChange={(e) => setTitle(e.target.value)} /><TextArea ref={contentRef} voice={false} aria-label="随手记内容" rows={9} disabled={saving} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="写一段，或点麦克风说说…" />{!saving ? <CaptureVoice onActive={setVoiceActive} onText={text => { const node = contentRef.current; const start = node?.selectionStart ?? draft.length, end = node?.selectionEnd ?? draft.length; setDraft(value => `${value.slice(0,start)}${text}${value.slice(end)}`); requestAnimationFrame(() => { node?.focus(); node?.setSelectionRange(start + text.length,start + text.length); }); }} /> : null}<footer><span>确认后才保存原始记录</span><button className="desktop-primary" disabled={!vault || !draft.trim() || saving || voiceActive} onClick={() => void save()}>{saving ? "正在保存…" : "保存记录"}</button></footer><p className={`capture-feedback${feedbackVisible ? " is-visible" : ""}`} role={failed ? "alert" : "status"}>{message}</p></section>;
}
