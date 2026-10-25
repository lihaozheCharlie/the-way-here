import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { FolderTree } from "../../shared/FolderTree";
import { TextInput } from "../../shared/form-controls";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PaymentJourneySummary, SourceImportBatch, SourceImportChannel, VaultInfo } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { Icon } from "../../shared/ui";
import { preparePhotoFile } from "./photo-compression";
import { PHOTO_LIMIT, photoSelectionError } from "./photo-model";
import { useI18n } from "../../shared/i18n";
import "./photo-memory.css";

export type ImportRoute = "chat" | "bill" | "photos";

type ChatImportProvider = Exclude<SourceImportChannel, "files" | "alipay" | "photos">;

const chatImportProviders: Array<{ id: ChatImportProvider; label: string }> = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "doubao", label: "豆包" },
  { id: "other-ai", label: "其他 AI" },
];

const rememberedImportRouteKey = "the-way-here.import-route";
const rememberedImportProviderKey = "the-way-here.import-provider";

function rememberedImportRoute(fallback: ImportRoute): ImportRoute {
  try {
    const saved = window.localStorage.getItem(rememberedImportRouteKey);
    return saved === "chat" || saved === "bill" || saved === "photos" ? saved : fallback;
  } catch {
    return fallback;
  }
}

function rememberedImportProvider(): ChatImportProvider {
  try {
    const saved = window.localStorage.getItem(rememberedImportProviderKey);
    return chatImportProviders.some(({ id }) => id === saved) ? saved as ChatImportProvider : "chatgpt";
  } catch {
    return "chatgpt";
  }
}

function formatImportBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}

export function RecordImportTrigger({ onClick, className = "", label = "带一段记录进来" }: { onClick: () => void; className?: string; label?: string }) {
  const { t } = useI18n();
  return <button type="button" className={`record-import-trigger${className ? ` ${className}` : ""}`} aria-haspopup="dialog" onClick={onClick}><Icon name="build" size={15} />{t(label)}</button>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

type SelectedImportFile = { file: File; relativePath: string };

function selectedFiles(list: FileList | null): SelectedImportFile[] {
  return [...(list || [])].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

async function droppedEntryFiles(entry: FileSystemEntry, parentPath = ""): Promise<SelectedImportFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, relativePath: `${parentPath}${file.name}` }];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  while (true) {
    const page = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!page.length) break;
    children.push(...page);
  }
  const nested = await Promise.all(children.map((child) => droppedEntryFiles(child, `${parentPath}${entry.name}/`)));
  return nested.flat();
}

async function droppedFiles(transfer: DataTransfer): Promise<SelectedImportFile[]> {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  const entries = items.map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (entries.length === items.length && entries.length) {
    return (await Promise.all(entries.map((entry) => droppedEntryFiles(entry)))).flat();
  }
  return selectedFiles(transfer.files);
}

