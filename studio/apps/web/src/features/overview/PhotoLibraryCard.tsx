import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryPhoto, PhotoLibraryAuthorization, PhotoLibraryImage, PhotoLibrarySearchInput, PhotoLibrarySearchResult } from "@the-way-here/shared";
import type { DesktopBridge } from "../desktop/bridge";
import { Icon } from "../../shared/ui";
import { photoImageQueue } from "./photo-library-images";
import "./photo-library.css";

type PhotosBridge = Required<Pick<DesktopBridge, "photoLibraryStatus" | "authorizePhotoLibrary" | "searchPhotoLibrary" | "photoLibraryImage" | "closePhotoLibrary" | "openPhotoLibrarySettings">>;
const message = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "照片读取失败，请重试";
function photoDate(photo: LibraryPhoto) {
  return photo.createdAt ? new Date(photo.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "日期未知";
}

export function PhotoLibraryCard() {
  const [open, setOpen] = useState(false);
  const desktop = typeof window === "undefined" ? undefined : window.desktop;
  const available = desktop?.platform === "darwin" && desktop.searchPhotoLibrary && desktop.photoLibraryStatus && desktop.authorizePhotoLibrary && desktop.photoLibraryImage && desktop.closePhotoLibrary && desktop.openPhotoLibrarySettings;
  return <section className="photo-library-card" aria-labelledby="photo-library-title">
    <div className="photo-library-intro">
      <Icon name="image" size={22} />
      <div><h2 id="photo-library-title">从一张照片想起</h2><p>输入日期、相册名或拍摄地点，找找最近或以前的照片。</p></div>
      {available && <button type="button" className="desktop-secondary" aria-expanded={open} aria-controls="photo-library-search" onClick={() => setOpen(value => !value)}>{open ? "收起" : "找照片"}<Icon name={open ? "up" : "search"} size={15} /></button>}
    </div>
    {!available && <p className="photo-library-note">请在 macOS 桌面应用中连接系统照片库。其他照片仍可从“生活记录”导入。</p>}
    {open && available && <PhotoLibrarySearch bridge={desktop as PhotosBridge} />}
  </section>;
}

function PhotoLibrarySearch({ bridge }: { bridge: PhotosBridge }) {
  const [authorization, setAuthorization] = useState<PhotoLibraryAuthorization>();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PhotoLibrarySearchInput["kind"]>("text");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PhotoLibrarySearchResult>();
  const [searchId, setSearchId] = useState(0);
  const lastInput = useRef<PhotoLibrarySearchInput | undefined>(undefined);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    void bridge.photoLibraryStatus().then(value => { if (current === generation.current) setAuthorization(value); }, error => { if (current === generation.current) setError(message(error)); });
    return () => { generation.current += 1; void bridge.closePhotoLibrary().catch(() => {}); };
  }, [bridge]);
  useEffect(() => {
    let active = true;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      void bridge.photoLibraryStatus().then(status => {
        if (!active) return;
        setAuthorization(status);
        if (status !== "authorized") setResult(undefined);
      }, () => {});
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 15_000);
    return () => { active = false; window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); window.clearInterval(timer); };
  }, [bridge]);
  async function access() {
    const current = ++generation.current;
    setBusy(true); setError("");
    try {
      const status = authorization === "notDetermined" ? await bridge.authorizePhotoLibrary() : await bridge.photoLibraryStatus();
      if (current === generation.current) setAuthorization(status);
    } catch (error) { if (current === generation.current) setError(message(error)); }
    finally { if (current === generation.current) setBusy(false); }
  }
  async function search(more = false) {
    if (busy) return;
    const input: PhotoLibrarySearchInput = more && lastInput.current ? { ...lastInput.current, cursor: result?.nextCursor } : { query, kind, from, through };
    const current = ++generation.current;
    setBusy(true); setError("");
    if (!more) { setResult(undefined); setSearchId(value => value + 1); }
    try {
      const found = await bridge.searchPhotoLibrary(input);
      if (current !== generation.current) return;
      lastInput.current = input;
      setResult(previous => ({ ...found, photos: more ? [...(previous?.photos ?? []), ...found.photos].filter((photo, index, all) => all.findIndex(item => item.id === photo.id) === index) : found.photos }));
    } catch (error) {
      if (current === generation.current) {
        setError(message(error));
        const status = await bridge.photoLibraryStatus().catch(() => undefined);
        if (current === generation.current && status) {
          setAuthorization(status);
          if (status !== "authorized") setResult(undefined);
        }
      }
    } finally { if (current === generation.current) setBusy(false); }
  }
  async function cancel() {
    generation.current += 1; setBusy(false); setResult(undefined); setError("");
    await bridge.closePhotoLibrary().catch(() => {});
  }
  return <div id="photo-library-search" className="photo-library-search">
    {!authorization && !error && <p role="status">正在检查照片库访问权限…</p>}
    {authorization === "notDetermined" && <div className="photo-library-access"><p>允许后可以搜索这台 Mac 的系统照片库。只读取和展示，不自动导入，也不发送给 AI。未同步到这台 Mac 的手机照片无法查找。</p><button type="button" className="desktop-primary" disabled={busy} onClick={() => void access()}>{busy ? "等待系统授权…" : "允许访问照片库"}</button></div>}
    {(authorization === "denied" || authorization === "restricted") && <div className="photo-library-access"><p>{authorization === "restricted" ? "系统限制了照片库访问，请检查设备的隐私限制。" : "尚未允许访问照片库。你可以在系统设置的“隐私与安全性 → 照片”中开启。"}</p><div className="photo-library-actions"><button type="button" className="desktop-secondary" onClick={() => void bridge.openPhotoLibrarySettings().catch(error => setError(message(error)))}>打开系统设置</button><button type="button" className="desktop-secondary" disabled={busy} onClick={() => void access()}>已设置，重新检查</button></div></div>}
    {authorization === "authorized" && <>
      <form onSubmit={event => { event.preventDefault(); void search(); }}>
        <div className="photo-library-query-row">
          <label className="photo-library-kind"><span>查找方式</span><select value={kind} disabled={busy} onChange={event => setKind(event.target.value as PhotoLibrarySearchInput["kind"])}><option value="text">相册 / 文件名</option><option value="place">拍摄地点</option></select></label>
          <label className="photo-library-keyword"><span>{kind === "place" ? "地点或日期 + 地点" : "关键词或日期"}</span><input type="search" value={query} disabled={busy} maxLength={120} placeholder={kind === "place" ? "例如：去年 杭州富阳" : "例如：最近30天、2024年5月、旅行"} aria-describedby="photo-library-capabilities" onChange={event => setQuery(event.target.value)} /></label>
          <button type="submit" className="desktop-primary" disabled={busy}><Icon name="search" size={16} />{busy ? "查找中…" : "搜索照片"}</button>
        </div>
        <div className="photo-library-dates"><label><span>开始日期（可选）</span><input type="date" min="1900-01-01" max="2200-12-31" value={from} disabled={busy} onChange={event => setFrom(event.target.value)} /></label><span aria-hidden="true">至</span><label><span>结束日期（可选）</span><input type="date" min="1900-01-01" max="2200-12-31" value={through} disabled={busy} onChange={event => setThrough(event.target.value)} /></label></div>
        <p id="photo-library-capabilities" className="photo-library-note">{kind === "place" ? "地点关键词交给 Apple 联网查询；按地点中心附近 30 公里筛选，仅匹配带定位的照片，不代表行政区边界。" : "日期可输入今天、昨天、去年、最近30天或年月日。关键词匹配相册名和原文件名；暂不识别画面天气或人物姓名。"}</p>
      </form>
      {busy && <div className="photo-library-progress" role="status"><span>正在读取照片信息，大图库或地点查询可能需要一些时间。</span><button type="button" className="desktop-secondary" onClick={() => void cancel()}>取消查找</button></div>}
      {result && <>
        <div className="photo-library-result-head"><p>{result.summary}</p><span>已显示 {result.photos.length} 张{result.nextCursor ? " · 还有更多" : ""}</span></div>
        {result.place && <p className="photo-library-note">匹配地点：{result.place.name}（{result.place.latitude.toFixed(3)}, {result.place.longitude.toFixed(3)}），附近 {result.place.radiusKm} 公里。</p>}
        {result.photos.length ? <PhotoResults key={searchId} photos={result.photos} bridge={bridge} /> : <p className="photo-library-empty">没有找到符合条件的照片。试试放宽日期、换个相册名；地点搜索只包含有定位的照片。</p>}
        {result.nextCursor && <button type="button" className="desktop-secondary photo-library-more" disabled={busy} onClick={() => void search(true)}>显示更多照片</button>}
      </>}
      <p className="photo-library-note photo-library-privacy">仅浏览当前系统照片库，不改动原照片、不保存搜索结果。云端照片需点击后下载预览。</p>
    </>}
    {error && <div role="alert" className="photo-library-error"><p>{error}</p>{!authorization && <button type="button" className="desktop-secondary" disabled={busy} onClick={() => void access()}>重新检查</button>}</div>}
  </div>;
}

