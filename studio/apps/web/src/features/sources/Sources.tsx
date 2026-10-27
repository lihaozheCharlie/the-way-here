import { FolderTree } from "../../shared/FolderTree";
import { SourceConnectionsPanel } from "./SourceConnectionsPanel";
import { sourcePagePath } from "./source-model";
import { FileBrowserPane, FileBrowserItem } from "../../shared/FileBrowser";
import { InlineNameForm } from "../../shared/InlineNameForm";
import { SourceListOptions } from "./SourceListOptions";
import { DocumentPreview } from "../../shared/DocumentPreview";
import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { useRememberedPreview } from "../../shared/use-remembered-preview";
import { PaneShelf } from "../../shared/PaneShelf";
import { QuietScroll } from "../../shared/QuietScroll";
import { FileMenu } from "../../shared/FileMenu";
import { SearchField } from "../../shared/form-controls";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import type { VaultInfo, PaymentJourneyClueState, PaymentJourneyCluster, PaymentJourneySummary, SourceImportBatch, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { api } from "../../api";
import { graphCategoryNames } from "../../shared/categories";
import { tr, useDemoLabels, useI18n } from "../../shared/i18n";
import { pageDestination, pageHref, type ReturnContext } from "../../shared/routing";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { openContextAgent } from "../collaboration/model";
import { journeyDeepConversationPrompt, journeyOverviewConversationPrompt } from "./journey-conversation";
import { documentIdentity } from "../../shared/markdown";
import { ConfirmDeleteDialog } from "../../shared/ConfirmDeleteDialog";
import { Empty, Icon, Loading } from "../../shared/ui";
import { ImportMaterialsModal } from "./ImportMaterialsModal";
import { PhotoMemoryPanel } from "./PhotoMemoryPanel";
import { BillMemoryPanel } from "./BillMemoryPanel";
import { SourceMemoryCards, SourceMemoryDialog } from "./SourceMemories";
import { clearPendingPhotoMemory, readPendingPhotoMemory } from "../overview/photo-library-handoff";
import { excludeDeletedSources, importedMemoryRecord, mergeSourceBatches, pendingMemoryRecords } from "./source-memory-model";
import { sourceFolderOptions, useSourceFolders } from "./source-folders";
import { buildableSourceRecordForPage, cleanSourcePath, importedFolderForBatch, pendingSourceBuildRecords, sourceBuildActionPresentation, sourceBuildPresentation, sourceBuildRecordForPage, sourceBuildRecords, sourceMonthOptions, sourcePageMatchesRequest, sourceRecordDate, sourceRecordMonth, sourceRecordType, sourceRecordTypes, type SourceBuildRecord, type SourceRecordType } from "./source-model";

function sourceBuildTitle(record: SourceBuildRecord): string {
  return cleanSourcePath(record.file.storedPath).split("/").at(-1)?.replace(/\.md$/i, "") || record.file.originalName;
}
function memoryRecordKey(record: SourceBuildRecord): string { return `${record.batch.id}\u0000${record.file.storedPath}`; }

type SourceBuildIntent = "enrich" | "build" | "open";

function SourceBuildConfirmAction({ record, busy, onConfirm, detail = false }: { record: SourceBuildRecord; busy: boolean; onConfirm: () => void; detail?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: -1000, top: -1000 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDismissLayer(open, () => { setOpen(false); triggerRef.current?.focus(); });

  useLayoutEffect(() => {
    if (!open) return;
    const placePopover = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(310, window.innerWidth - 24);
      const height = popover.offsetHeight || 180;
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      const below = rect.bottom + 10;
      const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - height - 10);
      setPosition({ left, top });
    };
    const dismiss = (event: PointerEvent) => {
      if (popoverRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    placePopover();
    cancelRef.current?.focus();
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [open]);

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  return <>
    <button ref={triggerRef} type="button" className={`source-build-action is-build-ready${detail ? " is-detail" : ""}`} disabled={busy} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? titleId : undefined} onClick={() => setOpen((value) => !value)}><Icon name="build" size={13} />{busy ? t("正在准备…") : t("构建这份记录")}</button>
    {open ? createPortal(<div ref={popoverRef} className="source-build-confirm" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId} style={position}>
      <b id={titleId}>{t("把「${title}」构建进 Wiki？", { title: sourceBuildTitle(record) })}</b>
      <p id={descriptionId}>{t("只会采用这份报告中已经确认的叙述；候选线索和交易明细不会被当作事实。构建后仍可以回来继续聊。")}</p>
      <div><button ref={cancelRef} type="button" className="source-build-confirm-cancel" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>{t("再想想")}</button><button type="button" className="source-build-confirm-submit" onClick={() => { setOpen(false); onConfirm(); }}>{t("确认构建")}</button></div>
    </div>, triggerRef.current?.closest("dialog") || document.body) : null}
  </>;
}

function SourceBuildAction({ record, busy, onStart, detail = false }: { record: SourceBuildRecord; busy: boolean; onStart: (record: SourceBuildRecord, intent?: SourceBuildIntent) => void; detail?: boolean }) {
  const { t } = useI18n();
  if (record.batch.channel === "photos" || record.batch.channel === "alipay") return <button type="button" className="source-build-action is-dialogue" disabled={busy} aria-haspopup="dialog" onClick={() => onStart(record, "open")}><Icon name={record.batch.channel === "photos" ? "image" : "receipt"} size={13} />{t(record.batch.channel === "photos" ? "打开照片记忆" : "打开账单记忆")}</button>;
  const { file } = record;
  const action = sourceBuildActionPresentation(file);
  if (action.kind === "hidden") return null;
  if (file.buildKind === "dialogue") {
    const chatAction = action.kind === "open"
      ? <button type="button" className={`source-build-action is-quiet${detail ? " is-detail" : ""}`} onClick={() => openContextAgent({ runId: action.runId })}><Icon name="message" size={13} />{t(action.label)}</button>
      : <button type="button" className={`source-build-action is-dialogue${detail ? " is-detail" : ""}`} disabled={busy} onClick={() => onStart(record, "enrich")}><Icon name="message" size={13} />{busy ? t("正在准备…") : t(action.label)}</button>;
    return <div className={`source-journey-actions${detail ? " is-detail" : ""}`}>
      {detail ? <div className="source-journey-action-col">{chatAction}<small>{t("只更新这份记录，不影响 Wiki")}</small></div> : chatAction}
      {file.buildStatus === "ready-to-build" ? detail
        ? <div className="source-journey-action-col"><SourceBuildConfirmAction record={record} busy={busy} detail onConfirm={() => onStart(record, "build")} /><small>{t("确认后写入 Wiki，之后仍可继续聊")}</small></div>
        : <SourceBuildConfirmAction record={record} busy={busy} onConfirm={() => onStart(record, "build")} /> : null}
    </div>;
  }
  if (action.kind === "open") return <button type="button" className="source-build-action is-quiet" onClick={() => openContextAgent({ runId: action.runId })}>{t(action.label)}</button>;
  return <button type="button" className={`source-build-action is-${file.buildKind}`} disabled={busy} onClick={() => onStart(record)}>{file.buildKind === "direct" && !busy ? <Icon name="build" size={13} /> : null}{busy ? t("正在准备…") : t(action.label)}</button>;
}

function SourceJourneyContext({ file }: { file: SourceBuildRecord["file"] }) {
  const { t } = useI18n();
  const status = file.buildStatus || "needs-dialogue";
  const dialogueDone = ["ready-to-build", "building", "built"].includes(status);
  const dialogueCurrent = !dialogueDone;
  const buildCurrent = status === "building";
  const buildDone = status === "built";
  const message = buildDone
    ? t("这份记录已经构建进 Wiki。你仍可以继续聊来完善来源；有新的补充后，会再次由你决定是否更新 Wiki。")
    : buildCurrent
      ? t("正在把已经确认的叙述构建进 Wiki。候选线索和规范化交易只用于核对，不会被当作已经确认的人生事实。")
      : status === "ready-to-build"
        ? t("这份内容还只是草稿。对话补充已经保存在来源记录中；只有确认构建后，它才会进入 Wiki。")
        : status === "in-dialogue"
          ? t("对话正在完善这份来源记录，不会修改 Wiki。等内容准备好后，再由你决定是否构建。")
          : t("账单中的聚类只是回忆候选，还不是人生事实。先聊聊人物、动机或感受，再决定是否构建。");
  return <section className="source-journey-context" data-no-edit>
    <ol className="source-journey-progress" aria-label={t("消费账单构建进度")}>
      <li className="done"><i aria-hidden="true" /><b>{t("账单解析")}</b></li><li className={`rail${dialogueDone ? " done" : ""}`} aria-hidden="true" />
      <li className={`${dialogueDone ? "done" : dialogueCurrent ? "current" : ""}`}><i aria-hidden="true" /><b>{t("对话完善")}</b><span>{t("可反复")}</span></li><li className={`rail${buildDone ? " done" : ""}`} aria-hidden="true" />
      <li className={`${buildDone ? "done" : buildCurrent ? "current" : ""}`}><i aria-hidden="true" /><b>{t("构建入 Wiki")}</b></li>
    </ol>
    <p className={`source-journey-callout is-${buildDone ? "done" : buildCurrent ? "progress" : status === "ready-to-build" ? "ready" : "draft"}`}><Icon name={buildDone ? "check" : "history"} size={15} /><span>{message}</span></p>
  </section>;
}

function ImportedBatchGuide({ batch, busyPath, onStart, onStartAll, onDefer }: { batch: SourceImportBatch; busyPath?: string; onStart: (record: SourceBuildRecord, intent?: SourceBuildIntent) => void; onStartAll: (records: SourceBuildRecord[]) => void; onDefer: (records: SourceBuildRecord[]) => void }) {
  const { t, locale } = useI18n();
  const records = sourceBuildRecords([batch]).filter(({ file }) => !["built", "deferred"].includes(file.buildStatus || "ready"));
  if (!records.length) return null;
  const hasActive = records.some(({ file }) => file.buildStatus === "building" || file.buildStatus === "in-dialogue");
  const directRecords = records.filter(({ file }) => file.buildKind === "direct" && file.buildStatus === "ready");
  const shownRecords = records.slice(0, 5);
  return <section className="source-import-guide" aria-labelledby={`source-import-guide-${batch.id}`}>
    <header><div><span className="source-import-guide-mark" aria-hidden="true"><Icon name="check" size={16} /></span><div><h2 id={`source-import-guide-${batch.id}`}>{t("已收好 ${count} 份新记录", { count: batch.fileCount })}</h2><p>{t("原文已经保存。下面这一步决定它们怎样进入已有理解，你也可以稍后再说。")}</p></div></div><time>{new Date(batch.createdAt).toLocaleString(locale === "en" ? "en" : "zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></header>
    <div className="source-import-guide-list">{shownRecords.map((record) => {
      const state = sourceBuildPresentation(record.file);
      return <article key={record.file.storedPath}><div><b>{sourceBuildTitle(record)}</b><span>{t(record.file.buildKind === "direct" ? "这份记录语境完整，可以直接读懂" : record.file.buildKind === "dialogue" ? "账单只留下线索，需要你说出背后的故事" : "我还不确定这份材料是什么")}</span></div><div className="source-import-guide-state"><span className={`source-build-chip is-${state.tone}`}><i aria-hidden="true" />{t(state.label)}</span><SourceBuildAction record={record} busy={busyPath === record.file.storedPath} onStart={onStart} /></div></article>;
    })}</div>
    {!hasActive ? <footer><span>{records.length > shownRecords.length ? t("另有 ${count} 份，", { count: records.length - shownRecords.length }) : ""}{t("这些记录会继续留在完整列表里。")}</span><div>{directRecords.length > 1 ? <button type="button" className="source-import-build-all" onClick={() => onStartAll(directRecords)}><Icon name="build" size={13} />{t("批量构建 ${count} 份", { count: directRecords.length })}</button> : null}<button type="button" onClick={() => onDefer(records)}>{t("稍后再说")}</button></div></footer> : null}
  </section>;
}

export function SourceKnowledgeConnections({ page }: { page: WikiPage }) {
  const { t } = useI18n();
  const demo = useDemoLabels();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const related = (page.relatedPages || []).filter((item) => item.category !== "maintenance");
  if (!related.length) return null;
  const letter = related.find((item) => item.category === "letters");
  const knowledge = related.filter((item) => item.id !== letter?.id);
  const shown = expanded ? knowledge : knowledge.slice(0, 8);
  const returnContext: ReturnContext = { returnTo: `${location.pathname}${location.search}`, returnLabel: tr("返回这篇原始记录") };
  return <details className="source-knowledge-connections">
    <summary>{t("查看关联结果 · ${count}", { count: related.length })}</summary>
    {letter && <NavLink className="source-letter-feature" to={pageDestination(letter)} state={returnContext}>
      <div><span><Icon name="spark" size={15} />{t("近况回信")}</span><h3>{demo.heading(letter.relativePath, letter.excerpt) || demo.title(letter.title)}</h3><p>{(letter.excerpt && demo.excerpt(letter.relativePath, letter.excerpt)) || t("沿着这篇记录，留下一封可以从未来回看的信。")}</p></div>
      <i><Icon name="arrow" size={17} /></i>
    </NavLink>}
    {shown.length > 0 && <nav className="source-related-knowledge" aria-label={t("这篇原始记录关联的页面")}>
      {shown.map((item) => <NavLink key={item.id} to={pageHref(item.id)} state={returnContext}>
        <span>{t(graphCategoryNames[item.category] || item.category)}</span>
        <b>{demo.heading(item.relativePath, item.excerpt) || demo.title(item.title)}</b>
        <i><Icon name="arrow" size={14} /></i>
        <p className="source-related-peek" data-overflow-tooltip="off">{(item.excerpt && demo.excerpt(item.relativePath, item.excerpt)) || t("打开页面继续阅读完整内容。")}</p>
      </NavLink>)}
    </nav>}
    {knowledge.length > 8 && <button type="button" className="source-related-more" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? t("收起部分页面") : t("查看全部 ${count} 个关联页面", { count: knowledge.length })}<Icon name={expanded ? "back" : "arrow"} size={14} /></button>}
  </details>;
}

function SourcePreview({ page, revision, startEditing = false, fileNameFocusToken = 0, buildRecord, buildBusy = false, onStartBuild, onRenamed }: { page: WikiPageSummary; revision: number; startEditing?: boolean; fileNameFocusToken?: number; buildRecord?: SourceBuildRecord; buildBusy?: boolean; onStartBuild: (record: SourceBuildRecord, intent?: SourceBuildIntent) => void; onRenamed: (page: WikiPage) => void }) {
  const journeyRecord = buildRecord?.file.buildKind === "dialogue" ? buildRecord : undefined;
  return <DocumentPreview pageId={page.id} revision={revision} startEditing={startEditing} fileNameFocusToken={fileNameFocusToken} onRenamed={onRenamed}
    identityActions={journeyRecord && journeyRecord.batch.channel !== "alipay" ? <SourceBuildAction record={journeyRecord} busy={buildBusy} onStart={onStartBuild} detail /> : undefined}
    beforeContent={journeyRecord ? <SourceJourneyContext file={journeyRecord.file} /> : null}
    afterContent={data => <SourceKnowledgeConnections key={data.id} page={data} />} />;
}

export function OrganizedSources({ revision }: { revision: number }) {
  const { t } = useI18n();
  const demo = useDemoLabels();
  const { data: moveVault } = useApi<VaultInfo>("/api/vault", revision);
  const moveScope = useRef(moveVault?.knowledgeBaseId); moveScope.current = moveVault?.knowledgeBaseId;
  const draggedSource = useRef<{ page: WikiPageSummary; knowledgeBaseId: string } | undefined>(undefined);
  const movingRef = useRef(false);
  const [moving, setMoving] = useState(false);
  const [moveMessage, setMoveMessage] = useState("");
  const [moveChoice, setMoveChoice] = useState<WikiPageSummary>();
  const moveChoiceScope = useRef<string | undefined>(undefined);
  useEffect(() => { setMoveChoice(undefined); draggedSource.current = undefined; setMoveMessage(""); }, [moveVault?.knowledgeBaseId]);
  const [moveDestination, setMoveDestination] = useState("");
  const moveDialog = useRef<HTMLElement>(null);
  useDismissLayer(Boolean(moveChoice), () => setMoveChoice(undefined), { dismissible: !moving, element: moveDialog, priority: 1 });
  useEffect(() => { if (moveChoice) moveDialog.current?.focus(); }, [moveChoice]);
  const [folderRevision, setFolderRevision] = useState(0);
  const { data, loading } = useApi<WikiPageSummary[]>("/api/pages?sources=true", revision + folderRevision);
  const { data: importBatches } = useApi<SourceImportBatch[]>("/api/imports", revision + folderRevision);
  const [folderCreateToken, setFolderCreateToken] = useState(0);
  const [includeChildren, setIncludeChildren] = useState(false);
  const { data: sourceFolders } = useSourceFolders(revision + folderRevision);
  const [params, setParams] = useSearchParams();
  const [creatingSource, setCreatingSource] = useState(false);
  const [createdPageId, setCreatedPageId] = useState<string>();
  const [folderOverride, setFolderOverride] = useState<boolean>();
  const [workspaceWidth, setWorkspaceWidth] = useState(typeof window === "undefined" ? 1060 : window.innerWidth - 320);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const folderPaneOpen = folderOverride ?? workspaceWidth >= 820;
  useLayoutEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWorkspaceWidth(element.clientWidth));
    observer.observe(element); setWorkspaceWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [loading]);
  const [filePaneOpen, setFilePaneOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(params.get("import") === "true");
  useEffect(() => { if (params.get("import") === "true") { setImportOpen(true); const next = new URLSearchParams(params); next.delete("import"); setParams(next, { replace: true }); } }, [params, setParams]);
  const [recentJourney, setRecentJourney] = useState<PaymentJourneySummary>();
  const [recentBatch, setRecentBatch] = useState<SourceImportBatch>();
  const [recentBatchAcknowledged, setRecentBatchAcknowledged] = useState(false);
  const [deletedSourcePaths, setDeletedSourcePaths] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (recentBatch && importBatches?.some((batch) => batch.id === recentBatch.id)) setRecentBatchAcknowledged(true);
  }, [recentBatch?.id, importBatches]);
  useEffect(() => {
    if (!data || !importBatches || !deletedSourcePaths.size) return;
    const stillVisible = new Set([...data.map((page) => page.relativePath), ...importBatches.flatMap((batch) => batch.files.map((file) => file.storedPath))]);
    const pending = new Set([...deletedSourcePaths].filter((path) => stillVisible.has(path)));
    if (pending.size !== deletedSourcePaths.size) setDeletedSourcePaths(pending);
  }, [data, importBatches, deletedSourcePaths]);
  const memoryWindow = useRememberedPreview("source-memory");
  useEffect(() => {
    const staged = readPendingPhotoMemory();
    if (staged && staged.id !== recentBatch?.id) {
      setRecentBatch(staged);
      setRecentBatchAcknowledged(false);
    }
  }, [recentBatch?.id]);
  useEffect(() => {
    const memoryId = params.get("memory");
    if (!memoryId) return;
    const known = mergeSourceBatches(importBatches || [], recentBatch, recentBatchAcknowledged).find((batch) => batch.id === memoryId);
    const record = known && importedMemoryRecord(known);
    if (!record) return;
    memoryWindow.open(memoryRecordKey(record));
    clearPendingPhotoMemory();
    const next = new URLSearchParams(params);
    next.delete("memory");
    setParams(next, { replace: true });
  }, [importBatches, params, recentBatch, recentBatchAcknowledged, setParams]);
  const [busyBuildPath, setBusyBuildPath] = useState<string>();
  const [buildError, setBuildError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "file"; page: WikiPageSummary } | { kind: "folder"; folder: string; count: number }>();
  const [selectedBuildPaths, setSelectedBuildPaths] = useState<Set<string>>(() => new Set());
  const [renameRequest, setRenameRequest] = useState<{ pageId: string; token: number }>();
  const pages = (data || []).filter((page) => !deletedSourcePaths.has(page.relativePath) && page.externalSource?.status !== "unavailable");
  const batches = excludeDeletedSources(mergeSourceBatches(importBatches || [], recentBatch, recentBatchAcknowledged), deletedSourcePaths);
  const buildRecords = sourceBuildRecords(batches);
  const memoryRecord = buildRecords.find((record) => memoryRecordKey(record) === memoryWindow.pageId);
  const pendingBuilds = pendingSourceBuildRecords(batches);
  const memoryCards = pendingMemoryRecords(batches);
  const shownBatch = batches.find((batch) => batch.id === (recentBatch?.id || params.get("batch")));
  const openedMemory = memoryRecord;
  const memoryPage = openedMemory ? pages.find((page) => sourcePagePath(page) === cleanSourcePath(openedMemory.file.storedPath)) : undefined;
  const query = params.get("q") || "";
  const { data: searchResults, loading: searching, error: searchError } = useApi<WikiPageSummary[]>(query.trim() ? `/api/search?sources=true&q=${encodeURIComponent(query.trim())}` : "", revision + folderRevision);
  const matchingIds = new Set((searchResults || []).map(page => page.id));
  const folder = params.get("folder") || "";
  const requestedType = params.get("type") || "all";
  const type = (requestedType === "pending" || sourceRecordTypes.some((item) => item.id === requestedType) ? requestedType : "all") as "all" | SourceRecordType | "pending";
  const month = params.get("month") || "";
  const oldestFirst = params.get("sort") === "oldest";
  const folderCounts = new Map<string, number>();
  for (const page of pages) {
    const parts = sourcePagePath(page).split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const key = parts.slice(0, depth).join("/");
      if (includeChildren || depth === parts.length) folderCounts.set(key, (folderCounts.get(key) || 0) + 1);
    }
  }
  const folderPaths = sourceFolderOptions(sourceFolders, folder);

  const months = sourceMonthOptions(pages);
  const filtered = pages.filter((page) => {
    const sourcePath = sourcePagePath(page);
    return (!folder || (includeChildren ? sourcePath.startsWith(`${folder}/`) : sourcePath.split("/").slice(0, -1).join("/") === folder))
      && (type === "all" ? true : type === "pending" ? Boolean(sourceBuildRecordForPage(page, pendingBuilds)) : sourceRecordType(page) === type)
      && (!month || sourceRecordMonth(page) === month)
      && (!query.trim() || matchingIds.has(page.id));
  }).sort((a, b) => (oldestFirst ? 1 : -1) * (sourceRecordDate(a).getTime() - sourceRecordDate(b).getTime()));
  async function moveFile(targetFolder: string) {
    const payload = draggedSource.current;
    if (!payload || movingRef.current) return;
    if (payload.knowledgeBaseId !== moveScope.current) { setBuildError(t("知识库已切换，请重新选择文件")); return; }
    if (!window.dispatchEvent(new Event("source-file-move-request", { cancelable: true }))) { setBuildError(t("正文或文件名尚未保存，请等待保存完成后再移动")); return; }
    const { page, knowledgeBaseId } = payload;
    movingRef.current = true; setMoving(true); setBuildError(""); setMoveMessage(t("正在移动…"));
    try {
      const moved = await api<WikiPage>("/api/sources/move", { method: "POST", body: JSON.stringify({ pageId: page.id, folder: targetFolder, knowledgeBaseId, expectedModifiedAt: page.modifiedAt }) });
      if (moveScope.current !== knowledgeBaseId) return;
      setMoveChoice(undefined); setCreatedPageId(undefined); setRecentBatch(undefined); setSelectedBuildPaths(new Set());
      setFolderRevision(value => value + 1);
      update({ folder: targetFolder, file: moved.id, q: undefined, month: undefined, type: undefined, limit: undefined, batch: undefined });
      setMoveMessage(t("已移动到「${folder}」", { folder: sourceFolders?.find(item => item.path === targetFolder)?.label || targetFolder.split("/").at(-1) }));
    } catch (reason) { if (moveScope.current === knowledgeBaseId) { setMoveMessage(""); setBuildError(reason instanceof Error ? reason.message : t("移动失败，原文件已保留")); } }
    finally { movingRef.current = false; setMoving(false); draggedSource.current = undefined; }
  }
  const requestedLimit = Number.parseInt(params.get("limit") || "120", 10);
  const visibleLimit = Number.isFinite(requestedLimit) ? Math.max(120, requestedLimit) : 120;
  const visiblePages = filtered.slice(0, visibleLimit);
  const requestedFile = params.get("file") || "";
  const selected = (requestedFile ? pages.find((page) => sourcePageMatchesRequest(page, requestedFile)) : undefined) || filtered[0];
  const selectedBuildRecord = selected ? sourceBuildRecordForPage(selected, buildRecords) : undefined;
  const photoBatch = selectedBuildRecord?.batch.channel === "photos" ? selectedBuildRecord.batch : undefined;
  const filteredPaths = new Set(filtered.map((page) => sourcePagePath(page)));
  const selectableBuildRecords = pendingBuilds.filter(({ file }) => file.buildKind === "direct"
    && ["ready", "deferred"].includes(file.buildStatus || "ready")
    && filteredPaths.has(cleanSourcePath(file.storedPath)));
  const selectableBuildPaths = selectableBuildRecords.map(({ file }) => file.storedPath);
  const selectableBuildKey = selectableBuildPaths.join("\n");
  useEffect(() => {
    if (type !== "pending") return;
    setSelectedBuildPaths(new Set(selectableBuildPaths));
  }, [type, selectableBuildKey]);
  const selectedBuildRecords = selectableBuildRecords.filter(({ file }) => selectedBuildPaths.has(file.storedPath));
  const allSelectableBuildsSelected = selectableBuildRecords.length > 0 && selectedBuildRecords.length === selectableBuildRecords.length;
  const anySelectableBuildsSelected = selectedBuildRecords.length > 0;
  const recentJourneyRecord = useMemo(() => recentBatch?.files.find((file) => file.storedPath === recentJourney?.reportPath && file.buildKind === "dialogue"), [recentBatch, recentJourney?.reportPath]);
  const agentContext = useMemo(() => selectedBuildRecord?.file.buildKind === "dialogue" ? {
    scope: tr("消费旅程"),
    title: selected?.title || sourceBuildTitle(selectedBuildRecord),
    pageId: selected?.id,
    summary: selected?.excerpt || tr("${p0} 条账单线索正在等待你补充真实语境。", { "p0": selectedBuildRecord.file.clueCount || 0 }),
    defaultMode: "read" as const,
    defaultOutputTarget: { kind: "journey-report" as const, importId: selectedBuildRecord.batch.id, storedPath: selectedBuildRecord.file.storedPath, label: tr("消费旅程报告") },
    defaultSourceContext: { importId: selectedBuildRecord.batch.id, storedPath: selectedBuildRecord.file.storedPath, flow: "dialogue" as const, operation: "enrich" as const },
    suggestions: selectedBuildRecord.batch.journey?.clusters.length
      ? [tr("请从「${p0}」开始，一次问我一个关于人物、动机或感受的问题。", { "p0": selectedBuildRecord.batch.journey.clusters[0]!.title }), tr("先从最有画面的一段线索开始，邀请我慢慢讲出来。")]
      : [tr("请从最完整的一条消费线索开始，一次只问我一个开放式问题。"), tr("帮我从这份账单里找到值得继续讲述的一段经历。")],
  } : recentJourney && recentBatch && recentJourneyRecord ? {
    scope: tr("消费旅程"),
    title: recentJourney.title,
    summary: tr("${recentJourney.transactionCount} 笔消费被串成 ${recentJourney.clusters.length} 组旅程线索。", { "recentJourney.transactionCount": recentJourney.transactionCount, "recentJourney.clusters.length": recentJourney.clusters.length }),
    defaultMode: "read" as const,
    defaultOutputTarget: { kind: "journey-report" as const, importId: recentBatch.id, storedPath: recentJourneyRecord.storedPath, label: tr("消费旅程报告") },
    defaultSourceContext: { importId: recentBatch.id, storedPath: recentJourneyRecord.storedPath, flow: "dialogue" as const, operation: "enrich" as const },
    suggestions: [tr("请从「${recentJourney.title}」里最有画面的一段线索开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来。", { "recentJourney.title": recentJourney.title }), tr("先从最有画面的一次出行、聚会或生活变化开始，邀请我慢慢讲出来。")],
  } : {
    scope: tr("生活记录"),
    title: selected?.title || tr("生活记录"),
    pageId: selected?.id,
    summary: selected?.excerpt || tr("当前有 ${pages.length} 份原始记录。", { "pages.length": pages.length }),
    defaultMode: "read" as const,
    suggestions: [tr("这份记录里有哪些还没有真正说清楚、值得我继续补充的地方？"), tr("请概括这份记录，并区分事实、感受和后来的解释。")],
  }, [pages.length, recentBatch, recentJourney, recentJourneyRecord, selected?.excerpt, selected?.id, selected?.title, selectedBuildRecord]);
  if (loading) return <Loading label={t("正在打开生活记录")} />;
  if (!data) return <Empty>{t("生活记录暂时无法读取，请刷新重试。")}</Empty>;
  function update(next: Record<string, string | undefined>) {
    setParams((current) => {
      const value = new URLSearchParams(current);
      for (const [key, entry] of Object.entries(next)) entry ? value.set(key, entry) : value.delete(key);
      return value;
    }, { replace: true });
  }
  function forgetDeletedSources(paths: string[]) {
    const removed = new Set(paths);
    setDeletedSourcePaths((current) => new Set([...current, ...paths]));
    setRecentBatch((batch) => batch ? excludeDeletedSources([batch], removed)[0] : undefined);
    if (recentJourney && removed.has(recentJourney.reportPath)) setRecentJourney(undefined);
    if (memoryRecord && removed.has(memoryRecord.file.storedPath)) memoryWindow.close();
  }
  async function deleteSelectedTarget() {
    if (!deleteTarget) return;
    setCreatedPageId(undefined);
    if (deleteTarget.kind === "file") {
      await api<{ ok: true }>("/api/sources/file", { method: "DELETE", body: JSON.stringify({ pageId: deleteTarget.page.id, expectedModifiedAt: deleteTarget.page.modifiedAt }) });
      forgetDeletedSources([deleteTarget.page.relativePath]);
      update({ file: undefined });
      return;
    }
    await api<{ ok: true }>("/api/sources/folder", { method: "DELETE", body: JSON.stringify({ folder: deleteTarget.folder, expectedFileCount: deleteTarget.count }) });
    const removedPaths = pages.filter((page) => sourcePagePath(page).startsWith(`${deleteTarget.folder}/`)).map((page) => page.relativePath);
    forgetDeletedSources(removedPaths);
    const parentFolder = deleteTarget.folder.split("/").slice(0, -1).join("/");
    update({ q: undefined, type: undefined, month: undefined, folder: parentFolder || undefined, file: undefined, limit: undefined });
  }
  async function updateBuildStatus(record: SourceBuildRecord, status: "deferred") {
    return api<SourceImportBatch>(`/api/imports/${encodeURIComponent(record.batch.id)}/build-status`, { method: "PATCH", body: JSON.stringify({ storedPath: record.file.storedPath, status }) });
  }
  async function beginBuild(record: SourceBuildRecord, intent?: SourceBuildIntent) {
    if (record.batch.channel === "photos" || intent === "open") {
      memoryWindow.open(memoryRecordKey(record));
      const page = pages.find((p) => p.relativePath === record.file.storedPath);
      update({ file: page?.id });
      return;
    }
    if (busyBuildPath) return;
    setBusyBuildPath(record.file.storedPath);
    setBuildError("");
    try {
      const flow = intent === "build" && record.file.buildKind === "identify" ? "direct" : record.file.buildKind!;
      const title = sourceBuildTitle(record);
      const operation = intent || (flow === "dialogue" ? "enrich" : "build");
      const sourceContext = { importId: record.batch.id, storedPath: record.file.storedPath, flow, operation };
      if (flow === "direct" || flow === "dialogue" && operation === "build") {
        openContextAgent({
          mode: "write",
          lockMode: true,
          autoSubmit: true,
          displayPrompt: "构建这份记录",
          prompt: flow === "dialogue"
            ? `请按 build-wiki 的「导入后冷启构建」入口读取消费旅程报告「${record.file.storedPath}」。只把“已确认的消费旅程”中具体、耐久且有证据支持的内容收进真正受到影响的已有理解；候选线索和规范化交易只能用于核对，不得当作用户已经确认的人生事实。保持报告和原始 CSV 不变，完成派生内容与质量门，并清楚说明新增、更新或因证据不足而跳过了什么。`
            : `请按 build-wiki 的「导入后冷启构建」入口读取生活记录「${record.file.storedPath}」，保持原始记录正文不变，把其中具体、耐久且证据充分的内容收进真正受到影响的已有理解；完成该入口要求的派生内容与质量门，并清楚列出新增、更新或因证据不足而跳过了什么。`,
          sourceContext,
          attachedContext: { title, currentUnderstanding: flow === "dialogue" ? tr("消费旅程报告已经经过对话补充，构建时只使用其中已确认的叙述。") : tr("这份记录的叙事和上下文较完整，可以直接进入构建。"), reason: tr("用户已经明确选择把它收进已有理解。") },
        });
      } else if (flow === "dialogue") {
        const firstClue = record.batch.journey?.clusters[0];
        openContextAgent({
          mode: "read",
          autoSubmit: true,
          displayPrompt: record.file.dialogueRunId ? "继续聊聊，丰富旅程" : "从这段旅程开始聊",
          prompt: journeyOverviewConversationPrompt(record.file.storedPath, firstClue),
          outputTarget: { kind: "journey-report", importId: record.batch.id, storedPath: record.file.storedPath, label: tr("消费旅程报告") },
          sourceContext,
          attachedContext: { title, currentUnderstanding: tr("${p0} 条结构化线索只是回忆候选，还不是已确认经历。", { "p0": record.file.clueCount || 0 }), reason: tr("先由用户补上材料本身没有留下的语境；对话只丰富报告，何时构建由用户明确决定。") },
        });
      } else {
        openContextAgent({
          mode: "auto",
          autoSubmit: true,
          displayPrompt: "先帮我看看这是什么",
          prompt: `请读取生活记录「${record.file.storedPath}」。我还不知道它属于哪类材料；先用一句自然的问题请我说明这是什么，不要把无法判类当作错误，也不要在我确认前修改知识库。`,
          sourceContext,
          attachedContext: { title, currentUnderstanding: tr("这份材料的格式或语境不足，暂时无法判类。"), reason: tr("先由用户补上材料本身没有留下的语境，再决定是否构建。") },
        });
      }
    } catch (reason: any) {
      setBuildError(reason.message || tr("暂时无法开始，可以稍后再试"));
    } finally {
      setBusyBuildPath(undefined);
    }
  }
  function beginJourneyDeep(record: SourceBuildRecord, batch: SourceImportBatch, cluster: PaymentJourneyCluster, state: PaymentJourneyClueState) {
    if (state.conversationRunId) {
      openContextAgent({ runId: state.conversationRunId });
      return;
    }
    const sourceContext = { importId: batch.id, storedPath: record.file.storedPath, flow: "dialogue" as const, operation: "enrich" as const };
    openContextAgent({
      mode: "read",
      autoSubmit: true,
      displayPrompt: `围绕「${cluster.title}」展开细聊`,
      prompt: journeyDeepConversationPrompt(record.file.storedPath, cluster),
      outputTarget: { kind: "journey-report", importId: batch.id, storedPath: record.file.storedPath, label: cluster.title, clueId: cluster.id },
      sourceContext,
      attachedContext: { title: cluster.title, currentUnderstanding: cluster.summary, reason: tr("你主动选择展开这条线索；对话只更新消费旅程报告，不会构建 Wiki。") },
    });
  }
  function beginBatchBuild(records: SourceBuildRecord[]) {
    if (busyBuildPath || records.length < 2) return;
    setBuildError("");
    const batch = records[0]!.batch;
    const paths = records.map(({ file }) => file.storedPath);
    const pathList = paths.map((path) => `- ${path}`).join("\n");
    openContextAgent({
      mode: "write",
      lockMode: true,
      autoSubmit: true,
      displayPrompt: `批量构建 ${records.length} 份记录`,
      prompt: `请按 build-wiki 的「导入后冷启构建」入口读取下面选中的 ${records.length} 份 direct 生活记录：\n${pathList}\n\n这些记录可能来自不同导入批次。保持原始记录正文不变，把其中具体、耐久且证据充分的内容收进真正受到影响的已有理解；合并重复判断，完成该入口要求的派生内容与质量门，并清楚列出新增、更新或因证据不足而跳过了什么。`,
      sourceContext: { importId: batch.id, storedPath: records[0]!.file.storedPath, storedPaths: paths, flow: "direct", operation: "build" },
      attachedContext: { title: tr("${records.length} 份语境完整的新记录", { "records.length": records.length }), currentUnderstanding: tr("这些记录可以直接进入构建，但每一条判断仍需保留来源。"), reason: tr("用户已经明确选择批量收进已有理解。") },
    });
  }
  function beginSelectedBuild(records: SourceBuildRecord[]) {
    if (records.length === 1) void beginBuild(records[0]!);
    else beginBatchBuild(records);
  }
  function requestRename(page: WikiPageSummary) {
    setCreatedPageId(undefined);
    setRenameRequest({ pageId: page.id, token: Date.now() });
    update({ file: page.id });
  }
  async function deferBuilds(records: SourceBuildRecord[]) {
    if (busyBuildPath) return;
    setBuildError("");
    try {
      await Promise.all(records.map((record) => updateBuildStatus(record, "deferred")));
      setRecentBatch(undefined);
      update({ batch: undefined });
    } catch (reason: any) {
      setBuildError(reason.message || tr("暂时无法记住这个选择"));
    }
  }
  return <div className="organized-sources-page" ref={workspaceRef}>
    {importOpen ? <ImportMaterialsModal folders={folderPaths.filter(name => !name.startsWith("外部来源/"))} currentFolder={folder.startsWith("外部来源/") ? "" : folder} onClose={() => setImportOpen(false)} onImported={(batch) => { setImportOpen(false); setRecentBatch(batch); setRecentBatchAcknowledged(false); const record = importedMemoryRecord(batch); if (record) memoryWindow.open(memoryRecordKey(record)); setDeletedSourcePaths((current) => new Set([...current].filter((path) => !batch.files.some((file) => file.storedPath === path)))); setCreatedPageId(undefined); update({ q: undefined, type: undefined, month: undefined, folder: importedFolderForBatch(batch) || undefined, file: undefined, limit: undefined, batch: batch.id }); }} onConnected={() => { setImportOpen(false); setFolderRevision((value) => value + 1); setCreatedPageId(undefined); update({ q: undefined, type: undefined, month: undefined, folder: undefined, file: undefined, limit: undefined, batch: undefined }); }} onJourney={setRecentJourney} /> : null}
    {deleteTarget ? <ConfirmDeleteDialog
      title={deleteTarget.kind === "folder" ? t("删除这个文件夹？") : t("删除这份生活记录？")}
      description={deleteTarget.kind === "folder" ? t("文件夹内的记录和所有子文件夹都会一起删除。") : t("文件会从生活记录中永久移除。")}
      itemName={deleteTarget.kind === "folder" ? deleteTarget.folder : documentIdentity(deleteTarget.page.relativePath).fileName}
      impact={deleteTarget.kind === "folder" ? t("其中包含 ${count} 份记录。已有理解不会自动删除，但之后将无法再回到这些原始材料；此操作不能撤销。", { count: deleteTarget.count }) : deleteTarget.page.importChannel === "photos" ? t("这会删除记忆报告并隐藏人物影像关联，但不会删除隐藏目录中保留的原图。") : t("已有理解不会自动删除，但之后将无法再回到这份原始材料；此操作不能撤销。")}
      confirmLabel={deleteTarget.kind === "folder" ? t("删除文件夹") : t("删除文件")}
      onClose={() => setDeleteTarget(undefined)}
      onConfirm={deleteSelectedTarget}
    /> : null}
    {memoryCards.length ? <details className="source-memories-disclosure"><summary>{t("照片与账单记忆 · ${count}", { count: memoryCards.length })}</summary><SourceMemoryCards records={memoryCards} revision={revision} onOpen={(record) => void beginBuild(record, "open")} /></details> : null}
    {openedMemory ? <SourceMemoryDialog title={openedMemory.batch.channel === "photos" ? t("照片记忆") : t("账单记忆")} onClose={memoryWindow.close}>
      {openedMemory.batch.channel === "photos" ? <PhotoMemoryPanel key={openedMemory.batch.id} batch={openedMemory.batch} revision={revision} /> : openedMemory.batch.journey ? <BillMemoryPanel key={openedMemory.batch.id} record={openedMemory} busy={busyBuildPath === openedMemory.file.storedPath} onBuild={(batch) => void beginBuild({ ...openedMemory, batch }, "build")} onDeep={(batch, cluster, state) => beginJourneyDeep(openedMemory, batch, cluster, state)} /> : memoryPage ? <SourcePreview page={memoryPage} revision={revision} fileNameFocusToken={renameRequest?.pageId === memoryPage.id ? renameRequest.token : 0} buildRecord={openedMemory} buildBusy={busyBuildPath === openedMemory.file.storedPath} onStartBuild={beginBuild} onRenamed={(renamed) => { setFolderRevision(value => value + 1); update({ file: renamed.id }); }} /> : <Empty>{t("正在等待记录进入列表，请稍后重新打开。")}</Empty>}
    </SourceMemoryDialog> : null}
    {shownBatch && !["photos", "alipay"].includes(shownBatch.channel || "") ? <ImportedBatchGuide batch={shownBatch} busyPath={busyBuildPath} onStart={beginBuild} onStartAll={beginBatchBuild} onDefer={deferBuilds} /> : null}
    {moveMessage ? <p className="source-move-status" role="status">{moveMessage}</p> : null}
    {buildError ? <p className="source-build-error" role="alert">{tr(buildError)}</p> : null}
    {moveChoice ? createPortal(<div className="desktop-modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !moving) setMoveChoice(undefined); }}><section className="source-move-dialog" ref={moveDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="source-move-title" onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),[role="treeitem"][tabindex="0"]')].filter(node => node.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}><h2 id="source-move-title">{t("移动「${name}」", { name: documentIdentity(moveChoice.externalSource?.originalPath || moveChoice.relativePath).fileName })}</h2><p>{t("选择目标文件夹")}</p><FolderTree selected={moveDestination} onSelect={setMoveDestination} revision={revision + folderRevision} />{buildError ? <p role="alert">{buildError}</p> : null}<footer><button type="button" disabled={moving} onClick={() => setMoveChoice(undefined)}>{t("取消")}</button><button type="button" className="desktop-primary" disabled={moving || !moveDestination || sourcePagePath(moveChoice).split("/").slice(0, -1).join("/") === moveDestination} onClick={() => { if (moveChoiceScope.current) { draggedSource.current = { page: moveChoice, knowledgeBaseId: moveChoiceScope.current }; void moveFile(moveDestination); } }}>{moving ? t("正在移动…") : t("移动到这里")}</button></footer></section></div>, document.body) : null}
    <h1 className="sr-only">{t("生活记录")}</h1>
    <section className="source-discovery-tools" aria-label={t("筛选生活记录")}>
      <div className="source-type-filter" role="group" aria-label={t("按来源类型筛选")}>{[...sourceRecordTypes].sort((a, b) => ["all", "notes", "ai", "photos", "bill"].indexOf(a.id) - ["all", "notes", "ai", "photos", "bill"].indexOf(b.id)).map((item) => <button type="button" key={item.id} className={type === item.id ? "active" : ""} aria-pressed={type === item.id} onClick={() => { setCreatedPageId(undefined); update({ type: item.id === "all" ? undefined : item.id, file: undefined, limit: undefined }); }}><Icon name={item.id === "all" ? "library" : item.id === "notes" ? "journal" : item.id === "ai" ? "message" : item.id === "photos" ? "image" : "receipt"} size={14} />{t(item.id === "notes" ? "笔记" : item.id === "bill" ? "账单" : item.label)}</button>)}{pendingBuilds.length ? <button type="button" className={`source-pending-filter${type === "pending" ? " active" : ""}`} aria-pressed={type === "pending"} onClick={() => { setCreatedPageId(undefined); update({ type: type === "pending" ? undefined : "pending", file: undefined, limit: undefined }); }}><Icon name="spark" size={14} />{t("待构建")} <b>{pendingBuilds.length}</b></button> : null}</div>
      <div className="source-toolbar-right">
      <SearchField className="source-global-search" name="organized-source-search" autoComplete="off" aria-label={t("搜索生活记录标题或内容")} value={query} onChange={(event) => { setCreatedPageId(undefined); update({ q: event.target.value || undefined, file: undefined, limit: undefined }); }} placeholder={t("搜索标题或内容…")} />
      </div>
      <div className="source-toolbar-actions"><div className="source-import-menu"><button type="button" aria-haspopup="dialog" onClick={() => setImportOpen(true)}><Icon name="plus" size={16} />{t("导入资料")}</button></div></div>
    </section>

    <div className={`source-vault${folderPaneOpen ? "" : " folder-pane-collapsed"}${filePaneOpen ? "" : " file-pane-collapsed"}`} aria-label={t("生活记录工作区")}>
      <div className={`source-pane-shell source-folder-shell${folderPaneOpen ? "" : " collapsed"}`}>
        <aside className="source-folder-pane"><PaneShelf label={t("文件夹")} open={folderPaneOpen} onToggle={() => setFolderOverride(!folderPaneOpen)} toggleLabel={t("文件夹栏")} onCreate={() => { setFolderOverride(true); setFolderCreateToken(value => value + 1); }} createLabel={t("新建文件夹")} createDisabled={!folder} />
          <SourceConnectionsPanel onOpened={path => { setFolderRevision(value => value + 1); if (path) { setFolderOverride(true); setCreatedPageId(undefined); update({ folder: path, file: undefined, month: undefined, q: undefined, type: undefined }); } }} />
          <QuietScroll className="source-folder-contents">
            <FolderTree fileDrop={{ accepts: (data, target) => Boolean(data.types.includes("application/x-the-way-here-source") && !movingRef.current && draggedSource.current && draggedSource.current.knowledgeBaseId === moveScope.current && sourcePagePath(draggedSource.current.page).split("/").slice(0, -1).join("/") !== target), drop: (_data, target) => { void moveFile(target); } }} selected={folder} onSelect={path => { setCreatedPageId(undefined); setCreatingSource(false); setRenameRequest(undefined); update({ folder: path || undefined, month: undefined, file: undefined, limit: undefined }); }} counts={folderCounts} total={pages.length} revision={revision + folderRevision} createToken={folderCreateToken} onChanged={() => setFolderRevision(value => value + 1)} />
          </QuietScroll></aside>
      </div>
      <FileBrowserPane label={folder ? demo.folder(sourceFolders?.find(item => item.path === folder)?.label || folder.split("/").at(-1)!) : t("全部记录")} count={String(filtered.length)} open={filePaneOpen} onToggle={() => setFilePaneOpen(value => !value)}
        onCreate={() => { setFilePaneOpen(true); setCreatingSource(true); }} createLabel={t("新建记录")} createDisabled={!folder}
        inlineCreate={creatingSource && <InlineNameForm key={folder} label={t("新建记录")} placeholder={t("记录标题（可稍后修改）")} onCancel={() => setCreatingSource(false)} onCreate={async title => {
          const page = await api<WikiPage>("/api/sources", { method: "POST", body: JSON.stringify({ title, folder }) });
          setCreatingSource(false); setCreatedPageId(page.id); setFolderRevision(value => value + 1);
          update({ q: undefined, type: undefined, month: undefined, file: page.id, limit: undefined });
        }} />}
        headerAction={<SourceListOptions disabled={!sourceFolders?.length} includeChildren={includeChildren} onScope={setIncludeChildren} months={months} month={month} oldestFirst={oldestFirst} total={pages.length}
          onMonth={value => { setCreatedPageId(undefined); update({ month: value || undefined, file: undefined, limit: undefined }); }}
          onOrder={value => { setCreatedPageId(undefined); update({ sort: value ? "oldest" : undefined, limit: undefined }); }}
          onBatchSelect={selectableBuildRecords.length ? () => update({ type: "pending", limit: undefined }) : undefined} />}
        toolbar={<>
            {
            type === "pending" && selectableBuildRecords.length > 0 ? <div className="source-batch-toolbar">
              <label><input type="checkbox" checked={allSelectableBuildsSelected} ref={(node) => { if (node) node.indeterminate = anySelectableBuildsSelected && !allSelectableBuildsSelected; }} onChange={(event) => setSelectedBuildPaths(event.target.checked ? new Set(selectableBuildPaths) : new Set())} />{t("全选可直接构建")} <small>{t("（${count} 份）", { count: selectableBuildRecords.length })}</small></label>
              <button type="button" disabled={!selectedBuildRecords.length || Boolean(busyBuildPath)} onClick={() => beginSelectedBuild(selectedBuildRecords)}><Icon name="build" size={13} />{selectedBuildRecords.length > 1 ? t("批量构建 ${count} 份", { count: selectedBuildRecords.length }) : selectedBuildRecords.length === 1 ? t("构建这份记录") : t("选择记录")}</button>
            </div> : null}</>}>
            {visiblePages.map((page) => {
              const fileName = documentIdentity(page.externalSource?.originalPath || page.relativePath).fileName;
              const recordType = sourceRecordType(page);
              const trackedBuildRecord = sourceBuildRecordForPage(page, buildRecords);
              const buildRecord = trackedBuildRecord || buildableSourceRecordForPage(page, buildRecords);
              const selectable = type === "pending" && selectableBuildRecords.some(({ file }) => file.storedPath === trackedBuildRecord?.file.storedPath);
              if (renameRequest?.pageId === page.id) return <InlineNameForm key={`rename-${page.id}`} label={t("文件名")} placeholder={t("文件名")} initialName={fileName.replace(/\.(md|txt)$/i, "")} onCancel={() => setRenameRequest(undefined)} onCreate={async fileName => {
                const renamed = await api<WikiPage>("/api/pages/rename", { method: "POST", body: JSON.stringify({ pageId: page.id, fileName, expectedModifiedAt: page.modifiedAt }) });
                setRenameRequest(undefined); setFolderRevision(value => value + 1); update({ file: renamed.id });
              }} />;
              return <FileBrowserItem key={page.id} page={page}
                onDragStart={!moving && moveVault && recordType !== "photos" && recordType !== "bill" ? event => {
                  if ((event.target as HTMLElement).closest(".file-menu, input")) { event.preventDefault(); return; }
                  draggedSource.current = { page, knowledgeBaseId: moveVault.knowledgeBaseId };
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-the-way-here-source", page.id);
                } : undefined} onDragEnd={() => { draggedSource.current = undefined; }} active={selected?.id === page.id} onSelect={() => { setCreatedPageId(undefined); setRecentBatch(undefined); update({ file: page.id, batch: undefined }); }}
                selection={selectable && trackedBuildRecord ? <label className="source-batch-check"><input type="checkbox" checked={selectedBuildPaths.has(trackedBuildRecord.file.storedPath)} onChange={(event) => setSelectedBuildPaths((current) => { const next = new Set(current); if (event.target.checked) next.add(trackedBuildRecord.file.storedPath); else next.delete(trackedBuildRecord.file.storedPath); return next; })} /><span className="sr-only">{t("选择构建「${name}」", { name: fileName })}</span></label> : null} actions={<FileMenu page={page} extraActions={[...(moveVault && recordType !== "photos" && recordType !== "bill" ? [{ label: t("移动到…"), onSelect: () => { moveChoiceScope.current = moveVault.knowledgeBaseId; setBuildError(""); setMoveDestination(sourcePagePath(page).split("/").slice(0, -1).join("/")); setMoveChoice(page); } }] : []), { label: t(recordType === "photos" ? "打开照片记忆" : recordType === "bill" && buildRecord?.batch.channel === "alipay" ? "打开账单记忆" : "构建这篇文档"), onSelect: () => void beginBuild(buildRecord, recordType === "photos" || recordType === "bill" && buildRecord?.batch.channel === "alipay" ? "open" : "build") }]} onRename={() => requestRename(page)} onDelete={() => setDeleteTarget({ kind: "file", page })} />} />;
            })}
            {visiblePages.length < filtered.length ? (() => { const moreCount = Math.min(120, filtered.length - visiblePages.length); const [moreBefore, moreAfter] = t("继续显示 ${count} 份", { count: "\u0001" }).split("\u0001"); return <button className="source-file-list-more" onClick={() => update({ limit: String(visibleLimit + 120) })}>{moreBefore}<b>{moreCount}</b>{moreAfter}</button>; })() : null}
            {query.trim() && searching ? <Loading label={t("正在搜索正文")} /> : searchError ? <p role="alert">{searchError}</p> : visiblePages.length === 0 ? <div className="source-list-empty"><b>{t("没有匹配的记录")}</b><p>{!sourceFolders?.length ? t("打开文件夹后，里面的文件会显示在这里") : type === "pending" ? t("新带进来的记录都已经构建完成。") : !query && !month && type === "all" && folder ? t("这个文件夹里还没有文件") : t("换一个来源、月份或搜索词试试。")}</p></div> : null}
      </FileBrowserPane>
      {selected ? <SourcePreview page={selected} revision={revision} startEditing={selected.id === createdPageId} fileNameFocusToken={0} buildRecord={selectedBuildRecord} buildBusy={busyBuildPath === selectedBuildRecord?.file.storedPath} onStartBuild={beginBuild} onRenamed={(renamed) => { setCreatedPageId(undefined); setFolderRevision(value => value + 1); update({ file: renamed.id }); }} /> : <div className="source-preview-empty"><span>{t("选择一个文件")}</span></div>}
    </div>
    <PageAgentContext context={photoBatch ? { scope: tr("照片记忆"), title: photoBatch.files[0]?.originalName || tr("照片记忆"), pageId: selectedBuildRecord?.batch.id === photoBatch.id ? selected?.id : undefined, defaultMode: "read", defaultOutputTarget: { kind: "photo-memory", importId: photoBatch.id, storedPath: photoBatch.files[0]!.storedPath, label: tr("记忆报告"), phase: "enrich" }, suggestions: [tr("我想讲讲这批照片里的故事，一次问我一个具体问题。")], } : agentContext} />
  </div>;
}
