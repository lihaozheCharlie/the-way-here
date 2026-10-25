import { useEffect, useRef, useState } from "react";
import type { LibraryPhoto, PhotoLibraryFilters, PhotoLibraryAuthorization, PhotoLibrarySearchInput, PhotoLibrarySearchResult } from "@the-way-here/shared";
import type { DesktopBridge } from "../desktop/bridge";
import { Icon } from "../../shared/ui";
import { PhotoResults } from "./PhotoLibraryResults";
import { ImportMaterialsModal } from "../sources/ImportMaterialsModal";
import { PhotoCaptureDialog } from "./PhotoCaptureDialog";
import { PHOTO_LIMIT } from "../sources/photo-model";
import { api } from "../../api";
import { NavLink } from "react-router-dom";
import { pageHref } from "../../shared/routing";
import type { SourceImportBatch } from "@the-way-here/shared";
import "./photo-library.css";
import { useI18n } from "../../shared/i18n";

export type PhotosBridge = Required<Pick<DesktopBridge, "photoLibraryFilters" | "photoLibraryStatus" | "authorizePhotoLibrary" | "searchPhotoLibrary" | "photoLibraryImage" | "closePhotoLibrary" | "openPhotoLibrarySettings">>;
const message = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "照片读取失败，请重试";
const photoTypes = [["all","全部照片"],["live","实况照片"],["screenshot","截屏"],["panorama","全景"],["portrait","人像模式"],["raw","RAW"],["burst","连拍"]] as const;