type ImageQueue = ReturnType<typeof photoImageQueue>;
function PhotoResults({ photos, bridge }: { photos: LibraryPhoto[]; bridge: PhotosBridge }) {
  const [selected, setSelected] = useState<LibraryPhoto>();
  const queue = useMemo(() => photoImageQueue((assetId, size, network) => bridge.photoLibraryImage({ assetId, size, network })), [bridge]);
  const lifecycle = useRef(0);
  useEffect(() => {
    const current = ++lifecycle.current;
    // StrictMode immediately replays setup after cleanup; dispose only on a
    // real unmount so the replay cannot inherit a permanently closed queue.
    return () => { queueMicrotask(() => { if (lifecycle.current === current) queue.close(); }); };
  }, [queue]);
  return <div className="photo-library-results">
    {selected && <figure className="photo-library-preview"><div className="photo-library-preview-head"><figcaption>{photoDate(selected)} · {selected.name}</figcaption><button type="button" className="desktop-secondary" onClick={() => setSelected(undefined)} aria-label="关闭大图"><Icon name="close" size={16} /></button></div><PhotoImage key={selected.id} photo={selected} queue={queue} size="preview" /></figure>}
    <div className="photo-library-grid">{photos.map(photo => <figure key={photo.id}><PhotoImage photo={photo} queue={queue} size="thumbnail" onOpen={() => setSelected(photo)} /><figcaption><time dateTime={photo.createdAt}>{photoDate(photo)}</time>{photo.hasLocation && <Icon name="pin" size={12} />}<span title={photo.name}>{photo.name}</span></figcaption></figure>)}</div>
  </div>;
}
function PhotoImage({ photo, queue, size, onOpen }: { photo: LibraryPhoto; queue: ImageQueue; size: "thumbnail" | "preview"; onOpen?: () => void }) {
  const [image, setImage] = useState<PhotoLibraryImage>();
  const [error, setError] = useState("");
  const [network, setNetwork] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setImage(undefined); setError("");
    void queue.image(photo.id, size, network).then(value => { if (active) setImage(value); }, error => { if (active) setError(message(error)); });
    return () => { active = false; };
  }, [photo.id, queue, size, network, attempt]);
  if (image?.dataUrl) return onOpen ? <button type="button" className="photo-library-thumbnail" onClick={onOpen} aria-label={`放大照片：${photo.name}，${photoDate(photo)}`}><img src={image.dataUrl} alt={photo.name} /></button> : <img className="photo-library-full-image" src={image.dataUrl} alt={photo.name} />;
  return <div className={`photo-library-placeholder photo-library-placeholder--${size}`}>
    <Icon name="image" size={24} />
    {image?.cloudOnly ? <><span>照片在 iCloud</span><button type="button" className="desktop-secondary" onClick={() => setNetwork(true)}>下载预览</button></> : error ? <><span>{error}</span><button type="button" className="desktop-secondary" onClick={() => setAttempt(value => value + 1)}>重试</button></> : <span role="status">{network ? "正在下载预览…" : "正在加载…"}</span>}
  </div>;
}
