import type { ReactNode } from "react";
import type { WikiPage } from "@the-way-here/shared";
import { useApi } from "./use-api";
import { apiPageHref } from "./routing";
import { EditableDocument, ReadOnlyDocument } from "./markdown";
import { Empty, Loading } from "./ui";

export function DocumentPreview({ pageId, revision, startEditing, fileNameFocusToken, onRenamed, controls, headerActions, showMetadata = true, snapshot, identityActions, beforeContent, afterContent, footer }: {
  pageId: string; revision: number; startEditing?: boolean; fileNameFocusToken?: number; onRenamed?: (page: WikiPage) => void;
  controls?: ReactNode; headerActions?: ReactNode; showMetadata?: boolean; snapshot?: { id: string; markdown: string }; footer?: ReactNode;
  identityActions?: ReactNode; beforeContent?: ReactNode; afterContent?: (page: WikiPage) => ReactNode;
}) {
  const { data, loading, error } = useApi<WikiPage>(apiPageHref(pageId), revision);
  return <article className="source-preview" aria-live="polite">
    {loading ? <Loading label="正在展开正文" /> : error || !data ? <Empty>{error || "正文暂时无法读取"}</Empty> : snapshot ?
      <ReadOnlyDocument page={data} id={snapshot.id} markdown={snapshot.markdown} headerContent={controls} headerActions={headerActions} showMetadata={showMetadata} /> : data.importChannel === "photos" ?
      <><ReadOnlyDocument id={data.id} markdown={data.renderedMarkdown || data.markdown} toolbar={<span>通过“打开照片记忆”修改人物和讲述</span>} />{afterContent?.(data)}</> :
      <EditableDocument key={data.id} page={data} variant="preview" showOutline startEditing={startEditing} fileNameFocusToken={fileNameFocusToken} onRenamed={onRenamed} headerContent={controls} headerActions={headerActions} showMetadata={showMetadata} identityActions={identityActions} beforeContent={beforeContent} afterContent={afterContent?.(data)} />}
    {footer}
  </article>;
}
