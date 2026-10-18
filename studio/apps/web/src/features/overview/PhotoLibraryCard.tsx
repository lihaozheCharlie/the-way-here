import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryPhoto, PhotoLibraryFilters, PhotoLibraryAuthorization, PhotoLibraryImage, PhotoLibrarySearchInput, PhotoLibrarySearchResult } from "@the-way-here/shared";
import type { DesktopBridge } from "../desktop/bridge";
import { Icon } from "../../shared/ui";
import { photoImageQueue } from "./photo-library-images";
import "./photo-library.css";

type PhotosBridge = Required<Pick<DesktopBridge, "photoLibraryFilters" | "photoLibraryStatus" | "authorizePhotoLibrary" | "searchPhotoLibrary" | "photoLibraryImage" | "closePhotoLibrary" | "openPhotoLibrarySettings">>;
const message = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "照片读取失败，请重试";
function photoDate(photo: LibraryPhoto) {
  return photo.createdAt ? new Date(photo.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "日期未知";
}

export function PhotoLibraryCard() {
  const [open, setOpen] = useState(false);
  const desktop = typeof window === "undefined" ? undefined : window.desktop;
  const available = desktop?.platform === "darwin" && desktop.photoLibraryFilters && desktop.searchPhotoLibrary && desktop.photoLibraryStatus && desktop.authorizePhotoLibrary && desktop.photoLibraryImage && desktop.closePhotoLibrary && desktop.openPhotoLibrarySettings;
  return <section className="photo-library-card" aria-labelledby="photo-library-title">
    <div className="photo-library-intro">
      <Icon name="image" size={22} />
      <div><h2 id="photo-library-title">从一张照片想起</h2><p>按时间、地点、相册或收藏，找找最近或以前的照片。</p></div>
      {available && <button type="button" className="desktop-secondary" aria-expanded={open} aria-controls="photo-library-search" onClick={() => setOpen(value => !value)}>{open ? "收起" : "找照片"}<Icon name={open ? "up" : "search"} size={15} /></button>}
    </div>
    {!available && <p className="photo-library-note">请在 macOS 桌面应用中连接系统照片库。其他照片仍可从“生活记录”导入。</p>}
    {open && available && <PhotoLibrarySearch bridge={desktop as PhotosBridge} />}
  </section>;
}

function PhotoLibrarySearch({ bridge }: { bridge: PhotosBridge }) {
  const [authorization, setAuthorization] = useState<PhotoLibraryAuthorization>();
  const [query, setQuery] = useState("");
  const [dateBasis, setDateBasis] = useState<NonNullable<PhotoLibrarySearchInput["dateBasis"]>>("taken");
  const [place, setPlace] = useState("");
  const [radiusKm, setRadiusKm] = useState(30);
  const [albumId, setAlbumId] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [photoType, setPhotoType] = useState<NonNullable<PhotoLibrarySearchInput["photoType"]>>("all");
  const [filters, setFilters] = useState<PhotoLibraryFilters>();
  const [filtersError, setFiltersError] = useState("");
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersRevision, setFiltersRevision] = useState(0);
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
  useEffect(() => {
    if (authorization !== "authorized") { setFilters(undefined); setAlbumId(""); setDateBasis("taken"); return; }
    let active = true;
    setFiltersLoading(true); setFiltersError("");
    void bridge.photoLibraryFilters().then(value => {
      if (!active) return;
      setFilters(value);
      setAlbumId(previous => value.albums.some(album => album.id === previous) ? previous : "");
      if (!value.supportsAddedDate) setDateBasis("taken");
    }, error => { if (active) setFiltersError(message(error)); })
      .finally(() => { if (active) setFiltersLoading(false); });
    return () => { active = false; };
  }, [authorization, bridge, filtersRevision]);
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
    const input: PhotoLibrarySearchInput = more && lastInput.current ? { ...lastInput.current, cursor: result?.nextCursor } : { query, dateBasis, place, radiusKm, albumId, favoritesOnly, photoType, from, through };
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
          <label className="photo-library-kind"><span>时间依据</span><select value={dateBasis} disabled={busy} onChange={event => setDateBasis(event.target.value as typeof dateBasis)}><option value="taken">拍摄时间</option>{filters?.supportsAddedDate && <option value="added">加入图库时间</option>}</select></label>
          <label className="photo-library-keyword"><span>时间（可选）</span><input type="search" value={query} disabled={busy} maxLength={120} placeholder="例如：最近30天、去年、2024年5月" aria-describedby="photo-library-time-help" onChange={event => setQuery(event.target.value)} /></label>
        </div>
        <div className="photo-library-dates"><label><span>开始日期（可选）</span><input type="date" min="1900-01-01" max="2200-12-31" value={from} disabled={busy} onChange={event => setFrom(event.target.value)} /></label><span aria-hidden="true">至</span><label><span>结束日期（可选）</span><input type="date" min="1900-01-01" max="2200-12-31" value={through} disabled={busy} onChange={event => setThrough(event.target.value)} /></label></div>
        <p id="photo-library-time-help" className="photo-library-note">时间留空查看全部日期；也可用起止日期，和上方时间任选一种。</p>
        <div className="photo-library-filter-row">
          <label className="photo-library-album"><span>相册</span><select value={albumId} disabled={busy || filtersLoading || !filters} onChange={event => setAlbumId(event.target.value)}><option value="">{filtersLoading ? "正在读取相册…" : "全部相册"}</option>{filters?.albums.map(album => <option key={album.id} value={album.id}>{album.title}</option>)}</select></label>
          <button type="button" className="desktop-secondary" disabled={busy || filtersLoading} onClick={() => setFiltersRevision(value => value + 1)}>刷新相册</button>
          <label><span>照片类型</span><select value={photoType} disabled={busy} onChange={event => setPhotoType(event.target.value as typeof photoType)}><option value="all">全部照片</option><option value="live">实况照片</option><option value="screenshot">截屏</option><option value="panorama">全景</option><option value="portrait">人像模式</option><option value="raw">RAW</option><option value="burst">连拍</option></select></label>
          <label className="photo-library-favorite"><input type="checkbox" checked={favoritesOnly} disabled={busy} onChange={event => setFavoritesOnly(event.target.checked)} /><span>仅看收藏</span></label>
        </div>
        {filtersError && <div className="photo-library-error" role="alert">相册读取失败：{filtersError}。可以刷新相册后重试。</div>}
        <div className="photo-library-filter-row">
          <label className="photo-library-keyword"><span>拍摄地点（可选）</span><input type="search" value={place} disabled={busy} maxLength={120} placeholder="例如：浙江杭州富阳" aria-describedby="photo-library-place-help" onChange={event => setPlace(event.target.value)} /></label>
          <label><span>地点附近范围</span><select value={radiusKm} disabled={busy || !place.trim()} onChange={event => setRadiusKm(Number(event.target.value))}>{[1, 5, 10, 30, 100].map(radius => <option key={radius} value={radius}>{radius} 公里</option>)}</select></label>
        </div>
        <p id="photo-library-place-help" className="photo-library-note">地点由 Apple 联网定位，只匹配有位置记录的照片；附近范围不代表行政区边界。</p>
        <div className="photo-library-submit"><button type="submit" className="desktop-primary" disabled={busy}><Icon name="search" size={16} />{busy ? "查找中…" : "搜索照片"}</button><button type="button" className="desktop-secondary" disabled={busy} onClick={() => { setQuery(""); setFrom(""); setThrough(""); setDateBasis("taken"); setPlace(""); setRadiusKm(30); setAlbumId(""); setFavoritesOnly(false); setPhotoType("all"); }}>清除筛选</button></div>
      </form>
      {busy && <div className="photo-library-progress" role="status"><span>正在读取照片信息，大图库或地点查询可能需要一些时间。</span><button type="button" className="desktop-secondary" onClick={() => void cancel()}>取消查找</button></div>}
      {result && <>
        <div className="photo-library-result-head"><p>{result.summary}</p><span>已显示 {result.photos.length} 张{result.nextCursor ? " · 还有更多" : ""}</span></div>
        {result.place && <p className="photo-library-note">匹配地点：{result.place.name}（{result.place.latitude.toFixed(3)}, {result.place.longitude.toFixed(3)}），附近 {result.place.radiusKm} 公里。</p>}
        {result.photos.length ? <PhotoResults key={searchId} photos={result.photos} bridge={bridge} /> : <p className="photo-library-empty">没有找到符合条件的照片。试试放宽时间、地点范围，或清除部分筛选条件。</p>}
        {result.nextCursor && <button type="button" className="desktop-secondary photo-library-more" disabled={busy} onClick={() => void search(true)}>显示更多照片</button>}
      </>}
      <p className="photo-library-note photo-library-privacy">仅浏览系统照片库，不改动照片，不发送给 AI。人物姓名和画面内容暂不参与搜索；iCloud 照片需点击下载预览。</p>
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
    <div className="photo-library-grid">{photos.map(photo => <figure key={photo.id}><PhotoImage photo={photo} queue={queue} size="thumbnail" onOpen={() => setSelected(photo)} /><figcaption><time dateTime={photo.createdAt} title="拍摄时间">{photoDate(photo)}</time>{photo.hasLocation && <Icon name="pin" size={12} />}<span title={photo.name}>{photo.name}</span></figcaption></figure>)}</div>
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