export function ImportMaterialsModal({ folders, currentFolder, initialRoute, onClose, onImported, onJourney, initialPhotoFiles, knowledgeBaseId }: { initialPhotoFiles?: File[]; knowledgeBaseId?: string; folders: string[]; currentFolder: string; initialRoute?: ImportRoute; onClose: () => void; onImported: (batch: SourceImportBatch) => void; onConnected: () => void; onJourney: (journey: PaymentJourneySummary) => void }) {
  const { t } = useI18n();
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  const [memoryTitle, setMemoryTitle] = useState("");
  const preparation = useRef<AbortController | undefined>(undefined);
  const [preparing, setPreparing] = useState("");
  const [photoPreparationNote, setPhotoPreparationNote] = useState("");
  useEffect(() => () => preparation.current?.abort(), []);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [route, setRoute] = useState<ImportRoute>(() => initialRoute || rememberedImportRoute("chat"));
  const [provider, setProvider] = useState<ChatImportProvider>(rememberedImportProvider);
  const [step, setStep] = useState<1 | 2>(initialPhotoFiles ? 2 : 1);
  const [files, setFiles] = useState<SelectedImportFile[]>(() => initialPhotoFiles?.map(file => ({ file, relativePath: file.name })) || []);
  function existingDestination(kind: ImportRoute): string {
    const preferred = kind === "photos" ? "照片记忆" : kind === "bill" ? "消费账单" : folders.includes("聊天记录") ? "聊天记录" : "AI聊天记录";
    return kind === "photos" ? preferred : folders.includes(preferred) ? preferred : "";
  }
  const [targetFolder, setTargetFolder] = useState(() => initialPhotoFiles ? currentFolder : existingDestination(initialRoute || rememberedImportRoute("chat")));
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [draggingMaterials, setDraggingMaterials] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useDismissLayer(true, onClose, { dismissible: !importing, priority: 1, element: dialogRef });
  const totalBytes = files.reduce((total, item) => total + item.file.size, 0);
  const channel: SourceImportChannel = route === "photos" ? "photos" : route === "chat" ? provider : route === "bill" ? "alipay" : "files";
  const acceptedPattern = route === "photos" ? /\.(jpe?g|png|webp)$/i : route === "bill" ? /\.csv$/i : /\.(md|txt|zip|json|html?)$/i;
  const accept = route === "photos" ? ".jpg,.jpeg,.png,.webp" : route === "bill" ? ".csv,text/csv" : ".md,.txt,.zip,.json,.html,.htm,text/markdown,text/plain,application/json,text/html,application/zip";
  const destination = targetFolder;
  const routeLabel = t(route === "photos" ? "照片" : route === "chat" ? "聊天记录" : "消费账单");

  useEffect(() => {
    const urls = route === "photos" ? files.map(({ file }) => URL.createObjectURL(file)) : [];
    setThumbnails(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files, route]);

  useEffect(() => {
    try {
      window.localStorage.setItem(rememberedImportRouteKey, route);
      if (route === "chat") window.localStorage.setItem(rememberedImportProviderKey, provider);
    } catch {
      // Import still works when browser storage is unavailable.
    }
  }, [provider, route]);

  useEffect(() => {
    const focusStep = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>(step === 1 ? "[data-autofocus]" : '.folder-tree [tabindex="0"]' )?.focus(), 0);
    return () => window.clearTimeout(focusStep);
  }, [step]);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const obscuredElements: Array<{ element: HTMLElement; hadInert: boolean; ariaHidden: string | null }> = [];
    let visibleBranch = dialogRef.current?.parentElement;
    while (visibleBranch && visibleBranch !== document.body) {
      const parent = visibleBranch.parentElement;
      if (!parent) break;
      [...parent.children].forEach((sibling) => {
        if (sibling === visibleBranch || !(sibling instanceof HTMLElement)) return;
        obscuredElements.push({ element: sibling, hadInert: sibling.hasAttribute("inert"), ariaHidden: sibling.getAttribute("aria-hidden") });
        sibling.setAttribute("inert", "");
        sibling.setAttribute("aria-hidden", "true");
      });
      visibleBranch = parent;
    }
    document.body.style.overflow = "hidden";
    const focusDialog = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus(), 0);
    const manageKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') || [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", manageKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      obscuredElements.forEach(({ element, hadInert, ariaHidden }) => {
        if (!hadInert) element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      window.clearTimeout(focusDialog);
      window.removeEventListener("keydown", manageKeyboard);
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

  function changeRoute(next: ImportRoute) {
    preparation.current?.abort(); setPreparing(""); setPhotoPreparationNote("");
    setRoute(next);
    setStep(1);
    setFiles([]);
    setError("");
    setDraggingMaterials(false);
    setTargetFolder(existingDestination(next));
    dragDepthRef.current = 0;
  }

  async function selectFiles(candidates: SelectedImportFile[]) {
    if (importing || preparing) return;
    if (route === "photos") {
      const controller = new AbortController();
      preparation.current = controller;
      const combined = [...files];
      const warnings: string[] = [];
      let compressed = 0;
      try {
        for (const [index, item] of candidates.entries()) {
          if (controller.signal.aborted) return;
          const invalid = photoSelectionError(item.file);
          if (invalid) {
            warnings.push(invalid.includes("HEIC") ? t("${name}：请使用 JPG、PNG 或 WebP，HEIC 请先导出为 JPG", { name: item.file.name }) : t("${name}：单张照片最多 100 MB，且不能是空文件", { name: item.file.name }));
            continue;
          }
          if (combined.some((p) => p.relativePath === item.relativePath && p.file.lastModified === item.file.lastModified)) continue;
          if (combined.length >= PHOTO_LIMIT) { warnings.push(t("每批最多 ${count} 张，超出的照片未添加", { count: PHOTO_LIMIT })); break; }
          setPreparing(t("正在准备第 ${index} / ${total} 张照片${extra}", { index: index + 1, total: candidates.length, extra: item.file.size > 20 * 1024 * 1024 ? t("，压缩大图中…") : t("…") }));
          try {
            const file = await preparePhotoFile(item.file, controller.signal);
            if (controller.signal.aborted) return;
            if (file !== item.file) compressed += 1;
            combined.push({ file, relativePath: item.relativePath });
          } catch (reason) {
            if (controller.signal.aborted) return;
            warnings.push(t("${name}：${reason}", { name: item.file.name, reason: t(reason instanceof Error ? reason.message : "图片处理失败") }));
          }
        }
        if (!controller.signal.aborted) {
          setFiles(combined);
          setError(warnings.join("；"));
          setPhotoPreparationNote(compressed ? t("本次已压缩 ${count} 张大图，将保存压缩副本；电脑上的原文件不变。", { count: compressed }) : "");
        }
      } finally { if (!controller.signal.aborted) setPreparing(""); }
      return;
    }
    const selected = candidates.filter(({ file }) => acceptedPattern.test(file.name)).slice(0, route === "bill" ? 1 : undefined);
    setFiles(selected);
    setError(selected.length || !candidates.length ? "" : route === "bill" ? t("请选择支付宝导出的 CSV 账单。") : t("请选择聊天平台导出的 ZIP、JSON、HTML、TXT、Markdown 文件或文件夹。"));
  }

  function selectInputFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const candidates = selectedFiles(event.currentTarget.files);
    event.currentTarget.value = "";
    selectFiles(candidates);
  }

  async function selectDroppedFiles(transfer: DataTransfer) {
    try {
      selectFiles(await droppedFiles(transfer));
    } catch {
      setError(t("无法读取这个文件夹，请确认它仍然可访问后再试。"));
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preparing || importing) return;
    if (step === 1) {
      if (!files.length) {
        setError(t("请先选择需要带进来的材料。"));
        return;
      }
      if (totalBytes > 100 * 1024 * 1024) {
        setError(t("这批材料超过 100 MB，请拆分后再导入。"));
        return;
      }
      setError("");
      setStep(2);
      return;
    }
    if (!files.length) {
      setError("请先选择需要带进来的材料。");
      return;
    }
    if (totalBytes > 100 * 1024 * 1024) {
      setError("这批材料超过 100 MB，请拆分后再导入。");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const payload = [];
      for (const { file, relativePath } of files) payload.push({
        name: file.name,
        relativePath,
        content: /\.zip$/i.test(file.name) || route === "bill" || route === "photos" ? await fileToBase64(file) : await file.text(),
        encoding: /\.zip$/i.test(file.name) || route === "bill" || route === "photos" ? "base64" as const : "utf8" as const,
        mimeType: file.type || undefined,
      });
      const batch = await api<SourceImportBatch>(route === "photos" ? "/api/imports/photos" : "/api/imports/files", { method: "POST", ...(route === "photos" ? { signal: AbortSignal.timeout(120_000) } : {}), body: JSON.stringify({ files: payload, channel, targetFolder: destination, ...(route === "photos" ? { title: memoryTitle.trim() || "照片记忆", knowledgeBaseId: knowledgeBaseId || vault?.knowledgeBaseId } : {}) }) });
      if (batch.journey) onJourney(batch.journey);
      onClose();
      onImported(batch);
    } catch (reason: any) {
      setError(reason.name === "TimeoutError" ? t("导入超时，请检查生活记录中是否已保存，再重试。") : reason.message);
    } finally {
      setImporting(false);
    }
  }

  return createPortal(<div className="import-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) onClose(); }}>
    <section ref={dialogRef} className={`import-modal${initialPhotoFiles ? " import-modal--library-photos" : ""}`} role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <header className="import-modal-header"><div><h2 id="import-modal-title">{t("带一段记录进来")}</h2><p>{step === 1 ? t("先说说材料来自哪里，再把它放进来。") : t("确认这些记录要保留到哪里。")}</p></div><button type="button" onClick={onClose} disabled={importing} aria-label={t("关闭记录导入窗口")}><Icon name="close" size={18} /></button></header>
      <form onSubmit={submit}>
        {<ol className="import-stepper" aria-label={t("导入进度")}>
          <li className={step === 1 ? "active" : "done"} aria-current={step === 1 ? "step" : undefined}><span>{step === 2 ? <Icon name="check" size={12} /> : "1"}</span><b>{step === 2 ? t("${label} · ${count} 个文件", { label: routeLabel, count: files.length }) : t("选类型 + 加材料")}</b></li>
          <li className="import-stepper-line" aria-hidden="true" />
          <li className={step === 2 ? "active" : ""} aria-current={step === 2 ? "step" : undefined}><span>2</span><b>{t("确认位置")}</b></li>
        </ol>}
        <div className="import-modal-body">
          {step === 1 ? <section className="import-step-panel" aria-label={t("选择记录类型并添加材料")}>
            <div className="import-type-grid" role="group" aria-label={t("记录类型")}>

              <button type="button" disabled={importing} data-autofocus={route === "chat" ? "true" : undefined} aria-pressed={route === "chat"} className={route === "chat" ? "active" : ""} onClick={() => { if (route !== "chat") changeRoute("chat"); }}><span className="import-type-icon"><Icon name="message" size={18} /></span><b>{t("聊天记录")}</b><small>{t("ChatGPT、Claude、豆包等平台的导出文件")}</small></button>
              <button type="button" disabled={importing} data-autofocus={route === "bill" ? "true" : undefined} aria-pressed={route === "bill"} className={route === "bill" ? "active" : ""} onClick={() => { if (route !== "bill") changeRoute("bill"); }}><span className="import-type-icon"><Icon name="receipt" size={18} /></span><b>{t("消费账单")}</b><small>{t("支付宝导出的 CSV 账单")}</small></button>
              <button type="button" disabled={importing} data-autofocus={route === "photos" ? "true" : undefined} aria-pressed={route === "photos"} className={route === "photos" ? "active" : ""} onClick={() => { if (route !== "photos") changeRoute("photos"); }}><span className="import-type-icon"><Icon name="image" size={18} /></span><b>{t("照片")}</b><small>{t("JPG / PNG / WebP，每批最多 50 张")}</small></button>
            </div>
            <div className="import-material-zone">
              <header><b>{t("添加材料")}</b><span>{routeLabel}</span></header>
              {route === "chat" ? <div className="import-provider-list" role="group" aria-label={t("聊天平台")}>{chatImportProviders.map((item) => <button type="button" key={item.id} aria-pressed={provider === item.id} className={provider === item.id ? "active" : ""} onClick={() => { setProvider(item.id); setFiles([]); setError(""); }}>{t(item.label)}</button>)}</div> : null}
              <div>
              <div
                className={`import-file-picker is-dropzone${draggingMaterials ? " is-dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDraggingMaterials(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDraggingMaterials(false); }}
                onDrop={(event) => { event.preventDefault(); dragDepthRef.current = 0; setDraggingMaterials(false); void selectDroppedFiles(event.dataTransfer); }}
              >
                <span className="import-drop-icon"><Icon name="up" size={20} /></span>
                <b>{draggingMaterials ? t("放在这里") : route === "photos" ? t("选择或拖入照片") : t("选择或拖入材料")}</b>
                <span>{route === "photos" ? t("JPG / PNG / WebP · 最多 50 张 · 超过 20 MB 自动压缩，单张上限 100 MB · 不接收动图，HEIC 请先导出 JPG") : route === "bill" ? t("支付宝导出的 CSV · 单次一份，最多 100 MB") : t("ZIP / JSON / HTML / TXT / Markdown，或包含它们的文件夹 · 单次最多 100 MB")}</span>
                <div className="import-file-picker-controls">

                  <button type="button" disabled={Boolean(preparing) || importing} onClick={() => fileInputRef.current?.click()}>{route === "photos" ? files.length ? t("继续添加照片") : t("选择照片") : route === "bill" ? t("选择 CSV") : t("选择文件")}</button>
                  {route !== "bill" ? <><span aria-hidden="true">·</span><button type="button" disabled={Boolean(preparing) || importing} onClick={() => folderInputRef.current?.click()}>{t("选择文件夹")}</button></> : null}
                </div>
                <input ref={fileInputRef} key={`${route}-${provider}-files`} name="import-files" type="file" accept={accept} multiple={route !== "bill"} tabIndex={-1} aria-hidden="true" onChange={selectInputFiles} />
                {route !== "bill" ? <input ref={(node) => { folderInputRef.current = node; if (node) node.webkitdirectory = true; }} key={`${route}-${provider}-folder`} name="import-folder" type="file" accept={accept} multiple tabIndex={-1} aria-hidden="true" onChange={selectInputFiles} /> : null}
              </div>
              </div>
              {route === "photos" && files.length ? <div className="import-photo-selection" aria-label={t("已选择的照片")}>{files.map((item, index) => <figure key={item.relativePath}><img src={thumbnails[index]} alt={item.file.name} /><button type="button" disabled={Boolean(preparing) || importing} aria-label={t("移除 ${name}", { name: item.file.name })} onClick={() => setFiles(files.filter((_, i) => i !== index))}><Icon name="close" size={12} /></button><figcaption>{item.file.name}</figcaption></figure>)}</div> : route !== "photos" && files.length ? <div className="import-selection-list" aria-label={t("已选择的材料")}><header>{t("已选 ${count} 个文件 · ${size}", { count: files.length, size: formatImportBytes(totalBytes) })}</header>
                {files.map((item, index) => <div key={item.relativePath}><span><Icon name="journal" size={13} /></span><b>{item.relativePath}</b><small>{formatImportBytes(item.file.size)}</small><button type="button" aria-label={t("移除 ${name}", { name: item.file.name })} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><Icon name="close" size={14} /></button></div>)}

              </div> : null}
            </div>
            <div className="import-folder-nudge"><Icon name="folder" size={22} /><div><b>{t("要读日记或笔记？不用导入")}</b></div><button type="button" onClick={() => { onClose(); window.setTimeout(() => window.dispatchEvent(new Event("open-source-folder")), 0); }}>{t("打开文件夹…")}</button></div>
          </section> : <section className="import-destination-step" aria-label={t("确认保存位置")}>
            <div className="import-destination-options">
              {route === "photos" && initialPhotoFiles && <div><b>{t("已选照片")}</b><div className="import-photo-selection">{thumbnails.slice(0, 11).map((url, i) => <figure key={url}><img src={url} alt={files[i]?.file.name} /></figure>)}{files.length > 11 && <span>+{files.length - 11}</span>}</div><p>{t("要增减照片，请返回“找照片”调整选择，最多 50 张。")}</p></div>}
              {route === "photos" ? <label className="import-folder-field"><span>{t("这段记忆叫什么")}</span><TextInput value={memoryTitle} maxLength={100} disabled={importing} onChange={(event) => setMemoryTitle(event.target.value)} placeholder={t("例如：云南之旅 · 2026")} /></label> : null}
              <b>{t("保存位置")}</b><div className="import-folder-picker" inert={importing}><FolderTree internalOnly selected={targetFolder} onSelect={setTargetFolder} /></div><p className="import-selected-path">{t("已选：${folder}", { folder: targetFolder || t("应用资料根目录") })}</p>
            </div>
            <aside className="import-summary" aria-label={t("这批材料摘要")}><h3>{t("确认这批材料")}</h3><dl><div><dt>{t("类型")}</dt><dd>{routeLabel}</dd></div>{route === "chat" ? <div><dt>{t("平台")}</dt><dd>{t(chatImportProviders.find((item) => item.id === provider)?.label || "")}</dd></div> : null}<div><dt>{t("文件数")}</dt><dd>{t("${count} 个", { count: files.length })}</dd></div><div><dt>{t("大小")}</dt><dd>{formatImportBytes(totalBytes)}</dd></div><div><dt>{t("保存到")}</dt><dd>{destination || t("应用资料根目录")}</dd></div></dl>{route === "photos" ? <p>{t("系统照片库的 HEIC 自动导出为 JPG。照片保留在本地；超过 20 MB 的大图压缩后保存，电脑原文件不变。只有点击“AI 帮你写”时，这组所有照片的预览才会一起发送给模型。")}</p> : null}</aside>
          </section>}
        </div>
        <footer className="import-modal-footer"><div aria-live="polite">{preparing ? <span role="status">{preparing}</span> : error ? <span role="alert">{error}</span> : photoPreparationNote || (step === 1 ? files.length ? t("已选 ${count} 个文件 · 共 ${size}", { count: files.length, size: formatImportBytes(totalBytes) }) : route === "photos" ? t("照片保留在本地，最多 50 张。大图会在本地压缩。") : route === "bill" ? t("仅支持支付宝导出的 CSV；单次选择一份。") : t("支持文件、文件夹和 ZIP；只会保留支持的记录格式。") : t("共 ${count} 个文件，不会改动电脑上的原文件", { count: files.length }))}</div><div>{step === 1 ? <><button type="button" className="secondary-action" onClick={onClose}>{t("取消")}</button>{<button className="primary-action" disabled={!files.length || Boolean(preparing)}>{t("下一步")}<Icon name="arrow" size={14} /></button>}</> : <><button type="button" className="secondary-action" onClick={() => { if (initialPhotoFiles) onClose(); else { setStep(1); setError(""); } }} disabled={importing}><Icon name="back" size={14} />{initialPhotoFiles ? t("返回选照片") : t("上一步")}</button><button className="primary-action" disabled={importing || (route === "photos" && !knowledgeBaseId && !vault)}>{importing ? route === "photos" ? t("正在保留照片…") : t("正在带进来…") : <>{route === "photos" ? t("开始认人物") : t("导入 ${count} 个文件", { count: files.length })}<Icon name="arrow" size={14} /></>}</button></>}</div></footer>
      </form>
    </section>
  </div>, document.body);
}
