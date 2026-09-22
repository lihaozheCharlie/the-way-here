import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./floating-agent-panel.css";

const WIDTH_KEY = "the-way-here.agent-panel-width";
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;

export function FloatingAgentPanel({ open, children }: { open: boolean; children: ReactNode }) {
  useDismissLayer(open, () => { window.dispatchEvent(new Event("hide-inspector")); document.querySelector<HTMLButtonElement>(".agent-toggle")?.focus(); }, { priority: 0 });
  const id = useId();
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(saved) && saved >= MIN_WIDTH ? Math.min(saved, MAX_WIDTH) : DEFAULT_WIDTH;
    } catch { return DEFAULT_WIDTH; }
  });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const maxWidth = Math.max(0, Math.min(MAX_WIDTH, viewportWidth - 24));
  const minWidth = Math.min(MIN_WIDTH, maxWidth);
  const width = Math.min(preferredWidth, maxWidth);
  function updateWidth(value: number) {
    const next = Math.round(Math.max(minWidth, Math.min(maxWidth, value)));
    setPreferredWidth(next);
    try { localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* Resizing also works without storage. */ }
  }
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!open) { drag.current = null; setResizing(false); }
  }, [open]);

  return <aside className={`desktop-inspector floating-agent-panel${open ? " is-open" : " is-collapsed"}${resizing ? " is-resizing" : ""}`} style={{ width }} aria-label="AI 协作面板" inert={!open} aria-hidden={!open}>
    <div className="agent-panel-resize" role="separator" tabIndex={open ? 0 : -1} aria-label="调整 Agent 对话宽度" aria-orientation="vertical" aria-controls={id} aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={width} aria-valuetext={`${width} 像素`} title="拖动调整宽度，或使用左右方向键"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
        setResizing(true);
      }}
      onPointerMove={event => {
        if (drag.current?.pointerId === event.pointerId) updateWidth(drag.current.width + drag.current.x - event.clientX);
      }}
      onPointerUp={event => {
        if (drag.current?.pointerId !== event.pointerId) return;
        updateWidth(drag.current.width + drag.current.x - event.clientX);
        drag.current = null;
        setResizing(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onPointerCancel={() => { drag.current = null; setResizing(false); }}
      onKeyDown={event => {
        const step = event.shiftKey ? 64 : 16;
        const next = event.key === "ArrowLeft" ? width + step : event.key === "ArrowRight" ? width - step : event.key === "Home" ? minWidth : event.key === "End" ? maxWidth : undefined;
        if (next !== undefined) { event.preventDefault(); updateWidth(next); }
      }} />
    <div id={id} className="floating-agent-content">{children}</div>
  </aside>;
}
