import type { WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { DocumentPreview } from "../../shared/DocumentPreview";

export function EmbeddedPagePreview({ page, revision, startEditing = false, onRenamed }: { page: Pick<WikiPageSummary, "id">; revision: number; startEditing?: boolean; onRenamed?: (page: WikiPage) => void }) {
  return <div className="embedded-page"><DocumentPreview pageId={page.id} revision={revision} startEditing={startEditing} showIdentity={false} onRenamed={onRenamed} /></div>;
}
