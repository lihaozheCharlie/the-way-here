import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { PhotoFilmstrip } from "./PhotoFilmstrip";
import type { PhotoBox, PhotoMemory, PhotoPerson } from "@the-way-here/shared";
import { photoAssetUrl } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { PhotoPersonPicker, type PhotoPersonOption } from "./PhotoPersonPicker";
import { drawnPhotoBox, movePhotoBox, photoPoint, resizePhotoBox, type PhotoBoxHandle, type PhotoPoint } from "./photo-box-interaction";
import { groupedPhotoQueue, type FaceGroups } from "./photo-face-groups";

type BoxGesture = { pointerId: number; person: PhotoPerson; start: PhotoPoint; last: PhotoBox; handle?: PhotoBoxHandle; moved: boolean };
const handles: PhotoBoxHandle[] = ["n", "s", "nw", "ne", "sw", "se"];
const handleNames: Record<PhotoBoxHandle, string> = { n: "上边", s: "下边", nw: "左上角", ne: "右上角", sw: "左下角", se: "右下角" };

export function PhotoPersonQueue({ memory, drafts, groups, onDetach, groupingError, selectedId, photoId, people, locked, onSelect, onPhoto, onChange, onAdd, onConfirm, onCommitBox, onSkip, detecting, detectionLabel, detectionError, onRetry }: {
  groups: FaceGroups; onDetach: (id: string) => void; groupingError?: string;
  memory: PhotoMemory; drafts: Record<string, PhotoPerson[]>; selectedId: string; photoId: string;
  people: PhotoPersonOption[]; locked: boolean;
  onSelect: (id: string) => void; onPhoto: (id: string) => void;
  onChange: (photoId: string, personId: string, patch: Partial<PhotoPerson>) => void;
  onAdd: (photoId: string, box: PhotoBox) => void;
  onConfirm: (photoId: string, person: PhotoPerson) => void; onCommitBox: (photoId: string, person: PhotoPerson) => void;
  onSkip: (photoId: string, person: PhotoPerson) => void;
  detecting: boolean; detectionLabel?: string; detectionError?: string; onRetry: () => void;
}) {
  const photo = memory.photos.find((photo) => photo.id === photoId) ?? memory.photos[0]!;
  const candidates = drafts[photo.id] ?? photo.people;
  const person = candidates.find((person) => person.id === selectedId);
  const group = groupedPhotoQueue(memory, drafts, groups).find((entry) => entry.members.some((member) => member.person.id === person?.id));
  const panelId = useId();
  const formRef = useRef<HTMLFieldSetElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const faceButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const faceLabels = useRef<Record<string, HTMLButtonElement | null>>({});
  const faceTags = useRef<Record<string, HTMLDivElement | null>>({});
  const gesture = useRef<BoxGesture | undefined>(undefined);
  const gestureActions = useRef({ photoId: photo.id, onChange, onCommitBox, onSelect });
  gestureActions.current = { photoId: photo.id, onChange, onCommitBox, onSelect };
  const suppressClick = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<PhotoPoint>();
  const [drawEnd, setDrawEnd] = useState<PhotoPoint>();
  const [namingId, setNamingId] = useState("");

  useEffect(() => { setDrawing(false); setDrawStart(undefined); setDrawEnd(undefined); setNamingId(""); gesture.current = undefined; }, [photo.id]);
  useEffect(() => {
    if (!drawing) return;
    const cancel = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setDrawing(false); setDrawStart(undefined); setDrawEnd(undefined); } };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [drawing]);
  useEffect(() => {
    if (!selectedId) { setNamingId(""); return; }
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || faceTags.current[selectedId]?.contains(target)) return;
      setNamingId(""); onSelect("");
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [selectedId, onSelect]);
  const previousPerson = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!person && previousPerson.current) faceButtons.current[previousPerson.current]?.focus({ preventScroll: true });
    previousPerson.current = person?.id;
  }, [person?.id]);
  const identified = Object.fromEntries(memory.photos.map((photo) => {
    const entries = drafts[photo.id] ?? photo.people;
    return [photo.id, entries.length && entries.every((person) => Boolean(person.name)) ? "done" as const : entries.some((person) => Boolean(person.name)) ? "pending" as const : "empty" as const];
  }));
  useEffect(() => { if (namingId && namingId === person?.id) formRef.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus({ preventScroll: true }); }, [namingId, person?.id]);

  const closeNaming = (returnFocus = false) => {
    const previous = namingId;
    setNamingId("");
    if (returnFocus && previous) window.requestAnimationFrame(() => faceLabels.current[previous]?.focus({ preventScroll: true }));
  };
  const openNaming = (candidate: PhotoPerson) => {
    onSelect(candidate.id); setNamingId(candidate.id);
  };

  const pointFor = (event: Pick<ReactPointerEvent, "clientX" | "clientY">) => {
    const rect = imageRef.current?.getBoundingClientRect();
    return rect ? photoPoint(event.clientX, event.clientY, rect) : undefined;
  };
  const beginDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawing || locked || detecting || event.button !== 0) return;
    const point = pointFor(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawStart(point); setDrawEnd(point); onSelect("");
  };
  const continueDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawStart || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFor(event);
    if (point) setDrawEnd(point);
  };
  const finishDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawStart) return;
    const end = pointFor(event) ?? drawEnd ?? drawStart;
    const box = drawnPhotoBox(drawStart, end);
    setDrawStart(undefined); setDrawEnd(undefined);
    if (box) { onAdd(photo.id, box); setDrawing(false); }
  };
  const beginBoxGesture = (event: ReactPointerEvent<HTMLButtonElement>, candidate: PhotoPerson, handle?: PhotoBoxHandle) => {
    if (locked || detecting || drawing || event.button !== 0) return;
    const start = pointFor(event);
    if (!start) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setNamingId(""); onSelect(candidate.id);
    gesture.current = { pointerId: event.pointerId, person: candidate, start, last: candidate.box, handle, moved: false };
  };
  useEffect(() => {
    const continueBoxGesture = (event: globalThis.PointerEvent) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      const current = pointFor(event);
      if (!current) return;
      const delta = { x: current.x - active.start.x, y: current.y - active.start.y };
      const next = active.handle ? resizePhotoBox(active.person.box, active.handle, delta) : movePhotoBox(active.person.box, delta);
      active.last = next;
      active.moved ||= Math.abs(delta.x) + Math.abs(delta.y) > .004;
      gestureActions.current.onChange(gestureActions.current.photoId, active.person.id, { box: next });
    };
    const finishBoxGesture = (event: globalThis.PointerEvent) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      gesture.current = undefined;
      suppressClick.current = active.moved;
      if (active.moved && active.person.name) gestureActions.current.onCommitBox(gestureActions.current.photoId, { ...active.person, box: active.last });
      else if (active.moved) gestureActions.current.onSelect(active.person.id);
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    };
    const cancelBoxGesture = (event: globalThis.PointerEvent) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      gesture.current = undefined;
      gestureActions.current.onChange(gestureActions.current.photoId, active.person.id, { box: active.person.box });
    };
    window.addEventListener("pointermove", continueBoxGesture, { capture: true, passive: false });
    window.addEventListener("pointerup", finishBoxGesture, true);
    window.addEventListener("pointercancel", cancelBoxGesture, true);
    return () => {
      window.removeEventListener("pointermove", continueBoxGesture, true);
      window.removeEventListener("pointerup", finishBoxGesture, true);
      window.removeEventListener("pointercancel", cancelBoxGesture, true);
    };
  }, []);
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, candidate: PhotoPerson, handle: PhotoBoxHandle) => {
    const arrows: Record<string, PhotoPoint> = { ArrowLeft: { x: -.01, y: 0 }, ArrowRight: { x: .01, y: 0 }, ArrowUp: { x: 0, y: -.01 }, ArrowDown: { x: 0, y: .01 } };
    const delta = arrows[event.key];
    if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const box = resizePhotoBox(candidate.box, handle, delta);
    onChange(photo.id, candidate.id, { box });
    if (candidate.name) onCommitBox(photo.id, { ...candidate, box });
  };
  const draftBox = drawStart && drawEnd ? drawnPhotoBox(drawStart, drawEnd, 0) : undefined;

  return <section className="photo-identify-step">
    <PhotoFilmstrip memory={memory} selectedId={photo.id} onSelect={onPhoto} disabled={locked} identified={identified} />
    <header className="photo-stage-heading"><div><h3>照片里有谁？</h3><p>点人物框后直接拖动或缩放；点框上的姓名标签再填写人物。认出一个人，同组照片会一起更新。</p></div><button type="button" className="photo-manual-face-action" aria-pressed={drawing} disabled={locked || detecting} onClick={() => { setDrawing((value) => !value); setDrawStart(undefined); setDrawEnd(undefined); setNamingId(""); onSelect(""); }}><Icon name={drawing ? "close" : "plus"} size={14} />{drawing ? "取消圈选" : "圈选漏掉的人"}</button></header>
    {drawing ? <p className="photo-draw-instruction" role="status">在照片上按住并拖动，框住人物的脸部。</p> : null}
    <div className="photo-tag-stage">
      <div ref={imageRef} className={`photo-tag-image${drawing ? " drawing" : ""}`} style={{ aspectRatio: `${photo.width} / ${photo.height}`, maxWidth: `${Math.min(740, 620 * photo.width / photo.height)}px` }} onPointerDown={beginDraw} onPointerMove={continueDraw} onPointerUp={finishDraw} onPointerCancel={() => { setDrawStart(undefined); setDrawEnd(undefined); }} onKeyDown={(event) => { if (event.key === "Escape" && drawing) { setDrawing(false); setDrawStart(undefined); setDrawEnd(undefined); } }}>
        <img src={photoAssetUrl(memory.knowledgeBaseId, memory.id, photo.id)} alt={photo.name} draggable={false} />
        {candidates.map((candidate, index) => <div ref={(node) => { faceTags.current[candidate.id] = node; }} key={candidate.id} className={`photo-face-tag ${candidate.name ? "named" : "unassigned"}${candidate.id === person?.id ? " selected" : ""}${candidate.box.x + candidate.box.width / 2 > .5 ? " popover-left" : ""}${candidate.box.y + candidate.box.height / 2 > .55 ? " popover-up" : ""}`} style={{ left: `${candidate.box.x * 100}%`, top: `${candidate.box.y * 100}%`, width: `${candidate.box.width * 100}%`, height: `${candidate.box.height * 100}%` }}>
          <button ref={(node) => { faceButtons.current[candidate.id] = node; }} type="button" className="photo-face-hit" aria-label={`${candidate.name || `人物 ${index + 1}，待认领`}的圈选范围；点击选中，拖动调整位置`} aria-pressed={candidate.id === person?.id} disabled={locked || detecting || drawing} onPointerDown={(event) => beginBoxGesture(event, candidate)} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setNamingId(""); onSelect(candidate.id); }} />
          <button ref={(node) => { faceLabels.current[candidate.id] = node; }} type="button" className="photo-face-label" aria-expanded={namingId === candidate.id} aria-controls={namingId === candidate.id ? panelId : undefined} disabled={locked || detecting || drawing} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openNaming(candidate); }}>{candidate.name || "填写人物"}</button>
          {candidate.id === person?.id && !drawing ? handles.map((handle) => <button key={handle} type="button" className={`photo-resize-handle ${handle}`} aria-label={`拖动${handleNames[handle]}调整人物框，方向键可微调`} disabled={locked || detecting} onPointerDown={(event) => beginBoxGesture(event, candidate, handle)} onKeyDown={(event) => resizeWithKeyboard(event, candidate, handle)} />) : null}
          {candidate.id === person?.id && namingId === candidate.id ? <fieldset ref={formRef} id={panelId} className="photo-name-panel photo-name-popover" disabled={locked || detecting} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeNaming(true); } }}>
            <legend className="sr-only">标注照片中的人物</legend>
            <div className="photo-name-panel-head"><b>这是谁？</b><button type="button" className="photo-text-action" aria-label="关闭人物标注" onClick={() => closeNaming(true)}><Icon name="close" size={14} /></button></div>
            <PhotoPersonPicker key={candidate.id} person={candidate} people={people} onChange={(patch) => onConfirm(photo.id, { ...candidate, ...patch })} />
            {group && group.members.length > 1 ? <div className="photo-group-hint"><p>另有 {group.members.length - 1} 张照片识别为同一人，选择名字后同步更新。</p><button type="button" className="photo-text-action" onClick={() => onDetach(candidate.id)}>认错了，这张单独标注</button></div> : null}
            <button type="button" className="photo-person-remove photo-text-action" onClick={() => onSkip(photo.id, candidate)}>不记录这个人</button>
          </fieldset> : null}
        </div>)}
        {draftBox ? <div className="photo-face-draft" aria-hidden="true" style={{ left: `${draftBox.x * 100}%`, top: `${draftBox.y * 100}%`, width: `${draftBox.width * 100}%`, height: `${draftBox.height * 100}%` }} /> : null}
      </div>
    </div>
    {detecting ? <p className="photo-feedback" role="status">{detectionLabel || "正在认人，相似的人脸会一起整理…"}</p> : !candidates.length ? <p className="photo-help">没有自动找到人脸？点击“圈选漏掉的人”，直接在照片上框出来。</p> : <p className="photo-help">实线是已标注人物，虚线是待认领人物。点框调整范围，点姓名标签填写人物。</p>}
    {groupingError ? <p className="photo-feedback" role="status">{groupingError}</p> : null}
    {detectionError ? <p className="photo-feedback" role="alert">{detectionError}<button type="button" disabled={locked} onClick={onRetry}>重试检测</button></p> : null}
  </section>;
}
