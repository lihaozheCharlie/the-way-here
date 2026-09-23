import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LifeStageView, ReasoningLens, WikiPageSummary } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { LetterLensChoices } from "./LetterLensPicker";

export type LetterRequestStage = {
  title: string;
  range?: string;
  pageId?: string;
  summary?: string;
  related?: {
    events: WikiPageSummary[];
    people: WikiPageSummary[];
    places: WikiPageSummary[];
    systems: WikiPageSummary[];
    letters: WikiPageSummary[];
  };
};
export type LetterRequest = { stage?: LetterRequestStage; lens?: { name: string; attention?: string }; focus?: string; description?: string };

export function LetterComposer({ stages, lenses, onSubmit }: { stages: LifeStageView[]; lenses: ReasoningLens[]; onSubmit: (request: LetterRequest) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"guided" | "free">("guided");
  const [picker, setPicker] = useState<"stage" | "lens" | null>(null);
  const [stage, setStage] = useState<LifeStageView>();
  const [lens, setLens] = useState<ReasoningLens>();
  const [focus, setFocus] = useState("");
  const [description, setDescription] = useState("");
  const [customStage, setCustomStage] = useState("");
  const [customLens, setCustomLens] = useState("");
  const headingId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); setPicker(null); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea")];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);
  const chosenStage: LetterRequestStage | undefined = stage ? {
    title: stage.page.title,
    range: stage.range,
    pageId: stage.page.id,
    summary: stage.focus,
    related: { events: stage.relatedEvents, people: stage.relatedPeople, places: stage.relatedPlaces, systems: stage.relatedSystems, letters: stage.relatedLetters },
  } : customStage.trim() ? { title: customStage.trim() } : undefined;
  const chosenLens = lens ? { name: lens.displayName, attention: lens.attention } : customLens.trim() ? { name: customLens.trim() } : undefined;
  const ready = mode === "guided" ? Boolean(chosenStage) : description.trim().length > 6;
  const submit = () => {
    if (!ready) return;
    onSubmit(mode === "guided" ? { stage: chosenStage, lens: chosenLens, focus: focus.trim() } : { description: description.trim() });
    close();
    setStage(undefined); setLens(undefined); setFocus(""); setDescription(""); setCustomStage(""); setCustomLens(""); setMode("guided");
  };
  return <>
    <button ref={trigger} type="button" className="letter-compose-cta" onClick={() => setOpen(true)}><Icon name="plus" size={16} />主动写一封</button>
    {open && createPortal(<div className="letter-compose-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialog} className="letter-compose-dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className="letter-compose-head"><div><h2 id={headingId}>主动写一封回信</h2><p>选一段经历，视角可以由写信时自动选择。回信会依据已有材料来写。</p></div><button type="button" aria-label="关闭写信窗口" onClick={close}><Icon name="close" size={18} /></button></header>
        <div className="letter-compose-modes" role="group" aria-label="写信方式"><button type="button" aria-pressed={mode === "guided"} onClick={() => { setMode("guided"); setPicker(null); }}>填空引导</button><button type="button" aria-pressed={mode === "free"} onClick={() => { setMode("free"); setPicker(null); }}>自由描述</button></div>
        {mode === "guided" ? <>
          <div className="letter-compose-sentence">对我 <button type="button" className="letter-compose-blank" aria-expanded={picker === "stage"} onClick={() => setPicker(picker === "stage" ? null : "stage")}>{chosenStage ? `${chosenStage.title}${chosenStage.range ? `（${chosenStage.range}）` : ""}` : "选择一个阶段"} <Icon name="down" size={14} /></button> 的经历，以 <button type="button" className="letter-compose-blank" aria-expanded={picker === "lens"} onClick={() => setPicker(picker === "lens" ? null : "lens")}>{chosenLens?.name || "自动选择视角"} <Icon name="down" size={14} /></button> 写一封回信，重点想读到 <input aria-label="关注点（选填）" value={focus} onChange={event => setFocus(event.target.value)} placeholder="哪个感受 / 哪次决定（选填）" />。</div>
          <p className="letter-compose-hint">关注点可以留空，写信时会从这段经历里寻找值得回应的事。</p>
          {picker === "stage" && <div className="letter-compose-picker"><p>人生轨迹中的阶段，或描述一段经历</p><div className="letter-compose-stage-grid">{stages.map(item => <button key={item.page.id} type="button" aria-pressed={stage?.page.id === item.page.id} onClick={() => { setStage(item); setCustomStage(""); setPicker(null); }}><b>{item.page.title}</b><small>{item.range}</small></button>)}</div><div className="letter-compose-custom-input"><input aria-label="描述一段经历" value={customStage} onChange={event => { setCustomStage(event.target.value); setStage(undefined); }} placeholder="例如：刚辞职、搬到新城市的那段经历" /><button type="button" disabled={!customStage.trim()} onClick={() => setPicker(null)}>使用这段经历</button></div></div>}
          {picker === "lens" && <div className="letter-compose-picker letter-compose-lens-picker"><p>视角（选填），默认依据这段经历自动选择</p><LetterLensChoices lenses={lenses} selectedId={lens?.id} autoSelected={!chosenLens} onAutoSelect={() => { setLens(undefined); setCustomLens(""); setPicker(null); }} onSelect={item => { setLens(item); setCustomLens(""); setPicker(null); }} /><div className="letter-compose-custom-input"><input aria-label="自定义视角" value={customLens} onChange={event => { setCustomLens(event.target.value); setLens(undefined); }} placeholder="自定义视角" /><button type="button" disabled={!customLens.trim()} onClick={() => setPicker(null)}>使用这个视角</button></div></div>}
        </> : <div className="letter-compose-free"><label htmlFor="letter-free-description">说说你想收到怎样的回信</label><textarea id="letter-free-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="例如：写一封关于我刚辞职那段时间的信，帮我看看当时在担心什么。" /><small>请说清想回看的经历；视角与关注点可以不写，拿不准的地方会先在对话中向你确认。</small></div>}
        <footer className="letter-compose-foot"><button type="button" onClick={close}>取消</button><button type="button" disabled={!ready} onClick={submit}>生成回信</button></footer>
      </div>
    </div>, document.body)}
  </>;
}