export function photoLibraryBridge(): PhotosBridge | undefined {
  const d = typeof window === "undefined" ? undefined : window.desktop;
  return d?.platform === "darwin" && d.photoLibraryFilters && d.searchPhotoLibrary && d.photoLibraryStatus && d.authorizePhotoLibrary && d.photoLibraryImage && d.closePhotoLibrary && d.openPhotoLibrarySettings ? d as PhotosBridge : undefined;
}
export function PhotoLibrarySearch({ bridge, knowledgeBaseId, onSelectionCount, onStatus, destination = "照片记忆", onDestination, active = true }: { bridge: PhotosBridge; knowledgeBaseId: string; onSelectionCount?: (count: number) => void; onStatus?: (status: string) => void; destination?: string; onDestination?: (folder: string) => void; active?: boolean }) {
  const { t, locale } = useI18n();
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<Map<string, LibraryPhoto>>(new Map());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [limit, setLimit] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>();
  const [batch, setBatch] = useState<SourceImportBatch>();
  const [photoHistory, setPhotoHistory] = useState<SourceImportBatch[]>([]);
  const importedSelections = useRef(new Map<string, string[]>());
  const [completed, setCompleted] = useState<{ title: string; pageId?: string }>();
  const [preparing, setPreparing] = useState("");
  useEffect(() => {
    const finish = (event: Event) => {
      const detail = (event as CustomEvent<{ knowledgeBaseId: string; importId: string; title: string; pageId?: string }>).detail;
      if (detail.knowledgeBaseId !== knowledgeBaseId) return;
      setCompleted({ title: detail.title, pageId: detail.pageId });
      const imported = new Set(importedSelections.current.get(detail.importId) || []);
      setSelected(previous => new Map([...previous].filter(([id]) => !imported.has(id))));
      importedSelections.current.delete(detail.importId); setLimit(false); refreshHistory();
    };
    window.addEventListener("photo-memory-completed", finish);
    return () => window.removeEventListener("photo-memory-completed", finish);
  }, [knowledgeBaseId]);
  function refreshHistory() {
    void api<SourceImportBatch[]>(`/api/photo-memories?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`).then(items => setPhotoHistory(items.filter(item => item.channel === "photos")), () => {});
  }
  useEffect(refreshHistory, [knowledgeBaseId, active]);
  useEffect(() => { onSelectionCount?.(selected.size); }, [selected.size, onSelectionCount]);
  function toggle(photo: LibraryPhoto) {
    if (preparing) return;
    setSelected(previous => {
      const next = new Map(previous);
      if (next.has(photo.id)) next.delete(photo.id);
      else if (next.size >= PHOTO_LIMIT) { setLimit(true); return previous; }
      else next.set(photo.id, photo);
      return next;
    });
  }
  async function prepareImport() {
    if (!selected.size || preparing) return;
    setError("");
    try {
      if (!window.desktop?.exportPhotoLibrary) throw new Error(t("请更新桌面应用后重试，当前版本不支持导出系统照片。"));
      const files: File[] = [];
      for (const [i, photo] of [...selected.values()].entries()) {
        setPreparing(t("正在本地准备第 ${index} / ${total} 张照片…", { index: i + 1, total: selected.size }));
        const image = await window.desktop.exportPhotoLibrary({ assetId: photo.id });
        if (!image.dataUrl) throw new Error(t("${photo.name} 尚未下载，请先下载预览后重试。", { "photo.name": photo.name }));
        const blob = await (await fetch(image.dataUrl)).blob();
        files.push(new File([blob], `${String(i + 1).padStart(2,"0")}-${photo.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }));
      }
      if (files.reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024) throw new Error(t("这批照片超过 100 MB，请减少选择后重试。"));
      setImportFiles(files);
    } catch (reason) { setError(message(reason)); }
    finally { setPreparing(""); }
  }
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
  useEffect(() => {
    if (authorization === "authorized") void window.desktop?.retainPhotoLibrary?.([...selected.keys()]).catch(reason => setError(message(reason)));
  }, [selected, authorization]);
  useEffect(() => { onStatus?.(authorization === "authorized" ? t("只读取系统照片库，选好后进入“认人 → 讲故事”") : t("照片库不会被改动，也不会发送给 AI")); }, [authorization, onStatus, t]);
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
        if (status !== "authorized") { generation.current += 1; setBusy(false); setResult(undefined); setSelected(new Map()); }
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
    if (busy || preparing) return;
    const input: PhotoLibrarySearchInput = more && lastInput.current ? { ...lastInput.current, cursor: result?.nextCursor } : { query, dateBasis, place, radiusKm, albumId, favoritesOnly, photoType, from, through };
    const current = ++generation.current;
    setBusy(true); setError("");
    if (!more) { setResult(undefined); }
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
          if (status !== "authorized") { generation.current += 1; setBusy(false); setResult(undefined); setSelected(new Map()); }
        }
      }
    } finally { if (current === generation.current) setBusy(false); }
  }
  async function cancel() {
    generation.current += 1; setBusy(false); setResult(undefined); setError("");
    await window.desktop?.cancelPhotoLibrarySearch?.().catch(() => {});
  }
  function clearFilters() {
    setQuery(""); setFrom(""); setThrough(""); setDateBasis("taken"); setPlace(""); setRadiusKm(30); setAlbumId(""); setFavoritesOnly(false); setPhotoType("all"); setResult(undefined); setError("");
  }
  const advancedFilters = [
    ...(dateBasis === "added" ? [{ label: t("加入图库时间"), clear: () => setDateBasis("taken") }] : []),
    ...(from ? [{ label: t("从 ${from}", { from }), clear: () => setFrom("") }] : []),
    ...(through ? [{ label: t("至 ${through}", { through }), clear: () => setThrough("") }] : []),
    ...(albumId ? [{ label: filters?.albums.find(album => album.id === albumId)?.title || t("相册"), clear: () => setAlbumId("") }] : []),
    ...(photoType !== "all" ? [{ label: t(photoTypes.find(entry => entry[0] === photoType)![1]), clear: () => setPhotoType("all") }] : []),
    ...(favoritesOnly ? [{ label: t("仅看收藏"), clear: () => setFavoritesOnly(false) }] : []),
  ];
  const dateTag = locale === "en" ? "en" : "zh-CN";
  return <div id="photo-library-search" className="photo-library-search">
    {!authorization && !error && <p role="status">{t("正在检查照片库访问权限…")}</p>}
    {authorization === "notDetermined" && <div className="photo-library-access"><p>{t("允许后可以搜索这台 Mac 的系统照片库。只读取和展示，不自动导入，也不发送给 AI。未同步到这台 Mac 的手机照片无法查找。")}</p><button type="button" className="desktop-primary" disabled={busy} onClick={() => void access()}>{busy ? t("等待系统授权…") : t("允许访问照片库")}</button></div>}
    {(authorization === "denied" || authorization === "restricted") && <div className="photo-library-access"><p>{t(authorization === "restricted" ? "系统限制了照片库访问，请检查设备的隐私限制。" : "尚未允许访问照片库。你可以在系统设置的“隐私与安全性 → 照片”中开启。")}</p><div className="photo-library-actions"><button type="button" className="desktop-secondary" onClick={() => void bridge.openPhotoLibrarySettings().catch(error => setError(message(error)))}>{t("打开系统设置")}</button><button type="button" className="desktop-secondary" disabled={busy} onClick={() => void access()}>{t("已设置，重新检查")}</button></div></div>}
    {authorization === "authorized" && <>
      <form onSubmit={event => { event.preventDefault(); void search(); }}>
        <p className="source-lead"><Icon name="image" size={18} />{t("从一张照片想起——按时间、地点、相册或收藏，找找最近或以前的照片。")}</p>
        <div className="photo-filter-grid">
          <div><label><span>{t("时间（可选）")}</span><input type="search" value={query} disabled={busy} maxLength={120} placeholder={t("例如：最近30天、去年、2024年5月")} aria-describedby="photo-library-time-help" onChange={event => { setQuery(event.target.value); if (event.target.value) { setFrom(""); setThrough(""); } }} /></label>
          <div className="photo-chip-row" role="group" aria-label={t("常用时间")}>{["最近7天","最近30天","今年","去年"].map(time => {
            const days = time.match(/^最近(\d+)天$/);
            return <button type="button" className="photo-chip" key={time} disabled={busy} aria-pressed={query === time} onClick={() => { setQuery(time); setFrom(""); setThrough(""); }}>{days ? t("最近 ${count} 天", { count: days[1] }) : t(time)}</button>;
          })}</div></div>
          <div><label><span>{t("拍摄地点（可选）")}</span><input type="search" value={place} disabled={busy} maxLength={120} placeholder={t("例如：浙江杭州富阳")} aria-describedby="photo-library-place-help" onChange={event => setPlace(event.target.value)} /></label>
          <div className="photo-chip-row" role="group" aria-label={t("地点附近范围")}><span>{t("附近")}</span>{[1,5,10,30,100].map(radius => <button type="button" className="photo-chip" key={radius} disabled={busy || !place.trim()} aria-pressed={radiusKm === radius} onClick={() => setRadiusKm(radius)}>{radius}{radius === 1 ? t(" 公里") : ""}</button>)}</div></div>
        </div>
        <p id="photo-library-time-help" className="photo-library-note">{t("时间留空查看全部日期；也可在“更多筛选”里用起止日期，和上方时间任选一种。")}</p>
        <p id="photo-library-place-help" className="photo-library-note">{t("地点由 Apple 联网定位，只匹配有位置记录的照片；附近范围不代表行政区边界。")}</p>
        <div className="photo-advanced-row"><button type="button" className="photo-advanced-toggle" aria-expanded={advanced} aria-controls="photo-advanced-panel" onClick={() => setAdvanced(value => !value)}><Icon name="controls" size={17} />{t("更多筛选")}{advancedFilters.length > 0 && <span className="capture-source-count">{advancedFilters.length}</span>}<Icon name="down" size={16} /></button>
        {!advanced && <div className="photo-chip-row">{advancedFilters.map(filter => <button type="button" className="photo-chip" key={filter.label} disabled={busy} aria-label={t("移除筛选：${label}", { label: filter.label })} onClick={filter.clear}>{filter.label}<Icon name="close" size={12} /></button>)}</div>}</div>
        <div id="photo-advanced-panel" className="photo-advanced-panel" hidden={!advanced}>
          <label><span>{t("时间依据")}</span><select value={dateBasis} disabled={busy} onChange={e => setDateBasis(e.target.value as typeof dateBasis)}><option value="taken">{t("拍摄时间")}</option>{filters?.supportsAddedDate && <option value="added">{t("加入图库时间")}</option>}</select></label>
          <label><span>{t("开始日期（可选）")}</span><input type="date" min="1900-01-01" max="2200-12-31" value={from} disabled={busy} onChange={e => { setFrom(e.target.value); setQuery(""); }} /></label>
          <label><span>{t("结束日期（可选）")}</span><input type="date" min="1900-01-01" max="2200-12-31" value={through} disabled={busy} onChange={e => { setThrough(e.target.value); setQuery(""); }} /></label>
          <div className="photo-album-field"><label><span>{t("相册")}</span><select value={albumId} disabled={busy || filtersLoading || !filters} onChange={e => setAlbumId(e.target.value)}><option value="">{filtersLoading ? t("正在读取相册…") : t("全部相册")}</option>{filters?.albums.map(album => <option key={album.id} value={album.id}>{album.title}</option>)}</select></label><button type="button" className="desktop-secondary" aria-label={t("刷新相册")} disabled={busy || filtersLoading} onClick={() => setFiltersRevision(value => value + 1)}><Icon name="refresh" size={17} /></button></div>
          <label><span>{t("照片类型")}</span><select value={photoType} disabled={busy} onChange={e => setPhotoType(e.target.value as typeof photoType)}>{photoTypes.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
          <label className="photo-library-favorite"><input type="checkbox" checked={favoritesOnly} disabled={busy} onChange={e => setFavoritesOnly(e.target.checked)} />{t("仅看收藏")}</label>
        </div>
        {filtersError && <p role="alert" className="photo-library-error">{t("相册读取失败：${error}。请刷新相册后重试。", { error: filtersError })}</p>}
        <div className="photo-library-submit"><button type="submit" className="desktop-primary" disabled={busy}><Icon name="search" size={16} />{busy ? t("查找中…") : t("搜索照片")}</button><button type="button" className="desktop-secondary" disabled={busy} onClick={clearFilters}>{t("清除筛选")}</button></div>
      </form>
      {busy && !result && <div className="photo-library-skeletons" aria-hidden="true">{Array.from({length: 12}, (_, i) => <div key={i} />)}</div>}
      {busy && <div className="photo-library-progress" role="status"><span>{t("正在读取照片信息，大图库或地点查询可能需要一些时间。")}</span><button type="button" className="desktop-secondary" onClick={() => void cancel()}>{t("取消查找")}</button></div>}
      {result && <>
        <div className="photo-library-result-head"><p>{result.summary}</p><span>{t("已显示 ${count} 张", { count: result.photos.length })}{result.nextCursor ? t(" · 还有更多") : ""}</span></div>
        {result.place && <p className="photo-library-note">{t("匹配地点：${name}（${latitude}, ${longitude}），附近 ${radius} 公里。", { name: result.place.name, latitude: result.place.latitude.toFixed(3), longitude: result.place.longitude.toFixed(3), radius: result.place.radiusKm })}</p>}
        {result.photos.length ? <PhotoResults photos={result.photos} bridge={bridge} selected={selected} toggle={toggle} capped={selected.size >= PHOTO_LIMIT} onThumbnail={(id, url) => setThumbnails(previous => previous.get(id) === url ? previous : new Map([...previous, [id, url]]))} /> : <div className="photo-library-empty"><p>{t("没有找到符合条件的照片。试试放宽时间、地点范围，或清除部分筛选条件。")}</p><button type="button" className="desktop-secondary" onClick={clearFilters}>{t("清除筛选")}</button></div>}
        {result.nextCursor && <button type="button" className="desktop-secondary photo-library-more" disabled={busy} onClick={() => void search(true)}>{t("显示更多照片")}</button>}
      </>}
      {limit && selected.size >= PHOTO_LIMIT && <p role="status" className="photo-limit-note">{t("一条记录最多选 50 张。先取消几张，再继续选。")}</p>}
      {selected.size > 0 && <div className="photo-selection-bar"><div className="photo-selection-stack" aria-hidden="true">{[...selected.keys()].slice(0,3).map(id => thumbnails.get(id) && <img key={id} src={thumbnails.get(id)} alt="" />)}</div><div className="photo-selection-copy"><strong>{t("已选 ${count} / 50 张", { count: selected.size })}{selected.size >= PHOTO_LIMIT ? t(" · 已达上限") : ""}</strong><span>{t("下一步圈选人物、让 AI 串成故事，照片原文件不会被改动")}</span></div><button type="button" className="photo-link-button" disabled={!!preparing} onClick={() => { setSelected(new Map()); setLimit(false); }}>{t("清空")}</button><button type="button" className="desktop-primary" disabled={!!preparing || busy} onClick={() => void prepareImport()}><Icon name="spark" size={17} />{preparing || t("整理成照片记忆")}</button></div>}
      <p className="photo-library-note photo-library-privacy">{t("仅浏览系统照片库，不改动照片；点“AI 帮你写”之前不会发送给 AI。人物姓名和画面内容暂不参与搜索；iCloud 照片需点击下载预览。")}</p>
    </>}
    {photoHistory.length > 0 && <details className="photo-memory-history"><summary>{t("照片记忆 · 继续整理 (${count})", { count: photoHistory.length })}</summary>{photoHistory.map(item => <button type="button" key={item.id} className="photo-history-item" onClick={() => setBatch(item)}><Icon name="image" size={15} />{item.files[0]?.originalName || t("照片记忆")}<span>{t("${count} 张 · ${date}", { count: item.fileCount, date: new Date(item.createdAt).toLocaleDateString(dateTag) })}</span></button>)}</details>}
    {completed && <p role="status" className="capture-saved">{t("已生成生活记录「${title}」，照片已收进理解。", { title: completed.title })}{completed.pageId && <NavLink to={pageHref(completed.pageId)}>{t("查看记录")} <Icon name="arrow" size={14} /></NavLink>}</p>}
    {importFiles && <ImportMaterialsModal folders={[destination]} currentFolder={destination} initialRoute="photos" initialPhotoFiles={importFiles} knowledgeBaseId={knowledgeBaseId} onClose={() => setImportFiles(undefined)} onImported={value => { importedSelections.current.set(value.id, [...selected.keys()]); setBatch(value); if (value.targetFolder) onDestination?.(value.targetFolder); refreshHistory(); }} onConnected={() => {}} onJourney={() => {}} />}
    {batch && <PhotoCaptureDialog batch={batch} knowledgeBaseId={knowledgeBaseId} close={() => { setBatch(undefined); refreshHistory(); }} completed={(title, pageId) => { setCompleted({ title, pageId }); setLimit(false); setBatch(undefined); refreshHistory(); }} />}
    {error && <div role="alert" className="photo-library-error"><p>{t(error)}</p>{!authorization && <button type="button" className="desktop-secondary" disabled={busy} onClick={() => void access()}>{t("重新检查")}</button>}</div>}
  </div>;
}
