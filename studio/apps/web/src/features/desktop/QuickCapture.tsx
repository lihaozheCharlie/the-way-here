import { useState } from "react";
import type { WikiPage, VaultInfo } from "@the-way-here/shared";
import { api } from "../../api";
import { TextArea } from "../../shared/form-controls";
export function QuickCapture({ vault }: { vault?: VaultInfo }) {
  const key = `desktop.capture.${vault?.knowledgeBaseId || "loading"}`;
  const [draft, setDraft] = useState(() => localStorage.getItem(key) || "");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (!draft.trim() || !vault || saving) return;
    setSaving(true); setMessage("");
    try {
      await api<WikiPage>("/api/capture", { method: "POST", body: JSON.stringify({ title: title.trim() || `随手记 ${new Date().toISOString().replace(/[:.]/g, "-")}`, markdown: draft, knowledgeBaseId: vault.knowledgeBaseId }) });
      setDraft(""); setTitle(""); localStorage.removeItem(key); setMessage("已保存到生活记录，原话完整保留。");
    } catch (e: any) { setMessage(e.message); } finally { setSaving(false); }
  }
  return <section className="quick-capture"><h1>随手记</h1><p>此刻发生了什么，先留下来。</p><label>保存到<span className="capture-space">{vault?.name || "正在打开知识库…"}</span></label><input aria-label="记录标题（可选）" placeholder="标题（可选）" value={title} onChange={(e) => setTitle(e.target.value)} /><TextArea aria-label="随手记内容" rows={9} value={draft} onChange={(e) => { setDraft(e.target.value); localStorage.setItem(key, e.target.value); }} placeholder="写一段，或点麦克风说说…" /><footer><span>确认后才保存原始记录</span><button className="desktop-primary" disabled={!vault || !draft.trim() || saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存记录"}</button></footer><p role="status">{message}</p></section>;
}
