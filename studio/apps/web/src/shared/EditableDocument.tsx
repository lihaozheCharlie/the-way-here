import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { WikiPage } from "@the-way-here/shared";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import { alignDocumentPosition, documentScrollContainer, lineOffset, offsetLine } from "./document-position";
import { documentHeadingPrefix, documentIdentity, editableMarkdownDocument, markdownOutline, markdownWithoutSourceRelations, shouldEnterDocumentEditMode } from "./document-model";
import { DocumentFrame, ReadOnlyDocument } from "./DocumentFrame";
import { NoteProperties, SourceProperties, pageNoteProperties } from "./DocumentProperties";
import { MarkdownBody } from "./MarkdownBody";
import { Icon } from "./ui";
import { TextInput } from "./form-controls";
import { api } from "../api";
import { apiPageHref, pageHref } from "./routing";
import { useDemoLabels, useI18n, tr } from "./i18n";

type SavePageResult = { ok: boolean; modifiedAt?: string };

export function EditableDocument(props: Parameters<typeof EditableDocumentEditor>[0]) {
  if (props.page.externalSource?.status === "unavailable") return <><div className="external-source-notice">{tr("原文件不可用 · 请重新打开文件夹")}{props.page.externalSource.originalPath ? <div>{props.page.externalSource.originalPath}</div> : null}</div><ReadOnlyDocument readOnlyReason={tr("原文件不可用")} page={props.page} id={props.page.id} markdown={props.page.renderedMarkdown} toolbar={props.identityActions} headerContent={props.headerContent} headerActions={props.headerActions} showMetadata={props.showMetadata} showOutline={props.showOutline} relations={props.relations} afterContent={props.afterContent} /></>;
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("detached")) return <ReadOnlyDocument readOnlyReason={tr("独立阅读窗口")} page={props.page} id={props.page.id} markdown={props.page.renderedMarkdown} toolbar={props.identityActions} headerContent={props.headerContent} headerActions={props.headerActions} showMetadata={props.showMetadata} showOutline={props.showOutline} relations={props.relations} afterContent={props.afterContent} />;
  return <EditableDocumentEditor {...props} />;
}

