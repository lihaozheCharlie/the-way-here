import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryPhoto, PhotoLibraryImage } from "@the-way-here/shared";
import { Icon } from "../../shared/ui";
import { CaptureDialog } from "./CaptureDialogs";
import { photoImageQueue } from "./photo-library-images";
import type { PhotosBridge } from "./PhotoLibraryCard";
const photoDate = (p: LibraryPhoto) => p.createdAt ? new Date(p.createdAt).toLocaleDateString("zh-CN") : "日期未知";
type Queue = ReturnType<typeof photoImageQueue>;
export function PhotoResults({ photos, bridge, selected, toggle, capped, onThumbnail }: { onThumbnail?: (id: string, url: string) => void; photos: LibraryPhoto[]; bridge: PhotosBridge; selected: Map<string, LibraryPhoto>; toggle: (p: LibraryPhoto) => void; capped: boolean }) {
  const [preview, setPreview] = useState<LibraryPhoto>();
  const [ready, setReady] = useState<Set<string>>(new Set());
  const queue = useMemo(() => photoImageQueue((assetId, size, network) => bridge.photoLibraryImage({ assetId, size, network })), [bridge]);
  const lifecycle = useRef(0);
  useEffect(() => { const current = ++lifecycle.current; return () => { queueMicrotask(() => { if (lifecycle.current === current) queue.close(); }); }; }, [queue]);
  return <div className="photo-library-results"><p className="photo-library-note">点选照片即可选中，最多 50 张 · 放大查看请点右下角</p><div className="photo-library-result-scroll"><div className="photo-library-grid">{photos.map(photo => <figure key={photo.id} className={`photo-library-tile${selected.has(photo.id) ? " is-selected" : ""}${capped && !selected.has(photo.id) ? " is-capped" : ""}`}>
    <PhotoImage photo={photo} queue={queue} size="thumbnail" checked={selected.has(photo.id)} blocked={capped && !selected.has(photo.id)} onOpen={() => toggle(photo)} onReady={url => { setReady(previous => previous.has(photo.id) ? previous : new Set([...previous, photo.id])); onThumbnail?.(photo.id, url); }} />
    {ready.has(photo.id) && <button type="button" className="photo-library-zoom" onClick={() => setPreview(photo)} aria-label={`放大照片：${photo.name}`}><Icon name="search" size={16} /></button>}<figcaption><time dateTime={photo.createdAt}>{photoDate(photo)}</time>{photo.hasLocation && <Icon name="pin" size={12} />}</figcaption></figure>)}</div></div>
    {preview && <CaptureDialog title={photoDate(preview)} className="photo-library-preview-dialog" close={() => setPreview(undefined)}><div className="photo-preview-body"><p>{preview.name}{preview.hasLocation ? " · 有位置信息" : ""}</p><PhotoImage key={preview.id} photo={preview} queue={queue} size="preview" /></div><footer><button type="button" className="desktop-secondary" onClick={() => setPreview(undefined)}>关闭</button><button type="button" className="desktop-primary" disabled={!selected.has(preview.id) && capped} onClick={() => toggle(preview)}>{selected.has(preview.id) ? "取消选择" : capped ? "已达 50 张上限" : "选择这张"}</button></footer></CaptureDialog>}
  </div>;
}
function PhotoImage({ photo, queue, size, onOpen, checked, blocked, onReady }: { photo: LibraryPhoto; queue: Queue; size: "thumbnail" | "preview"; onOpen?: () => void; checked?: boolean; blocked?: boolean; onReady?: (url: string) => void }) {
  const [image, setImage] = useState<PhotoLibraryImage>(), [error, setError] = useState("");
  const [network, setNetwork] = useState(false), [attempt, setAttempt] = useState(0);
  const callback = useRef(onReady); callback.current = onReady;
  useEffect(() => { let active = true; setImage(undefined); setError(""); void queue.image(photo.id, size, network).then(value => { if (active) { setImage(value); if (value.dataUrl) callback.current?.(value.dataUrl); } }, reason => { if (active) setError(reason instanceof Error ? reason.message : "照片读取失败，请重试"); }); return () => { active = false; }; }, [photo.id, queue, size, network, attempt]);
  if (image?.dataUrl) return onOpen ? <button type="button" className="photo-library-thumbnail" role="checkbox" aria-checked={checked} aria-disabled={blocked} onClick={onOpen} aria-label={`选择照片：${photo.name}，${photoDate(photo)}`}><img src={image.dataUrl} alt="" /><span className="photo-tile-check"><Icon name="check" size={14} /></span></button> : <img className="photo-library-full-image" src={image.dataUrl} alt={photo.name} />;
  return <div className={`photo-library-placeholder photo-library-placeholder--${size}`}><Icon name="image" size={24} />{image?.cloudOnly ? <><span>照片在 iCloud</span><button type="button" className="desktop-secondary" onClick={() => setNetwork(true)}>下载预览</button></> : error ? <><span>{error}</span><button type="button" className="desktop-secondary" onClick={() => setAttempt(value => value + 1)}>重试</button></> : <span role="status">{network ? "正在下载预览…" : "正在加载…"}</span>}</div>;
}
