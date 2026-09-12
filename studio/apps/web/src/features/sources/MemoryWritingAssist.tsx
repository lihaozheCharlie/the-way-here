import { useId, useRef, useState } from "react";
import { TextArea } from "../../shared/form-controls";
import { Icon, type IconName } from "../../shared/ui";
import "./memory-writing-assist.css";

/** Both memory editors own their drafts; disclosure never discards background text. */
export function MemoryWritingAssist({ background, onBackground, context = [], placeholder, disabled, generating, onGenerate }: {
  background: string; onBackground: (value: string) => void; context?: { text: string; icon: IconName }[]; placeholder: string;
  disabled: boolean; generating: boolean; onGenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const filled = Boolean(background.trim());
  return <section className="memory-writing-assist" aria-label="AI 写作助手" aria-busy={generating}>
    <div className="memory-writing-toolbar">
      <button type="button" className={`memory-background-toggle${filled ? " is-filled" : ""}`} aria-expanded={expanded} aria-controls={id} onClick={() => { setExpanded(!expanded); if (!expanded) requestAnimationFrame(() => input.current?.focus()); }}>
        <span aria-hidden="true">{expanded ? "−" : filled ? "✓" : "+"}</span>{expanded ? "收起背景信息" : filled ? "背景信息 · 已填写" : "补充背景信息"}
      </button>
      <div className="memory-writing-actions">{context.length ? <div className="memory-writing-context">{context.map(({ text, icon }) => <span className="memory-context-chip" key={text}><Icon name={icon} size={14} /><span>{text}</span></span>)}</div> : null}
        <button type="button" className="memory-writing-generate" disabled={disabled || generating} onClick={onGenerate}><Icon name="spark" size={15} />{generating ? filled ? "正在结合背景润色…" : "正在写…" : filled ? "结合背景润色" : "AI 帮你写"}</button>
      </div>
    </div>
    <div id={id} hidden={!expanded} className="memory-writing-background">
      {expanded ? <><label htmlFor={`${id}-input`}>背景信息（可选）</label><TextArea ref={input} id={`${id}-input`} rows={3} maxLength={10000} value={background} disabled={disabled || generating} onChange={(event) => onBackground(event.target.value)} placeholder={placeholder} /><p>补充你记得的经历、人物或缘由，收起后仍会保留。</p></> : null}
    </div>
    <p className="memory-writing-note" aria-live="polite">{filled ? "AI 会结合背景信息和以上线索润色，结果可在下方继续修改。" : "可直接根据以上线索起草，生成后请核对并修改。"}</p>
  </section>;
}
