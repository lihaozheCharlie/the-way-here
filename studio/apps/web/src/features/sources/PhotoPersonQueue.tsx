import { useEffect, useRef } from "react";
import type { PhotoMemory, PhotoPerson } from "@the-way-here/shared";
import { photoAssetUrl } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { PhotoPersonPicker, type PhotoPersonOption } from "./PhotoPersonPicker";
import { clampPhotoBox } from "./photo-model";
import { groupedPhotoQueue, type FaceGroups } from "./photo-face-groups";

export function PhotoCrop({ src, person, alt, width, height }: { src: string; person: PhotoPerson; alt: string; width: number; height: number }) {
  const box = person.box;
  return <svg className="photo-crop" viewBox={`${box.x * width} ${box.y * height} ${box.width * width} ${box.height * height}`} preserveAspectRatio="xMidYMid slice" role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={!alt}><image href={src} width={width} height={height} /></svg>;
}

export function PhotoPersonQueue({ memory, drafts, groups, onDetach, groupingError, selectedId, people, locked, onSelect, onChange, onConfirm, onSkip, onContinue, detecting, detectionLabel, detectionError, onRetry }: {
  groups: FaceGroups; onDetach: (id: string) => void; groupingError?: string;
  memory: PhotoMemory; drafts: Record<string, PhotoPerson[]>; selectedId: string;
  people: PhotoPersonOption[]; locked: boolean;
  onSelect: (id: string) => void; onChange: (photoId: string, personId: string, patch: Partial<PhotoPerson>) => void;
  onConfirm: (photoId: string, person: PhotoPerson) => void; onSkip: (photoId: string, person: PhotoPerson) => void;
  onContinue: () => void; detecting: boolean; detectionLabel?: string; detectionError?: string; onRetry: () => void;
}) {
  const queue = groupedPhotoQueue(memory, drafts, groups);
  const selected = queue.find((entry) => entry.members.some((member) => member.person.id === selectedId)) || queue.find((entry) => !entry.confirmed) || queue[0];
  const preview = selected?.members.find((entry) => entry.person.id === selectedId) ?? selected;
  const current = selected && preview ? { ...selected, ...preview, confirmed: selected.confirmed, members: selected.members } : undefined;
  const formRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => { formRef.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus({ preventScroll: true }); }, [selected?.person.id]);
  const index = current ? queue.indexOf(selected!) : 0;
  const remaining = queue.filter((entry) => !entry.confirmed).length;
  const source = (photoId: string) => photoAssetUrl(memory.knowledgeBaseId, memory.id, photoId);
  return <section className="photo-identify">
    <header className="photo-stage-heading"><h3>照片里的人，逐组来认</h3><p>核对头像并确认人物，也可以先讲故事，稍后再认。</p></header>
    <div className={`photo-identify-layout${queue.length ? "" : " is-empty"}`}>
      <nav className="photo-queue-rail" aria-label="人物队列">{queue.map((entry, i) => <button type="button" key={entry.person.id} disabled={locked} aria-pressed={entry === selected} aria-label={`第 ${i + 1} 位，${entry.person.name || "待命名"}，${entry.confirmed ? "已确认" : "待确认"}${entry.members.length > 1 ? `，${entry.members.length} 张照片` : ""}`} onClick={() => onSelect(entry.person.id)}><PhotoCrop src={source(entry.photo.id)} person={entry.person} width={entry.photo.width} height={entry.photo.height} alt="" />{entry.members.length > 1 ? <span className="photo-group-count">{entry.members.length}</span> : null}<span className={entry.confirmed ? "photo-queue-dot done" : "photo-queue-dot"}>{entry.confirmed ? <Icon name="check" size={10} /> : null}</span></button>)}</nav>
      <div className="photo-queue-main">
        <div className="photo-queue-heading"><span>{current ? `第 ${index + 1} 组 / 共 ${queue.length} 组 · ${remaining ? `${remaining} 组待确认` : "已全部确认"}` : detecting ? detectionLabel || "正在准备识别人脸…" : detectionError ? "人脸识别未完成" : "没有待确认的人物"}</span></div>
        {current && current.members.length > 1 ? <section className="photo-face-group" aria-label="疑似同一人的照片">
          <header><b>疑似同一人 · {current.members.length} 张照片</b><p>确认后关联到同一个人物，分错的头像可以移出。</p></header>
          <div className="photo-face-group-members">{current.members.map((entry) => <div key={entry.person.id}>
            <button type="button" disabled={locked} aria-pressed={entry.person.id === current.person.id} aria-label={`查看第 ${entry.photoIndex + 1} 张照片中的头像`} onClick={() => onSelect(entry.person.id)}><PhotoCrop src={source(entry.photo.id)} person={entry.person} width={entry.photo.width} height={entry.photo.height} alt="" /><span>第 {entry.photoIndex + 1} 张</span></button>
            <button type="button" className="photo-text-action" disabled={locked} aria-label={`将第 ${entry.photoIndex + 1} 张头像移出这组`} onClick={() => onDetach(entry.person.id)}>移出这组</button>
          </div>)}</div>
        </section> : null}
        {current ? <div className="photo-identity-card" key={current.person.id}>
          <div><PhotoCrop src={source(current.photo.id)} person={current.person} width={current.photo.width} height={current.photo.height} alt={current.person.name || "待确认的人脸裁剪"} />
            <details className="photo-original"><summary>来自第 {current.photoIndex + 1} 张照片 · 查看完整照片</summary><img src={source(current.photo.id)} alt={current.photo.name} /><a href={photoAssetUrl(memory.knowledgeBaseId, memory.id, current.photo.id, "original")} download={current.photo.name}>保存原图</a></details>
            <details className="photo-crop-settings"><summary>微调裁剪框</summary>{(["x", "y", "width", "height"] as const).map((axis, i) => <label className="photo-crop-control" key={axis}>{["左右位置", "上下位置", "宽度", "高度"][i]}<input disabled={locked} type="range" min={axis === "x" || axis === "y" ? 0 : 0.02} max={1} step={0.01} value={current.person.box[axis]} onChange={(event) => onChange(current.photo.id, current.person.id, { box: clampPhotoBox({ ...current.person.box, [axis]: Number(event.target.value) }) })} /></label>)}</details>
          </div>
          <fieldset ref={formRef} className="photo-identity-form" disabled={locked}><legend>这是谁</legend><PhotoPersonPicker person={current.person} people={people} compact onChange={(patch) => onChange(current.photo.id, current.person.id, patch)} /><p className="photo-help">确认后使用裁剪图作为头像。</p><div className="photo-stage-actions"><button type="button" className="primary-action" disabled={!current.person.name.trim() || current.confirmed} onClick={() => onConfirm(current.photo.id, current.person)}>{current.confirmed ? "已确认" : current.members.length > 1 ? `确认这 ${current.members.length} 张是同一人` : current.person.name.trim() ? current.person.pageId ? "确认关联人物" : "确认新称呼" : "确认人物"}</button><button type="button" className="secondary-action" onClick={() => onSkip(current.photo.id, current.person)}>{current.members.length > 1 ? "不记录这组" : "不记录这个人"}</button></div></fieldset>
        </div> : <div className="photo-no-faces"><div className="photo-overview-strip">{memory.photos.map((photo) => <a href={photoAssetUrl(memory.knowledgeBaseId, memory.id, photo.id, "original")} download={photo.name} key={photo.id} title={`保存原图：${photo.name}`}><img src={source(photo.id)} alt={photo.name} /></a>)}</div></div>}
        {current ? <div className="photo-queue-nav"><button className="photo-text-action" type="button" disabled={locked || index === 0} onClick={() => onSelect(queue[index - 1]!.person.id)}>上一组</button><button className="photo-text-action" type="button" disabled={locked || index === queue.length - 1} onClick={() => onSelect(queue[index + 1]!.person.id)}>下一组</button></div> : null}
        {current && detecting ? <p className="photo-feedback" role="status">{detectionLabel}</p> : null}
        {groupingError ? <p className="photo-feedback" role="status">{groupingError}</p> : null}
        {detectionError ? <p className="photo-feedback" role="alert">{detectionError}<button type="button" disabled={locked} onClick={onRetry}>重试检测</button></p> : null}
        <footer className="photo-stage-footer"><button type="button" className="primary-action" disabled={locked} onClick={onContinue}>下一步：讲故事<Icon name="arrow" size={14} /></button></footer>
      </div>
    </div>
  </section>;
}
