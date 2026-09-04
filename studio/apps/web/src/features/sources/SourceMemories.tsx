import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { photoAssetUrl, type PhotoMemory, type VaultInfo } from "@the-way-here/shared";
import { useApi } from "../../api";
import { Icon } from "../../shared/ui";
import { cleanSourcePath, sourceBuildPresentation, type SourceBuildRecord } from "./source-model";
import "./source-memories.css";

function MemoryCard({ record, knowledgeBaseId, revision, onOpen }: { record: SourceBuildRecord; knowledgeBaseId?: string; revision: number; onOpen: () => void }) {
  const { batch, file } = record;
  const photos = batch.channel === "photos";
  const { data: memory } = useApi<PhotoMemory>(photos && knowledgeBaseId ? `/api/photo-memories/${encodeURIComponent(batch.id)}?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}` : "", revision);
  const title = photos ? memory?.title || file.originalName : batch.journey?.title || cleanSourcePath(file.storedPath).split("/").at(-1)?.replace(/\.md$/i, "") || file.originalName;
  const state = sourceBuildPresentation(file);
  const photo = memory?.photos[0];
  return <button type="button" className="source-memory-card" aria-haspopup="dialog" onClick={onOpen}>
    <span className="source-memory-thumbnail">{photo && knowledgeBaseId ? <img src={photoAssetUrl(knowledgeBaseId, batch.id, photo.id)} alt="" loading="lazy" /> : <Icon name={photos ? "image" : "receipt"} size={28} />}</span>
    <span className="source-memory-card-copy"><span className="source-memory-card-meta">{photos ? "照片记忆" : "账单记忆"}<span className={`source-build-chip is-${state.tone}`}>{state.label}</span></span><b>{title}</b><span>{photos ? `${memory?.photos.length ?? batch.fileCount} 张照片` : batch.journey ? `${batch.journey.transactionCount} 笔消费 · ${batch.journey.clusters.length} 组线索` : "补充账单背后的故事"}</span></span>
    <Icon name="arrow" size={16} />
  </button>;
}

export function SourceMemoryCards({ records, revision, onOpen }: { records: SourceBuildRecord[]; revision: number; onOpen: (record: SourceBuildRecord) => void }) {
  const { data: vault } = useApi<VaultInfo>(records.length ? "/api/vault" : "", revision);
  if (!records.length) return null;
  return <section className="source-memory-inbox" aria-label="待完成的记忆"><header><h2>待完成的记忆</h2><span>{records.length} 份 · 点开继续整理</span></header><div className="source-memory-cards">{records.map((record) => <MemoryCard key={`${record.batch.id}:${record.file.storedPath}`} record={record} knowledgeBaseId={vault?.knowledgeBaseId} revision={revision} onOpen={() => onOpen(record)} />)}</div></section>;
}

export function SourceMemoryDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    // A deliberate conversation action hands focus to the Agent without stacking modals.
    const handoff = () => closeRef.current();
    window.addEventListener("open-context-agent", handoff);
    return () => {
      window.removeEventListener("open-context-agent", handoff);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialogRef} className="source-memory-dialog organized-sources-page" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="source-memory-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={`关闭${title}`} onClick={onClose}><Icon name="close" size={20} /></button></header>
    <div className="source-memory-dialog-body">{children}</div>
  </dialog>, document.body);
}
