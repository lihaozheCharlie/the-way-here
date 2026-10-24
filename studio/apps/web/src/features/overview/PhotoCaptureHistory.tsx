import { useState } from "react";
import type { SourceImportBatch } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PhotoCaptureDialog } from "./PhotoCaptureDialog";
export function PhotoCaptureHistory({ knowledgeBaseId, closeHistory }: { knowledgeBaseId: string; closeHistory: () => void }) {
  const { data: batches, error } = useApi<SourceImportBatch[]>(`/api/photo-memories?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`);
  const [batch, setBatch] = useState<SourceImportBatch>();
  return <div className="capture-photo-history">{error && <p role="alert">{error}</p>}{!!batches?.length && <details><summary>照片记忆 · {batches.length} 段</summary>{batches.map(item => <button className="photo-history-item" type="button" key={item.id} onClick={() => setBatch(item)}>{item.files[0]?.originalName || "照片记忆"}<span>{item.fileCount} 张 · 继续整理</span></button>)}</details>}{batch && <PhotoCaptureDialog batch={batch} knowledgeBaseId={knowledgeBaseId} close={() => setBatch(undefined)} completed={() => { setBatch(undefined); closeHistory(); }} />}</div>;
}
