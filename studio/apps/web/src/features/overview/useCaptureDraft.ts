import { useUpdateGuard } from "../../shared/update-readiness";
import { tr } from "../../shared/i18n";
import { useEffect, useRef, useState } from "react";
import type { CaptureEntry, CaptureHistory } from "@the-way-here/shared";
import { api } from "../../api";

export function localDiaryDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; }
type Draft = { id: string; revision: number; text: string; folder: string; diaryDate: string; status?: "draft" | "saved" };
export function useCaptureDraft(knowledgeBaseId: string, legacyKey: string) {
  const key = `capture.${knowledgeBaseId}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try { const stored = JSON.parse(localStorage.getItem(key) || "null"); if (stored?.id && typeof stored.text === "string") return { ...stored, text: localStorage.getItem(`${key}.voice`) || stored.text }; } catch { /* Recover legacy text below. */ }
    const text = localStorage.getItem(`${legacyKey}.voice`) || localStorage.getItem(legacyKey) || "";
    const title = localStorage.getItem(`${legacyKey}.title`);
    return { id: crypto.randomUUID(), revision: 0, text: title ? `${title}\n\n${text}` : text, folder: "随手记", diaryDate: localDiaryDate() };
  });
  const [history, setHistory] = useState<CaptureEntry[]>([]), [defaultFolder, setDefaultFolder] = useState("随手记");
  const [status, setStatus] = useState(draft.text ? tr("草稿已恢复，可编辑或接着说") : "");
  const [error, setError] = useState(""), [ready, setReady] = useState(false);
  const current = useRef(draft); current.current = draft;
  const live = useRef(true), queue = useRef<Promise<unknown>>(Promise.resolve());
  const revisions = useRef(new Map<string, number>([[draft.id, draft.revision]]));
  const stored = useRef(new Map<string, string>());
  useUpdateGuard(async () => { if (!ready) return false; await flush(); return true; });
  const persisted = useRef(new Map<string, CaptureEntry>());
  function fingerprint(value: Draft) { return JSON.stringify([value.text, value.folder, value.diaryDate]); }
  async function refresh() {
    const next = await api<CaptureHistory>(`/api/capture/history?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`);
    if (!live.current) return;
    setHistory(next.entries); setDefaultFolder(next.defaultFolder);
    return next;
  }
  useEffect(() => {
    live.current = true;
    void refresh().then(next => {
      if (!next || !live.current) return;
      const value = current.current, entry = next.entries.find(e => e.id === value.id);
      if (entry) {
        persisted.current.set(entry.id, entry);
        // A local checkpoint may be newer after a crash; keep it, but never overwrite a remote edit silently.
        if (entry.text === value.text || entry.revision === value.revision) {
          revisions.current.set(entry.id, entry.revision);
          if (entry.text === value.text) stored.current.set(entry.id, fingerprint(entry));
          setDraft(v => ({ ...v, revision: entry.revision, status: entry.status }));
        }
      } else if (!value.text && !value.revision) setDraft(v => ({ ...v, folder: next.defaultFolder }));
      setReady(true);
    }).catch(reason => { if (live.current) setError(reason instanceof Error ? reason.message : tr("无法读取历史记录，当前文字已留在本机")); });
    return () => { live.current = false; };
  }, [knowledgeBaseId]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(draft)); } catch { setError(tr("本机备份空间不足，请先暂存当前文字")); } }, [key, draft]);
  function flush(): Promise<CaptureEntry | undefined> {
    const value = { ...current.current };
    const task = queue.current.catch(() => {}).then(async () => {
      if (!value.text.trim() && !value.revision) return undefined;
      const signature = fingerprint(value);
      if (stored.current.get(value.id) === signature) {
        const entry = persisted.current.get(value.id);
        if (live.current && current.current.id === value.id) setStatus(status => status === "正在暂存…" ? entry?.status === "saved" ? tr("补充已暂存，再次保存将更新原文件") : tr("草稿已暂存") : status);
        return entry;
      }
      if (live.current) setStatus(tr("正在暂存…"));
      const entry = await api<CaptureEntry>("/api/capture/draft", { method: "PUT", body: JSON.stringify({ ...value, knowledgeBaseId, revision: revisions.current.get(value.id) || 0 }) });
      revisions.current.set(entry.id, entry.revision); stored.current.set(entry.id, signature); persisted.current.set(entry.id, entry);
      if (live.current) {
        setHistory(values => [entry, ...values.filter(e => e.id !== entry.id)]);
        if (current.current.id === entry.id) {
          setDraft(v => ({ ...v, revision: entry.revision, status: entry.status }));
          if (fingerprint(current.current) === signature) setStatus(entry.status === "saved" ? tr("补充已暂存，再次保存将更新原文件") : tr("草稿已暂存"));
        }
        setError("");
      }
      return entry;
    });
    queue.current = task;
    return task;
  }
  function fail(reason: unknown) { if (live.current) { setError(reason instanceof Error ? reason.message : tr("暂存失败，当前文字已留在本机")); setStatus(tr("暂存未完成，文字已留在本机")); } }
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void flush().catch(fail), 600);
    return () => window.clearTimeout(timer);
  }, [draft.text, draft.folder, ready]);
  function reset() {
    const value: Draft = { id: crypto.randomUUID(), revision: 0, text: "", folder: defaultFolder, diaryDate: localDiaryDate() };
    current.current = value; setDraft(value); setStatus(""); localStorage.removeItem(`${key}.voice`); localStorage.removeItem(legacyKey); localStorage.removeItem(`${legacyKey}.voice`); localStorage.removeItem(`${legacyKey}.title`);
  }
  async function stash() { await flush(); reset(); }
  async function restore(entry: CaptureEntry) {
    await flush();
    revisions.current.set(entry.id, entry.revision); stored.current.set(entry.id, fingerprint(entry)); persisted.current.set(entry.id, entry);
    const value: Draft = { id: entry.id, revision: entry.revision, text: entry.text, folder: entry.folder, diaryDate: entry.diaryDate, status: entry.status };
    current.current = value; setDraft(value); setStatus(entry.status === "saved" ? tr("再次保存将更新原文件") : tr("草稿已恢复，可编辑或接着说"));
  }
  function setText(text: string) { setStatus(tr("正在暂存…")); const value = { ...current.current, text }; current.current = value; setDraft(value); }
  async function chooseFolder(folder: string, makeDefault: boolean) {
    if (makeDefault) { await api("/api/capture/default-folder", { method:"PUT", body: JSON.stringify({ knowledgeBaseId, folder }) }); setDefaultFolder(folder); }
    const value = { ...current.current, folder }; current.current = value; setDraft(value);
  }
  async function remove(entry: CaptureEntry) {
    await api(`/api/capture/history/${encodeURIComponent(entry.id)}`, { method: "DELETE", body: JSON.stringify({ knowledgeBaseId, revision: entry.revision }) });
    if (current.current.id === entry.id) reset();
    setHistory(values => values.filter(e => e.id !== entry.id));
  }
  return { key, draft, history, defaultFolder, status, error, ready, refresh, flush, stash, restore, reset, setText, chooseFolder, remove, fail };
}
