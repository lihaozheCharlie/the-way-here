import { useUpdateGuard } from "../../shared/update-readiness";
import { tr } from "../../shared/i18n";
import { RECORDING_LIMIT_MS } from "./recording-limit";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../shared/ui";
import "./capture-voice.css";

type Props = { onProgress?: (text: string) => void; onText: (text: string) => void; onActive: (active: boolean) => void; disabled?: boolean; hasText?: boolean; actions?: ReactNode };
export function CaptureVoice({ onText, onActive, onProgress, disabled, hasText, actions }: Props) {
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "processing">("idle");
  const [paused, setPaused] = useState(false), [changing, setChanging] = useState(false);
  const [error, setError] = useState(""), [backup, setBackup] = useState(false);
  const [levels, setLevels] = useState(() => Array<number>(12).fill(0));
  const [elapsed, setElapsed] = useState(0), [percent, setPercent] = useState(0);
  const transcript = useRef(""), pausedRef = useRef(false), seconds = useRef(0);
  const callbacks = useRef({ onProgress, onText, onActive }); callbacks.current = { onProgress, onText, onActive };
  const live = useRef(true), owned = useRef(false), active = useRef(false), pending = useRef(false), ended = useRef(false), discarded = useRef(false), backed = useRef(false);
  useUpdateGuard(() => !owned.current && !pending.current && !active.current);
  const stopRef = useRef<(discard?: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    live.current = true;
    const offLevel = window.desktop?.onSpeechLevel?.(level => {
      if (live.current && owned.current && !pausedRef.current && Number.isFinite(level)) setLevels(values => [...values.slice(1), Math.max(0, Math.min(1, level))]);
    });
    const offTranscript = window.desktop?.onSpeechTranscript?.(text => {
      if (!live.current || !owned.current || discarded.current || typeof text !== "string" || !text.trim()) return;
      transcript.current = text; callbacks.current.onProgress?.(text);
    });
    const offProgress = window.desktop?.onSpeechProgress?.(value => { if (live.current && owned.current) setPercent(value); });
    const offWarning = window.desktop?.onSpeechWarning?.(message => { if (live.current && owned.current && !discarded.current) setError(message); });
    const offBackup = window.desktop?.onSpeechBackup?.(() => { if (live.current && owned.current) { backed.current = true; setBackup(true); } });
    const offEnded = window.desktop?.onSpeechEnded?.(() => { if (!owned.current) return; ended.current = true; void stopRef.current(); });
    return () => {
      live.current = false; owned.current = false; offLevel?.(); offEnded?.(); offTranscript?.(); offWarning?.(); offBackup?.(); offProgress?.();
      if (active.current) { active.current = false; void window.desktop?.stopSpeech().catch(() => {}); }
    };
  }, []);
  async function stop(discard = false) {
    if (!active.current) return;
    discarded.current = discard; active.current = false; pending.current = true; setPhase("processing");
    try {
      const text = await window.desktop!.stopSpeech(discard);
      if (live.current && !discard) {
        const value = text.trim() ? text : transcript.current;
        if (value.trim()) callbacks.current.onText(value);
        else setError(backed.current ? tr("未能识别这段语音，原始录音已保留。") : tr("未检测到语音，请重新输入。"));
      }
    } catch (reason) {
      if (live.current && !discard) {
        if (transcript.current.trim()) { callbacks.current.onText(transcript.current); setError(tr("精确识别中断，已保留临时文字；可以打开录音补全。")); }
        else setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      pending.current = false; owned.current = false;
      if (live.current) { setPhase("idle"); callbacks.current.onActive(false); }
    }
  }
  stopRef.current = stop;
  useEffect(() => {
    if (phase !== "recording" || paused) return;
    const started = performance.now(), offset = seconds.current;
    const clock = window.setInterval(() => {
      seconds.current = offset + (performance.now() - started) / 1000; setElapsed(Math.floor(seconds.current));
      if (seconds.current * 1000 >= RECORDING_LIMIT_MS) void stopRef.current();
    }, 250);
    return () => { seconds.current = offset + (performance.now() - started) / 1000; window.clearInterval(clock); };
  }, [phase, paused]);
  async function record() {
    if (pending.current || active.current || disabled) return;
    setError(""); setPercent(0); setBackup(false); backed.current = false; transcript.current = "";
    if (!window.desktop) { setError(tr("请在 Mac 客户端中使用麦克风；这里可以继续输入文字。")); return; }
    owned.current = true; discarded.current = false; pending.current = true; setPhase("starting"); callbacks.current.onActive(true);
    ended.current = false; seconds.current = 0; pausedRef.current = false; setPaused(false); setLevels(Array<number>(12).fill(0)); setElapsed(0);
    try {
      await window.desktop.startSpeech();
      if (!live.current) { await window.desktop.stopSpeech(); return; }
      active.current = true; setPhase("recording");
      if (ended.current) await stopRef.current();
    } catch (reason) {
      owned.current = false;
      if (live.current) { setError(reason instanceof Error ? reason.message : String(reason)); setPhase("idle"); callbacks.current.onActive(false); }
    } finally { pending.current = false; }
  }
  async function togglePause() {
    if (!active.current || changing) return;
    setChanging(true);
    try { await window.desktop!.pauseSpeech!(!paused); pausedRef.current = !paused; setPaused(!paused); }
    catch (reason) { setError(reason instanceof Error ? reason.message : tr("暂停失败，请重试")); }
    finally { if (live.current) setChanging(false); }
  }
  const recording = phase === "recording";
  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  return <div className="capture-voice">
    {phase !== "idle" && <div className={`capture-listening${paused ? " is-paused" : ""}`} aria-label={tr("语音输入")}>
      <div className="capture-waveform" aria-hidden="true">{levels.map((level, index) => <i key={index} style={{ transform: `scaleY(${paused ? 0.8 : 1 + level * 5.8})` }} />)}</div>
      <div className="capture-listening-copy"><strong role="status">{recording ? paused ? tr("录音已暂停") : tr("正在听，临时文字会出现在上方") : phase === "starting" ? tr("正在开启麦克风…") : tr("正在精确识别${p0}", { "p0": percent > 0 ? ` ${percent}%` : "…" })}</strong><span>{time} · {recording ? tr("完成后校准文字与标点") : phase === "processing" ? tr("原始录音已保留，请稍候") : tr("请允许麦克风访问")}</span></div>
      {recording && <div className="capture-listening-controls">{window.desktop?.pauseSpeech && <button type="button" disabled={changing} onClick={() => void togglePause()}>{paused ? tr("继续录音") : tr("暂停")}</button>}<button type="button" disabled={changing} onClick={() => void stop()}>{tr("完成录音")}</button><button type="button" className="capture-cancel" aria-label={tr("取消本段录音")} title={tr("取消本段录音")} disabled={changing} onClick={() => void stop(true)}><Icon name="close" size={16} /></button></div>}
    </div>}
    <div className="capture-action-row"><div className="capture-voice-entry">{phase === "idle" && <button type="button" className="capture-speak" aria-label={tr("语音说一段")} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => void record()}><svg width="18" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>{hasText ? tr("接着说") : tr("说一段")}</button>}{backup && phase === "idle" && <button type="button" className="capture-voice-backup" onClick={() => void window.desktop?.revealSpeechRecording?.().catch(() => setError(tr("无法打开录音，请重试。")))}>{tr("原始录音")}</button>}</div><div className="capture-primary-actions">{actions}</div></div>
    {error && <p className="capture-voice-error" role="alert">{tr(error)}</p>}
  </div>;
}
