import { useEffect, useState, type ReactNode } from "react";
import type { WikiPage } from "@the-way-here/shared";
import { Icon } from "./ui";
import { documentHeadingPrefix, documentIdentity, editableMarkdownDocument, markdownOutline, markdownWithoutSourceRelations } from "./document-model";
import { DocumentOutline } from "./DocumentOutline";
import { NoteProperties, pageNoteProperties } from "./DocumentProperties";
import { MarkdownBody } from "./MarkdownBody";
import { useDemoLabels, useI18n } from "./i18n";

export function DocumentFrame({ variant, showIdentity = false, showOutline, markdown, headingPrefix, children, relations, onNavigate, activeLine, readOnly = false, recordStyle = false, recordHeader }: { variant: "reader" | "preview"; showIdentity?: boolean; showOutline: boolean; markdown: string; headingPrefix: string; children: ReactNode; relations?: ReactNode; onNavigate?: (line: number) => void; activeLine?: number; readOnly?: boolean; recordStyle?: boolean; recordHeader?: ReactNode }) {
  const preferenceKey = recordStyle ? "the-way-here.record-outline-open" : "the-way-here.outline-pinned";
  const [pinned, setPinned] = useState(() => { try { return recordStyle ? localStorage.getItem(preferenceKey) !== "false" : localStorage.getItem(preferenceKey) === "true"; } catch { return recordStyle; } });
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.innerWidth < 980);
  const hasOutline = recordStyle ? markdownOutline(markdown, headingPrefix).some(item => item.level >= 2) : markdownOutline(markdown, headingPrefix).length > 1;
  const navigationRelations = recordStyle ? undefined : relations;
  const auxiliaryVisible = Boolean(navigationRelations) || showOutline && hasOutline;
  useEffect(() => { const resize = () => setCompact(window.innerWidth < 980); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  return <section className={`editable-document document-surface${recordStyle ? " life-record-document" : ""} editable-document--${variant}${showIdentity ? "" : " knowledge-document"}${auxiliaryVisible ? " has-outline" : ""}${pinned && (!compact || recordStyle) && auxiliaryVisible ? " outline-pinned" : ""}${compact ? " document-compact" : ""}`}>
    {recordHeader}
    <div className="document-content">{children}</div>
    {auxiliaryVisible && <div className="document-navigation-host"><DocumentOutline markdown={markdown} headingPrefix={headingPrefix} recordStyle={recordStyle} onNavigate={onNavigate} activeLine={activeLine} pinned={pinned && (!compact || recordStyle)} compact={compact} readOnly={readOnly} relations={navigationRelations} onPin={() => { setPinned(value => { try { localStorage.setItem(preferenceKey, String(!value)); } catch { /* Preference is optional. */ } return !value; }); }} /></div>}
  </section>;
}

// Snapshots share the document layout without acquiring file-save behavior.
export function ReadOnlyDocument({ id, markdown, toolbar, page, headerContent, headerActions, showMetadata = true, showOutline = true, relations, afterContent }: { id: string; markdown: string; toolbar?: ReactNode; page?: WikiPage; showMetadata?: boolean; headerContent?: ReactNode; headerActions?: ReactNode; showOutline?: boolean; relations?: ReactNode; readOnlyReason?: string; afterContent?: ReactNode }) {
  const headingPrefix = documentHeadingPrefix(id);
  const demo = useDemoLabels();
  const { t, locale } = useI18n();
  const identity = page ? documentIdentity(page.externalSource?.originalPath || page.relativePath) : undefined;
  const content = page ? editableMarkdownDocument(markdown, true).body : markdown;
  const body = page?.isSource ? markdownWithoutSourceRelations(content) : content;
  const recordHeader = page?.isSource && identity ? <header className="record-document-header"><div className="record-document-path" title={page.externalSource?.originalPath || page.relativePath}><span>{demo.folderPath(identity.folder)}</span><Icon name="arrow" size={12} /><b>{demo.file((page.externalSource?.originalPath || page.relativePath).split("/").at(-1) || identity.fileName)}</b></div><span>{t("修改于 ${date}", { date: new Date(page.modifiedAt).toLocaleDateString(locale === "en" ? "en" : "zh-CN", { year: "numeric", month: "long", day: "numeric" }) })}</span></header> : undefined;
  return <DocumentFrame readOnly recordHeader={recordHeader} recordStyle={Boolean(page?.isSource)} variant="preview" showIdentity={Boolean(page)} showOutline={showOutline} relations={relations} markdown={body} headingPrefix={headingPrefix}>
    {page && identity ? <header className="editable-document-identity"><div className="document-identity-copy"><h1 className="document-readonly-title">{demo.title(identity.fileName)}</h1>{showMetadata && <div className="document-meta-row"><span>{demo.folderPath(identity.folder)}</span><span>· {t("${date} 更新", { date: new Date(page.modifiedAt).toLocaleDateString(locale === "en" ? "en" : "zh-CN") })}</span></div>}</div>{headerActions && <div className="document-header-actions">{headerActions}</div>}</header> : null}
    {headerContent && <div className="document-header-content">{headerContent}</div>}
    {toolbar && <div className="editable-document-toolbar">{toolbar}</div>}
    {showMetadata && page && Object.keys(pageNoteProperties(page)).length ? <div className="editable-document-properties"><NoteProperties properties={pageNoteProperties(page)} compact /></div> : null}
    <div className="editable-document-body"><MarkdownBody headingPrefix={headingPrefix}>{body}</MarkdownBody></div>
    {afterContent && <div className="document-context-content">{afterContent}</div>}
  </DocumentFrame>;
}
