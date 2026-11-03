import { OutlineGlyph } from "./OutlineGlyph";
import { readPreference, writePreference } from "./preference-storage";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WikiPage } from "@the-way-here/shared";
import { Icon } from "./ui";
import { documentHeadingPrefix, documentIdentity, editableMarkdownDocument, markdownOutline, markdownWithoutSourceRelations } from "./document-model";
import { DocumentOutline } from "./DocumentOutline";
import { NoteProperties, pageNoteProperties } from "./DocumentProperties";
import { MarkdownBody } from "./MarkdownBody";
import { useDemoLabels, useI18n } from "./i18n";

export function DocumentFrame({ showOutline, markdown, headingPrefix, children, relations, onNavigate, activeLine, recordStyle = false, recordHeader, editable = false }: { showOutline: boolean; markdown: string; headingPrefix: string; children: ReactNode; relations?: ReactNode; onNavigate?: (line: number) => void; activeLine?: number; recordStyle?: boolean; recordHeader?: ReactNode; editable?: boolean }) {
  const preferenceKey = recordStyle ? "the-way-here.record-outline-open" : "the-way-here.outline-pinned";
  const [pinned, setPinned] = useState(() => { try { return recordStyle ? readPreference(preferenceKey) !== "false" : readPreference(preferenceKey) === "true"; } catch { return recordStyle; } });
  const hasOutline = markdownOutline(markdown, headingPrefix).some(item => item.level >= 2);
  const frameRef = useRef<HTMLElement>(null);
  const [canDock, setCanDock] = useState(false);
  const [peek, setPeek] = useState(false);
  const outlineControlRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();
  const docked = pinned && canDock;
  const outlineEnabled = Boolean(relations) || showOutline && hasOutline;
  function setOutlinePreference(value: boolean) {
    setPinned(value);
    try { writePreference(preferenceKey, String(value)); } catch { /* Preference is optional. */ }
  }
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setCanDock(frame.clientWidth >= 960);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  function toggleOutline() {
    if (!canDock) {
      setPeek(value => !value);
      return;
    }
    setPeek(false);
    if (frameRef.current?.querySelector(".document-navigation-host")?.contains(document.activeElement)) outlineControlRef.current?.focus({ preventScroll: true });
    setOutlinePreference(!docked);
  }
  const [hintBefore, hintAfter] = t("输入 ## 添加小标题").split("##");
  const label = t(docked ? "收起目录" : "展开目录");
  return <section ref={frameRef} className={`editable-document document-surface${recordStyle ? " source-document" : ""}${outlineEnabled ? " has-outline" : ""}${outlineEnabled && docked ? " outline-pinned" : ""}`} onKeyDown={event => {
    if (event.key === "Escape" && peek) {
      setPeek(false);
      return;
    }
    if (outlineEnabled && (event.metaKey || event.ctrlKey) && event.shiftKey && (event.code === "Backslash" || event.key === "\\" || event.key === "|")) {
      event.preventDefault();
      toggleOutline();
    }
  }}>
    <div className="record-document-main">
      <div className="record-document-toolbar">
        {recordHeader}
        <button ref={outlineControlRef} type="button" className="record-outline-control document-outline-panel" aria-label={label} aria-pressed={outlineEnabled && docked} disabled={!outlineEnabled} title={outlineEnabled ? `${label}  ⌘⇧\\` : t("输入 ## 添加小标题")} onMouseDown={event => { if (onNavigate) event.preventDefault(); }} onClick={toggleOutline}><OutlineGlyph /></button>
      </div>
      <div className="record-document-scroll">
        <div className="document-content">
          {children}
          {editable && showOutline && !hasOutline && <p className="record-outline-hint">{hintBefore}<code>##</code>{hintAfter}</p>}
        </div>
      </div>
    </div>
    <div className="document-navigation-host" inert={!outlineEnabled}>{outlineEnabled && <DocumentOutline key={headingPrefix} markdown={markdown} headingPrefix={headingPrefix} showHeadings={showOutline} relations={relations} onNavigate={onNavigate} activeLine={activeLine} pinned={docked} peek={peek} onDismissPeek={() => setPeek(false)} canDock={canDock} onPin={toggleOutline} />}</div>
  </section>;
}

// Snapshots share the document layout without acquiring file-save behavior.
export function ReadOnlyDocument({ id, markdown, toolbar, page, headerContent, headerActions, showMetadata = true, showOutline = true, relations, afterContent }: { id: string; markdown: string; toolbar?: ReactNode; page?: WikiPage; showMetadata?: boolean; headerContent?: ReactNode; headerActions?: ReactNode; showOutline?: boolean; relations?: ReactNode; readOnlyReason?: string; afterContent?: ReactNode }) {
  const headingPrefix = documentHeadingPrefix(id);
  const demo = useDemoLabels();
  const { t, locale } = useI18n();
  const identity = page ? documentIdentity(page.externalSource?.originalPath || page.relativePath) : undefined;
  const activeDocument = Boolean(page && (markdown === page.renderedMarkdown || markdown === page.markdown));
  const source = page && activeDocument ? demo.englishDocument(page.relativePath, page.markdown, page.outgoingLinks) ?? markdown : markdown;
  const content = page ? editableMarkdownDocument(source, true).body : source;
  const body = page?.isSource ? markdownWithoutSourceRelations(content) : content;
  const recordHeader = page?.isSource && identity ? <header className="record-document-header"><div className="record-document-path" title={demo.path(page.externalSource?.originalPath || page.relativePath)}><span>{demo.folderPath(identity.folder)}</span><Icon name="arrow" size={12} /><b>{demo.file((page.externalSource?.originalPath || page.relativePath).split("/").at(-1) || identity.fileName)}</b></div><span>{t("修改于 ${date}", { date: new Date(page.modifiedAt).toLocaleDateString(locale === "en" ? "en" : "zh-CN", { year: "numeric", month: "long", day: "numeric" }) })}</span></header> : undefined;
  return <DocumentFrame recordHeader={recordHeader} recordStyle={Boolean(page?.isSource)} showOutline={showOutline} relations={relations} markdown={body} headingPrefix={headingPrefix}>
    {page && identity ? <header className="editable-document-identity"><div className="document-identity-copy"><h1 className="document-readonly-title">{demo.title(identity.fileName)}</h1>{showMetadata && <div className="document-meta-row"><span>{demo.folderPath(identity.folder)}</span><span>· {t("${date} 更新", { date: new Date(page.modifiedAt).toLocaleDateString(locale === "en" ? "en" : "zh-CN") })}</span></div>}</div>{headerActions && <div className="document-header-actions">{headerActions}</div>}</header> : null}
    {headerContent && <div className="document-header-content">{headerContent}</div>}
    {toolbar && <div className="editable-document-toolbar">{toolbar}</div>}
    {showMetadata && page && Object.keys(pageNoteProperties(page)).length ? <div className="editable-document-properties"><NoteProperties properties={pageNoteProperties(page)} compact /></div> : null}
    <div className="editable-document-body"><MarkdownBody headingPrefix={headingPrefix}>{body}</MarkdownBody></div>
    {afterContent && <div className="document-context-content">{afterContent}</div>}
  </DocumentFrame>;
}
