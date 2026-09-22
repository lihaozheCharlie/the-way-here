import type { VaultInfo } from "@the-way-here/shared";
import { LifeRecordCapture } from "../overview/LifeRecordCapture";

export function QuickCapture({ vault }: { vault?: VaultInfo }) {
  return <div className="quick-capture">{vault
    ? <LifeRecordCapture key={vault.knowledgeBaseId} knowledgeBaseId={vault.knowledgeBaseId} standalone />
    : <p role="status">正在打开知识库…</p>}</div>;
}
