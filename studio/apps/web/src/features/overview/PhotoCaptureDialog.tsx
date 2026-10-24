import type { SourceImportBatch } from "@the-way-here/shared";
import { CaptureDialog } from "./CaptureDialogs";
import { BoundPhotoMemory } from "../sources/PhotoMemoryPanel";
export function PhotoCaptureDialog({ batch, knowledgeBaseId, close, completed }: { batch: SourceImportBatch; knowledgeBaseId: string; close: () => void; completed: (title: string, pageId?: string) => void }) {
  return <CaptureDialog title="照片记忆" className="photo-capture-dialog" close={close}><p className="photo-capture-intro">照片已导入，可以随时从历史记录回来继续。</p><BoundPhotoMemory key={`${knowledgeBaseId}:${batch.id}`} batch={batch} knowledgeBaseId={knowledgeBaseId} revision={0} onCompleted={(title, pageId) => { window.dispatchEvent(new CustomEvent("photo-memory-completed", { detail: { knowledgeBaseId, importId: batch.id, title, pageId } })); completed(title, pageId); }} /></CaptureDialog>;
}
