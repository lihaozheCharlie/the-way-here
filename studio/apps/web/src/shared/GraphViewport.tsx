import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDismissLayer } from "./use-dismiss-layer";
import { useRememberedWindow } from "./use-remembered-preview";
import "./graph-viewport.css";

/** Shared graph camera: content coordinates stay independent of the viewport. */
export function GraphViewport({ label, width, height, children }: { label: string; width: number; height: number; children: ReactNode }) {
  const [camera, setCamera] = useState({ zoom: 1, x: 0, y: 0 });
  const expandedWindow = useRememberedWindow(`graph:${label}`);
  const expanded = expandedWindow.open;
  const dialog = useRef<HTMLDialogElement>(null);
  useDismissLayer(expanded, expandedWindow.hide, { priority: 2, element: dialog, outside: true });
  const expandButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const zoom = (factor: number) => setCamera(c => ({ ...c, zoom: Math.max(.4, Math.min(4, c.zoom * factor)) }));
  useEffect(() => {
    if (!expanded) return;
    if (!dialog.current?.open) dialog.current?.show();
    return () => { if (dialog.current?.contains(document.activeElement)) requestAnimationFrame(() => expandButton.current?.focus()); };
  }, [expanded]);
  useEffect(() => {
    const element = svg.current;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    element?.addEventListener("wheel", onWheel, { passive: false });
    return () => element?.removeEventListener("wheel", onWheel);
  }, [expanded]);
  const content = <div className="graph-viewport" aria-label={label}>
    <div className="graph-viewport-tools" role="toolbar" aria-label={`${label}视图控制`}>
      <button type="button" aria-label="缩小图谱" disabled={camera.zoom <= .4} onClick={() => zoom(1 / 1.25)}>−</button>
      <output aria-live="polite">{Math.round(camera.zoom * 100)}%</output>
      <button type="button" aria-label="放大图谱" disabled={camera.zoom >= 4} onClick={() => zoom(1.25)}>＋</button>
      <button type="button" onClick={() => setCamera({ zoom: 1, x: 0, y: 0 })}>适应画布</button>
      <button ref={expanded ? undefined : expandButton} type="button" onClick={expanded ? expandedWindow.hide : expandedWindow.show}>{expanded ? "退出放大" : "放大查看"}</button>
    </div>
    <svg ref={svg} className="graph-viewport-svg" viewBox={`${width / 2 - width / camera.zoom / 2 - camera.x} ${height / 2 - height / camera.zoom / 2 - camera.y} ${width / camera.zoom} ${height / camera.zoom}`} role="group" aria-label={label} tabIndex={0}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; if (["+", "=", "-", "0"].includes(event.key)) { event.preventDefault(); if (event.key === "0") setCamera({ zoom: 1, x: 0, y: 0 }); else zoom(event.key === "-" ? .8 : 1.25); } }}
      onPointerDown={event => { if (event.button !== 0 || (event.target as Element).closest('button, a, [role="button"]')) return; drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return; const rect = event.currentTarget.getBoundingClientRect(); const unit = Math.max(width / rect.width, height / rect.height) / camera.zoom; const dx = event.clientX - start.x, dy = event.clientY - start.y; setCamera(c => ({ ...c, x: c.x + dx * unit, y: c.y + dy * unit })); start.x = event.clientX; start.y = event.clientY; }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}>
      {children}
    </svg>
  </div>;
  return expanded ? <><div className="graph-viewport-placeholder" aria-hidden="true" /><dialog ref={dialog} className="graph-expanded-dialog" aria-label={`${label}放大查看`} onCancel={event => { event.preventDefault(); expandedWindow.hide(); }}>{content}</dialog></> : content;
}
