import type { WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { EditableDocument } from "../../shared/markdown";
import { apiPageHref } from "../../shared/routing";
import { Empty, Loading } from "../../shared/ui";

export function EditablePageContent({ pageId, revision, startEditing = false, onRenamed }: { pageId: string; revision: number; startEditing?: boolean; onRenamed?: (page: WikiPage) => void }) {
  const { data, loading, error } = useApi<WikiPage>(apiPageHref(pageId), revision);
  if (loading) return <Loading label="正在展开完整内容" />;
  if (error || !data) return <Empty>{error || "完整内容暂时无法读取"}</Empty>;
  return <EditableDocument page={data} variant="preview" startEditing={startEditing} showOutline showIdentity={false} onRenamed={onRenamed} />;
}

export function EmbeddedPagePreview({ page, revision, startEditing = false, onRenamed }: { page: Pick<WikiPageSummary, "id">; revision: number; startEditing?: boolean; onRenamed?: (page: WikiPage) => void }) {
  return <article className="embedded-page" aria-live="polite">
    <EditablePageContent pageId={page.id} revision={revision} startEditing={startEditing} onRenamed={onRenamed} />
  </article>;
}
