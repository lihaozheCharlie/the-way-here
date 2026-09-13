import { useEffect, useRef, useState } from "react";
export function CaptureVoice({ onText, onActive }: { onText: (text: string) => void; onActive: (active: boolean) => void }) {
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const live = useRef(true), active = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; if(active.current) void window.desktop?.stopSpeech().catch(() => {}); }; }, []);
  async function stop() {
    if (!active.current) return;
    active.current = false; setBusy(true);
    try { const text = await window.desktop!.stopSpeech(); if(live.current) { if(text.trim()) onText(text); else setError("没有听清，请再试一次。你也可以直接输入。"); } }
    catch(reason: any) { if(live.current) setError(reason.message); }
    finally { if(live.current) { setRecording(false); setBusy(false); onActive(false); } }
  }
  useEffect(() => { if(!recording) return; const timer = window.setTimeout(() => void stop(), 60_000); return () => clearTimeout(timer); }, [recording]);
  async function toggle() {
    setError("");
    if(recording) { await stop(); return; }
    if(!window.desktop) { setError("请在 Mac 客户端中使用麦克风；这里可以继续输入文字。"); return; }
    setBusy(true); onActive(true);
    try { await window.desktop.startSpeech(); if(!live.current) { await window.desktop.stopSpeech(); return; } active.current = true; setRecording(true); }
    catch(reason: any) { if(live.current) { setError(reason.message); onActive(false); } }
    finally { if(live.current) setBusy(false); }
  }
  return <div className="capture-voice"><button type="button" className={`voice-input-button${recording ? " voice-recording" : ""}`} disabled={busy} aria-pressed={recording} aria-label={recording ? "结束录音" : "语音说一段"} onMouseDown={event => event.preventDefault()} onClick={() => void toggle()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg></button><span role="status">{busy ? "正在处理语音…" : recording ? "正在录音，再点一次结束 · 最多 60 秒" : "说一段，文字会留在光标处"}</span>{error ? <p role="alert">{error}</p> : null}</div>;
}
