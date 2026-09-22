import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { TextInput } from "../../shared/form-controls";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../shared/ui";

export function DemoKnowledgeBaseNotice({ hasPersonalKnowledgeBase, onCreate, onOpenPersonal }: {
  hasPersonalKnowledgeBase: boolean;
  onCreate: () => void;
  onOpenPersonal: () => void;
}) {
  return <section className={`demo-kb-notice${hasPersonalKnowledgeBase ? " is-established" : ""}`} aria-labelledby="demo-kb-notice-title">
    <div className="demo-kb-notice-mark"><Icon name="library" size={19} /></div>
    <div>
      <strong id="demo-kb-notice-title">先看看我会怎样记住一段生活</strong>
      <p>{hasPersonalKnowledgeBase
        ? "这里是匿名故事，适合随便逛逛。你自己的空间与它完全分开。"
        : "这里是一段匿名故事。准备好之后，可以建立只属于你的空间；你说过的话不会和演示内容混在一起。"}</p>
    </div>
    <button type="button" className={hasPersonalKnowledgeBase ? "secondary-action" : "primary-action"} onClick={hasPersonalKnowledgeBase ? onOpenPersonal : onCreate}>
      {hasPersonalKnowledgeBase ? "回到我的空间" : "开始我的空间"}<Icon name="arrow" size={15} />
    </button>
  </section>;
}

export function CreateKnowledgeBaseDialog({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("我的 The Way Here");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const dialogRef = useRef<HTMLElement>(null);
  useDismissLayer(true, onClose, { dismissible: !saving, priority: 1, element: dialogRef });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus(); inputRef.current?.select();
    const keyboard = (event: KeyboardEvent) => {
      if(event.key !== "Tab") return;
      const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || [])];
      const first = nodes[0], last = nodes.at(-1);
      if(event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if(!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown",keyboard);
    return () => { window.removeEventListener("keydown",keyboard); if(previous?.isConnected) previous.focus(); };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) { setError("请输入空间名称"); inputRef.current?.focus(); return; }
    setSaving(true);
    setError("");
    try {
      await onSubmit(name.trim());
    } catch (reason: any) {
      setSaving(false);
      setError(reason.message || "个人空间暂时无法创建，请稍后再试");
    }
  }

  return <div className="kb-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section ref={dialogRef} className="kb-dialog" role="dialog" aria-modal="true" aria-labelledby="kb-dialog-title" aria-describedby="kb-dialog-description">
      <form onSubmit={submit}>
        <header>
          <div className="kb-dialog-symbol"><Icon name="library" size={22} /></div>
          <div><h2 id="kb-dialog-title">新建知识库</h2><p id="kb-dialog-description">给这个空间起个名字，之后可以在偏好设置里重命名。</p></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="关闭"><Icon name="close" size={18} /></button>
        </header>
        <div className="kb-dialog-body">
          <label htmlFor="knowledge-base-name">空间名称</label>
          <TextInput ref={inputRef} id="knowledge-base-name" value={name} maxLength={40} disabled={saving} aria-invalid={Boolean(error)} aria-describedby={error ? "knowledge-base-name-error" : undefined} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { setName(event.target.value); setError(""); }} />
          <p>创建后会打开一个空白空间。演示内容不会被复制，你可以从第一句话慢慢开始。</p>
          {error ? <div id="knowledge-base-name-error" className="kb-dialog-error" role="alert">{error}</div> : null}
        </div>
        <footer>
          <button type="button" className="secondary-action" onClick={onClose} disabled={saving}>取消</button>
          <button className="primary-action" disabled={saving}>{saving ? "正在准备…" : "创建并开始"}</button>
        </footer>
      </form>
    </section>
  </div>;
}
