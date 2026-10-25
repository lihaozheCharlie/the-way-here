import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { photoAssetUrl, type PhotoMemory, type VaultInfo } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { useDemoJsonText, useI18n } from "../../shared/i18n";
import { Icon } from "../../shared/ui";
import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { cleanSourcePath, sourceBuildPresentation, type SourceBuildRecord } from "./source-model";
import "./source-memories.css";

function MemoryCard({ record, knowledgeBaseId, revision, onOpen }: { record: SourceBuildRecord; knowledgeBaseId?: string; revision: number; onOpen: () => void }) {
  const { batch, file } = record;
  const photos = batch.channel === "photos";
  const { t } = useI18n();
  const { data: memory } = useApi<PhotoMemory>(photos && knowledgeBaseId ? `/api/photo-memories/${encodeURIComponent(batch.id)}?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}` : "", revision);
  const demoText = useDemoJsonText();
  const title = photos ? (memory ? demoText(`sources/.photo-memories/${memory.id}/memory.json`, "$.title", memory.title) : file.originalName) : batch.journey?.title || cleanSourcePath(file.storedPath).split("/").at(-1)?.replace(/\.md$/i, "") || file.originalName;
  const state = sourceBuildPresentation(file);
  const photo = memory?.photos[0];
  return <button type="button" className="source-memory-card" aria-haspopup="dialog" onClick={onOpen}>
    <span className="source-memory-thumbnail">{photo && knowledgeBaseId ? <img src={photoAssetUrl(knowledgeBaseId, batch.id, photo.id)} alt="" loading="lazy" /> : <Icon name={photos ? "image" : "receipt"} size={28} />}</span>
    <span className="source-memory-card-copy"><span className="source-memory-card-meta">{photos ? t("照片记忆") : t("账单记忆")}<span className={`source-build-chip is-${state.tone}`}>{t(state.label)}</span></span><b>{title}</b><span>{photos ? t("${count} 张照片", { count: memory?.photos.length ?? batch.fileCount }) : batch.journey ? t("${count} 笔消费 · ${groups} 组线索", { count: batch.journey.transactionCount, groups: batch.journey.clusters.length }) : t("补充账单背后的故事")}</span></span>
    <Icon name="arrow" size={16} />
  </button>;
}

export function SourceMemoryCards({ records, revision, onOpen }: { records: SourceBuildRecord[]; revision: number; onOpen: (record: SourceBuildRecord) => void }) {
  const { t } = useI18n();
  const { data: vault } = useApi<VaultInfo>(records.length ? "/api/vault" : "", revision);
  if (!records.length) return null;
  return <section className="source-memory-inbox" aria-label={t("待完成的记忆")}><header><h2>{t("待完成的记忆")}</h2><span>{t("${count} 份 · 点开继续整理", { count: records.length })}</span></header><div className="source-memory-cards">{records.map((record) => <MemoryCard key={`${record.batch.id}:${record.file.storedPath}`} record={record} knowledgeBaseId={vault?.knowledgeBaseId} revision={revision} onOpen={() => onOpen(record)} />)}</div></section>;
}

export function SourceMemoryDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useDismissLayer(true, onClose, { priority: 2, element: dialogRef, outside: true });
  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.show();
    document.body.style.overflow = "hidden";
    // A deliberate conversation action hands focus to the Agent without stacking modals.
    const handoff = () => closeRef.current();
    window.addEventListener("open-context-agent", handoff);
    return () => {
      window.removeEventListener("open-context-agent", handoff);
      const restoreFocus = dialog.contains(document.activeElement);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected && restoreFocus) opener.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialogRef} className="source-memory-dialog organized-sources-page" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="source-memory-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={t("关闭${title}", { title })} onClick={onClose}><Icon name="close" size={20} /></button></header>
    <div className="source-memory-dialog-body">{children}</div>
  </dialog>, document.body);
}