function EditableDocumentEditor({ page, variant = "reader", startEditing = false, showOutline = true, showIdentity = true, showMetadata = true, headerContent, headerActions, identityActions, fileNameFocusToken = 0, beforeContent, afterContent, onRenamed, relations }: { page: WikiPage; variant?: "reader" | "preview"; startEditing?: boolean; showOutline?: boolean; showIdentity?: boolean; showMetadata?: boolean; headerContent?: ReactNode; headerActions?: ReactNode; identityActions?: ReactNode; fileNameFocusToken?: number; beforeContent?: ReactNode; afterContent?: ReactNode; relations?: ReactNode; onRenamed?: (page: WikiPage) => void }) {
  const identity = documentIdentity(page.externalSource?.originalPath || page.relativePath);
  const demo = useDemoLabels();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(page.markdown);
  const [fileName, setFileName] = useState(identity.fileName);
  const [saveState, setSaveState] = useState(tr("已同步"));
  const [saveTone, setSaveTone] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const noteSave = (tone: "idle" | "saved" | "saving" | "error", message: string, params?: Record<string, string | number | null | undefined>) => {
    setSaveTone(tone);
    setSaveState(tr(message, params));
  };
  const [saveNotice, setSaveNotice] = useState<"hidden" | "visible" | "fading">("hidden");
  useEffect(() => {
    if (saveTone !== "saved") { setSaveNotice("hidden"); return; }
    setSaveNotice("visible");
    const fade = window.setTimeout(() => setSaveNotice("fading"), 1400);
    const clear = window.setTimeout(() => setSaveNotice("hidden"), 1600);
    return () => { window.clearTimeout(fade); window.clearTimeout(clear); };
  }, [saveTone]);
  const pageIdRef = useRef(page.id);
  const draftRef = useRef(page.markdown);
  const lastSavedRef = useRef(page.markdown);
  const fileNameRef = useRef(identity.fileName);
  const lastSavedFileNameRef = useRef(identity.fileName);
  const expectedModifiedAtRef = useRef(page.modifiedAt);
  const savingRef = useRef(false);
  const renamingRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const fileNameInputRef = useRef<HTMLInputElement>(null);
  const documentBodyRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<{ line: number; top: number } | null>(null);
  const [activeLine, setActiveLine] = useState(1);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pageIdRef.current === page.id) return;
    pageIdRef.current = page.id;
    draftRef.current = page.markdown;
    lastSavedRef.current = page.markdown;
    expectedModifiedAtRef.current = page.modifiedAt;
    pendingRef.current = null;
    const nextIdentity = documentIdentity(page.externalSource?.originalPath || page.relativePath);
    fileNameRef.current = nextIdentity.fileName;
    lastSavedFileNameRef.current = nextIdentity.fileName;
    setDraft(page.markdown);
    setFileName(nextIdentity.fileName);
    setEditing(startEditing);
    noteSave("idle", "已同步");
  }, [page.id, page.markdown, page.modifiedAt, startEditing]);

  useEffect(() => {
    if (!fileNameFocusToken) return;
    fileNameInputRef.current?.focus();
    fileNameInputRef.current?.select();
  }, [fileNameFocusToken]);

  useEffect(() => {
    if (pageIdRef.current !== page.id || expectedModifiedAtRef.current === page.modifiedAt) return;
    if (draftRef.current !== lastSavedRef.current) {
      noteSave("error", "文件已在别处更新，请退出编辑后刷新");
      return;
    }
    expectedModifiedAtRef.current = page.modifiedAt;
    lastSavedRef.current = page.markdown;
    draftRef.current = page.markdown;
    setDraft(page.markdown);
    noteSave("idle", "已同步");
  }, [page.id, page.markdown, page.modifiedAt]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draftRef.current === lastSavedRef.current && fileNameRef.current === lastSavedFileNameRef.current) return;
      event.preventDefault();
    };
    const beforeMove = (event: Event) => {
      if (draftRef.current !== lastSavedRef.current || fileNameRef.current !== lastSavedFileNameRef.current || savingRef.current || renamingRef.current) event.preventDefault();
    };
    window.addEventListener("source-file-move-request", beforeMove);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("source-file-move-request", beforeMove); };
  }, []);

  useLayoutEffect(() => {
    const position = positionRef.current;
    if (editing && editorRef.current) {
      const editor = editorRef.current;
      editor.focus({ preventScroll: true });
      if (position) {
        const offset = lineOffset(editor.value, position.line);
        editor.setSelectionRange(offset, offset);
        alignDocumentPosition(editor.element, editor.offsetTop(offset), position.top);
      }
    } else if (position && documentBodyRef.current) {
      const blocks = [...documentBodyRef.current.querySelectorAll<HTMLElement>("[data-source-line]")];
      const block = blocks.filter(block => Number(block.dataset.sourceLine) <= position.line).at(-1) || blocks[0];
      if (block) alignDocumentPosition(block, 0, position.top);
    }
    positionRef.current = null;
  }, [editing]);

  async function persist(content: string): Promise<void> {
    pendingRef.current = content;
    if (savingRef.current) return;
    while (renamingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 40));
    savingRef.current = true;
    while (pendingRef.current !== null) {
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next === lastSavedRef.current) continue;
      if (mountedRef.current) noteSave("saving", "正在保存…");
      try {
        const result = await api<SavePageResult>(apiPageHref(pageIdRef.current), {
          method: "PUT",
          body: JSON.stringify({ markdown: next, expectedModifiedAt: expectedModifiedAtRef.current }),
        });
        lastSavedRef.current = next;
        if (result.modifiedAt) expectedModifiedAtRef.current = result.modifiedAt;
        if (mountedRef.current) noteSave(draftRef.current === next ? "saved" : "saving", draftRef.current === next ? "已自动保存" : "正在保存新修改…");
      } catch (reason: any) {
        pendingRef.current = null;
        if (mountedRef.current) noteSave("error", "保存失败：${reason.message}", { "reason.message": reason.message });
      }
    }
    savingRef.current = false;
  }

  async function persistFileName(value: string): Promise<void> {
    const next = value.trim().replace(/\.md$/i, "");
    if (!next) {
      noteSave("error", "文件名不能为空，请输入名称");
      return;
    }
    if (next === lastSavedFileNameRef.current || renamingRef.current) return;
    while (savingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 40));
    renamingRef.current = true;
    if (mountedRef.current) noteSave("saving", "正在重命名…");
    try {
      const renamed = await api<WikiPage>("/api/pages/rename", {
        method: "POST",
        body: JSON.stringify({ pageId: pageIdRef.current, fileName: next, expectedModifiedAt: expectedModifiedAtRef.current }),
      });
      const nextIdentity = documentIdentity(renamed.externalSource?.originalPath || renamed.relativePath);
      pageIdRef.current = renamed.id;
      expectedModifiedAtRef.current = renamed.modifiedAt;
      fileNameRef.current = nextIdentity.fileName;
      lastSavedFileNameRef.current = nextIdentity.fileName;
      if (mountedRef.current) {
        setFileName(nextIdentity.fileName);
        noteSave("saved", "文件名已自动保存");
      }
      if (onRenamed) onRenamed(renamed);
      else window.location.assign(pageHref(renamed.id));
    } catch (reason: any) {
      if (mountedRef.current) noteSave("error", "重命名失败：${reason.message}", { "reason.message": reason.message });
    } finally {
      renamingRef.current = false;
    }
  }

  useEffect(() => {
    if (!editing || draft === lastSavedRef.current) return;
    noteSave("idle", "有未保存更改");
    const timer = window.setTimeout(() => void persist(draft), 800);
    return () => window.clearTimeout(timer);
  }, [draft, editing]);

  useEffect(() => {
    if (fileName === lastSavedFileNameRef.current) return;
    noteSave("idle", "文件名有未保存更改");
    const timer = window.setTimeout(() => void persistFileName(fileName), 1000);
    return () => window.clearTimeout(timer);
  }, [fileName]);

  function changeDraft(value: string) {
    draftRef.current = value;
    setDraft(value);
  }

  function changeDocumentBody(value: string) {
    const { prefix } = editableMarkdownDocument(draftRef.current, page.isSource || showIdentity);
    changeDraft(`${prefix}${value}`);
  }

  function changeFileName(value: string) {
    const next = value.replace(/[\r\n]/g, "");
    fileNameRef.current = next;
    setFileName(next);
  }

  function beginEditing(target?: HTMLElement) {
    if (editing) return;
    const body = documentBodyRef.current;
    const container = body ? documentScrollContainer(body) : null;
    const threshold = (container?.getBoundingClientRect().top || 0) + 24;
    const blocks = [...(body?.querySelectorAll<HTMLElement>("[data-source-line]") || [])];
    const block = target?.closest<HTMLElement>("[data-source-line]") || blocks.find(block => block.getBoundingClientRect().bottom > threshold);
    if (block) {
      const line = Number(block.dataset.sourceLine);
      positionRef.current = { line, top: block.getBoundingClientRect().top };
      setActiveLine(line);
    }
    setEditing(true);
  }

  function finishEditing() {
    const editor = editorRef.current;
    if (editor) {
      let line = offsetLine(editor.value, editor.selectionStart);
      const container = documentScrollContainer(editor.element);
      const viewportTop = (container?.getBoundingClientRect().top || 0) + 24;
      const viewportBottom = container?.getBoundingClientRect().bottom || window.innerHeight;
      const editorTop = editor.getBoundingClientRect().top;
      let top = editorTop + editor.offsetTop(lineOffset(editor.value, line));
      if (top < viewportTop || top > viewportBottom) {
        let low = 1, high = offsetLine(editor.value, editor.value.length);
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (editorTop + editor.offsetTop(lineOffset(editor.value, middle)) <= viewportTop) low = middle;
          else high = middle - 1;
        }
        line = low;
        top = editorTop + editor.offsetTop(lineOffset(editor.value, line));
      }
      positionRef.current = { line, top };
    }
    void persist(draftRef.current);
    setEditing(false);
  }

  function navigateEditor(line: number) {
    const editor = editorRef.current;
    if (!editor) return;
    const start = lineOffset(editor.value, line);
    const next = editor.value.indexOf("\n", start);
    const offset = (next < 0 ? editor.value.length : next) - (editor.value[next - 1] === "\r" ? 1 : 0);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(offset, offset);
    setActiveLine(line);
    const container = documentScrollContainer(editor.element);
    alignDocumentPosition(editor.element, editor.offsetTop(offset), (container?.getBoundingClientRect().top || 0) + (page.isSource && variant === "preview" ? 68 : 24));
  }

  function requestEditing(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const insideControl = Boolean(target.closest("a, button, input, textarea, select, summary, [role='button'], [data-no-edit]"));
    if (shouldEnterDocumentEditMode({ clickCount: event.detail, insideControl })) beginEditing(target);
  }

  const headingPrefix = documentHeadingPrefix(page.id);
  const properties = pageNoteProperties(page);
  const propertiesPinned = true;
  const documentBody = editableMarkdownDocument(draft, page.isSource || showIdentity).body;
  const savedEnglish = draft === page.markdown ? demo.englishDocument(page.relativePath, page.markdown, page.outgoingLinks) : undefined;
  const indexedMarkdown = savedEnglish
    ? editableMarkdownDocument(savedEnglish, page.isSource || showIdentity).body
    : draft === page.markdown
      ? editableMarkdownDocument(page.renderedMarkdown, page.isSource || showIdentity).body
      : documentBody;
  const readingMarkdown = page.isSource ? markdownWithoutSourceRelations(indexedMarkdown) : indexedMarkdown;
  const saveError = saveTone === "error";
  const statusMessage = saveError ? saveState : saveNotice !== "hidden" ? tr("已保存") : saveTone === "saving" ? saveState : "";
  const saveFeedback = <span className={`document-save-state${statusMessage && saveNotice !== "fading" ? " visible" : ""}${saveError ? " error" : ""}`} role="status">{tr(statusMessage)}</span>;
  const propertyPanel = showMetadata && propertiesPinned && Object.keys(properties).length > 0 && <div className="editable-document-properties">{page.isSource && variant === "preview" ? <SourceProperties key={page.id} properties={properties} /> : <NoteProperties properties={properties} compact />}</div>;

  const recordStyle = page.isSource && variant === "preview";
  const savedFileName = lastSavedFileNameRef.current;
  const shownFileName = fileName === savedFileName ? demo.title(fileName) : fileName;
  const recordHeader = recordStyle ? <header className={`record-document-header${editing ? " editing" : ""}`}><div className="record-document-path" title={page.externalSource?.originalPath || page.relativePath}>{identity.folder.split("/").map(part => part.trim()).filter(Boolean).map((part, index) => <React.Fragment key={index}><span>{demo.folder(part)}</span><Icon name="arrow" size={12} /></React.Fragment>)}<b>{shownFileName}{/\.[^./]+$/.exec(page.externalSource?.originalPath || page.relativePath)?.[0] || ""}</b></div><span className={saveError ? "error" : ""} role="status">{statusMessage ? t(statusMessage) : (editing ? t("编辑中 · Esc 完成") : t("修改于 ${date}", { date: new Date(expectedModifiedAtRef.current).toLocaleDateString(locale === "en" ? "en" : "zh-CN", { year: "numeric", month: "long", day: "numeric" }) }))}</span></header> : undefined;
  return <DocumentFrame recordStyle={recordStyle} recordHeader={recordHeader} variant={variant} showIdentity={showIdentity} showOutline={showOutline} relations={relations} onNavigate={editing ? navigateEditor : undefined} activeLine={editing ? activeLine : undefined} markdown={editing ? documentBody : readingMarkdown} headingPrefix={headingPrefix}>

    {showIdentity && <header className="editable-document-identity">
      <div className="document-identity-copy"><label className={`document-file-name${recordStyle ? " record-document-title" : ""}`}><span className="sr-only">{t("文件名")}</span><TextInput ref={fileNameInputRef} name={`file-name-${page.id}`} autoComplete="off" aria-label={`${demo.title(page.title)} ${recordStyle ? t("标题") : t("文件名")}`} style={{ width: `${Math.min(Math.max(shownFileName.length * 1.08 + 2, 12), 37)}em` }} value={shownFileName} onChange={(event) => { const next = event.target.value; const saved = lastSavedFileNameRef.current; changeFileName(next === demo.title(saved) ? saved : next); }} onBlur={() => void persistFileName(fileNameRef.current)} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); changeFileName(lastSavedFileNameRef.current); event.currentTarget.blur(); } }} spellCheck={false} /></label>{showMetadata && !recordStyle && <div className="document-meta-row"><small>{demo.folderPath(identity.folder)}</small><span>· {new Date(page.modifiedAt).toLocaleDateString(locale === "en" ? "en" : "zh-CN")} {tr("更新")}</span>{identityActions}</div>}{recordStyle && identityActions}</div>
      {headerActions && <div className="document-header-actions">{headerActions}</div>}
    </header>}
    {headerContent && <div className="document-header-content">{headerContent}</div>}
    {!recordStyle && statusMessage && <div className="document-save-feedback">{saveFeedback}</div>}{propertyPanel}
    {beforeContent && <div className="document-context-content">{beforeContent}</div>}
    {editing ? <MarkdownEditor editorRef={editorRef} label={tr("${page.title} Markdown 正文", { "page.title": page.title })} value={documentBody} onChange={changeDocumentBody} onSelect={offset => setActiveLine(offsetLine(editorRef.current?.value || "", offset))} onBlur={event => { if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".document-outline-panel")) void persist(draftRef.current); else finishEditing(); }} onKeyDown={event => { if (event.metaKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const headings = markdownOutline(documentBody, headingPrefix); const sections = headings.filter(item => item.level >= 2); const items = sections.length > 1 ? sections : headings; const index = Math.max(0, items.findIndex(item => item.id === (items.filter(item => item.line <= activeLine).at(-1) || items[0])?.id)); const next = items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]; if (next) navigateEditor(next.line); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void persist(draftRef.current); } if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); finishEditing(); } }} /> : <div ref={documentBodyRef} className="editable-document-body editable-document-activate" role="textbox" aria-label={tr("${page.title} 正文，双击后编辑", { "page.title": page.title })} aria-readonly="true" tabIndex={0} onDoubleClick={requestEditing} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); beginEditing(); } }}><MarkdownBody headingPrefix={headingPrefix} properties={propertiesPinned ? undefined : properties}>{readingMarkdown}</MarkdownBody></div>}
    {recordStyle && editing && !markdownOutline(documentBody, headingPrefix).some(item => item.level >= 2) && <p className="record-outline-hint">{tr("输入 ## 添加小标题")}</p>}
    {afterContent && !(page.isSource && editing) && <div className="document-context-content">{afterContent}</div>}
  </DocumentFrame>;
}
