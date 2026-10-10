import { useRef, useState, type FormEvent } from "react";
import { TextInput } from "./form-controls";
import { Icon } from "./ui";
import { useDismissLayer } from "./use-dismiss-layer";

export function InlineNameForm({ label, placeholder, onCreate, onCancel }: { label: string; placeholder: string; onCreate: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useDismissLayer(true, onCancel, { dismissible: !busy, element: form });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try { await onCreate(name.trim()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "创建失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <form ref={form} className="inline-name-form" aria-label={label} aria-busy={busy} onSubmit={submit}>
    <div><TextInput autoFocus autoComplete="off" aria-label={label} placeholder={placeholder} value={name} disabled={busy} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} /><button type="submit" disabled={busy || !name.trim()} aria-label={label} title={label}><Icon name="arrow" size={14} /></button><button type="button" disabled={busy} aria-label="取消新建" title="取消新建" onClick={onCancel}><Icon name="close" size={14} /></button></div>
    {error && <p role="alert">{error}</p>}
  </form>;
}
