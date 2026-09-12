import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { isTerminalRunStatus, type VaultInfo, type WikiRun } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { MemoryWritingAssist } from "./MemoryWritingAssist";
import { openContextAgent } from "../collaboration/model";
import { startMemoryWriting } from "./memory-writing";
import type { PaymentJourneyClueState, PaymentJourneyClueStatus, PaymentJourneyCluster, SourceImportBatch } from "@the-way-here/shared";
import { api } from "../../api";
import { TextArea } from "../../shared/form-controls";
import { Icon } from "../../shared/ui";
import { billEvidencePreview, briefNeedsDeepSuggestion, journeyClueStates, journeyProgress, journeyStatusLabel } from "./bill-memory-model";
import type { SourceBuildRecord } from "./source-model";
import "./bill-memory.css";

type EditMode = "confirm" | "brief";
type UndoNotice = { clusterId: string; title: string; previous: PaymentJourneyClueState; expiresAt: number };

function stateFor(batch: SourceImportBatch, clusterId: string): PaymentJourneyClueState {
  return journeyClueStates(batch.journey!).find((state) => state.clusterId === clusterId)!;
}

function BillEvidenceTooltip({ id, children }: { id: string; children: ReactNode }) {
  return <span id={id} className="bill-clue-evidence-tooltip" role="tooltip">{children}</span>;
}

export function BillEntryCount({ cluster }: { cluster: PaymentJourneyCluster }) {
  const tooltipId = useId();
  const preview = billEvidencePreview(cluster, Math.max(cluster.entryCount, cluster.transactions?.length || 0, cluster.evidence.length));
  const details = preview.rows.map((item) => item.detail).join("\n");
  const label = `${cluster.entryCount} 笔${cluster.confidence === "high" ? " · 高置信" : ""}`;
  return <span
    className={`bill-clue-count${details ? " has-tooltip" : ""}`}
    tabIndex={details ? 0 : undefined}
    aria-label={details ? `${label}，悬停或聚焦查看账单明细` : undefined}
    aria-describedby={details ? tooltipId : undefined}
  >
    {label}
    {details ? <BillEvidenceTooltip id={tooltipId}>{details}</BillEvidenceTooltip> : null}
  </span>;
}

function BillEvidence({ cluster }: { cluster: PaymentJourneyCluster }) {
  const preview = billEvidencePreview(cluster);
  const moreTooltipId = `bill-evidence-${cluster.id}-more`;
  return <div className="bill-clue-evidence">
    <span>账单明细</span>
    <ul>{preview.rows.map((item, index) => {
      const tooltipId = `bill-evidence-${cluster.id}-${index}`;
      return <li key={item.id} className="bill-clue-evidence-row" tabIndex={0} aria-describedby={tooltipId}>
        <span>{item.summary}</span><BillEvidenceTooltip id={tooltipId}>{item.detail}</BillEvidenceTooltip>
      </li>;
    })}
    {preview.omitted ? <li className="bill-clue-evidence-more" tabIndex={preview.omittedDetail ? 0 : undefined} aria-label={`另有 ${preview.omitted} 笔账单未展示`} aria-describedby={preview.omittedDetail ? moreTooltipId : undefined}>
      <span>另有 {preview.omitted} 笔，悬停查看详情</span>{preview.omittedDetail ? <BillEvidenceTooltip id={moreTooltipId}>{preview.omittedDetail}</BillEvidenceTooltip> : null}
    </li> : null}</ul>
  </div>;
}

function BuildConfirmation({ batch, busy, onClose, onConfirm }: { batch: SourceImportBatch; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const journey = batch.journey!;
  const states = new Map(journeyClueStates(journey).map((state) => [state.clusterId, state]));
  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);
  return <div className="bill-build-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} className="bill-build-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><h3 id={titleId}>确认构建这份记录</h3><p>只摄取下面已确认或讲述的内容；跳过的线索继续留在账单证据中。</p></header>
      <div className="bill-build-list">{journey.clusters.map((cluster) => {
        const state = states.get(cluster.id)!;
      return <div key={cluster.id} className={`bill-build-row is-${state.status}`}><i aria-hidden="true" /><span><b>{cluster.title}</b><small>{state.status === "skipped" ? "不会摄取" : state.resultText || cluster.proposedMemory || cluster.summary}</small></span><em>{journeyStatusLabel(state)}</em></div>;
      })}</div>
      <footer><button ref={cancelRef} type="button" disabled={busy} onClick={onClose}>返回继续处理</button><button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? "正在准备…" : "确认构建"}</button></footer>
    </section>
  </div>;
}

export function BillMemoryPanel({ record, busy, onBuild, onDeep }: { record: SourceBuildRecord; busy: boolean; onBuild: (batch: SourceImportBatch) => void; onDeep: (batch: SourceImportBatch, cluster: PaymentJourneyCluster, state: PaymentJourneyClueState) => void }) {
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  const [backgrounds, setBackgrounds] = useState<Record<string, string>>({});
  const [writing, setWriting] = useState<{ clusterId: string; run: WikiRun }>();
  const [starting, setStarting] = useState(false);
  const writingBusy = starting || Boolean(writing);
  const [batch, setBatch] = useState(record.batch);
  const [editing, setEditing] = useState<{ clusterId: string; mode: EditMode }>();
  const [briefs, setBriefs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<UndoNotice>();
  const [seconds, setSeconds] = useState(8);
  const [confirmBuild, setConfirmBuild] = useState(false);
  const buildButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if ((record.batch.journey?.revision || 1) >= (batch.journey?.revision || 1)) setBatch(record.batch);
  }, [record.batch, record.batch.journey?.revision]);
  useEffect(() => {
    if (!undo) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((undo.expiresAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) setUndo(undefined);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [undo]);
  const journey = batch.journey!;
  const states = useMemo(() => new Map(journeyClueStates(journey).map((state) => [state.clusterId, state])), [journey]);
  const progress = journeyProgress(journey);

  useEffect(() => {
    if (!writing) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const run = await api<WikiRun>(`/api/runs/${encodeURIComponent(writing!.run.id)}`);
        if (disposed) return;
        if (isTerminalRunStatus(run.status)) {
          const text = run.result?.finalAnswer?.trim();
          if (run.status === "completed" && text) setBriefs((current) => ({ ...current, [writing!.clusterId]: text }));
          else setError(run.error || "没有生成内容，请重试；原文仍已保留。");
          setWriting(undefined);
        } else timer = setTimeout(poll, 1500);
      } catch (reason: any) {
        if (!disposed) { setError(reason.message); timer = setTimeout(poll, 3000); }
      }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [writing]);

  async function generateBrief(cluster: PaymentJourneyCluster, draft: string) {
    if (!vault || writingBusy || saving) return;
    setStarting(true); setError("");
    try {
      const run = await startMemoryWriting({ knowledgeBaseId: vault.knowledgeBaseId, title: cluster.title, background: backgrounds[cluster.id] || "", draft, context: cluster });
      setWriting({ clusterId: cluster.id, run });
    } catch (reason: any) { setError(reason.message); } finally { setStarting(false); }
  }

  async function save(cluster: PaymentJourneyCluster, status: PaymentJourneyClueStatus, note?: string, showUndo = true) {
    if (saving) return batch;
    const previous = states.get(cluster.id)!;
    setSaving(cluster.id);
    setError("");
    try {
      const updated = await api<SourceImportBatch>(`/api/imports/${encodeURIComponent(batch.id)}/journey-clues/${encodeURIComponent(cluster.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ storedPath: record.file.storedPath, revision: journey.revision || 1, status, note }),
      });
      setBatch(updated);
      setEditing(undefined);
      if (showUndo && status !== "pending" && status !== "deep") setUndo({ clusterId: cluster.id, title: cluster.title, previous, expiresAt: Date.now() + 8_000 });
      return updated;
    } catch (reason: any) {
      setError(reason.message || "线索暂时没有保存，请再试一次");
      return undefined;
    } finally {
      setSaving(undefined);
    }
  }

  async function undoLast() {
    if (!undo) return;
    const cluster = journey.clusters.find((item) => item.id === undo.clusterId);
    if (!cluster) return;
    const notice = undo;
    setUndo(undefined);
    await save(cluster, notice.previous.status, notice.previous.note, false);
  }

  async function startDeep(cluster: PaymentJourneyCluster) {
    const current = states.get(cluster.id)!;
    if (current.status === "deep" && current.conversationRunId) {
      onDeep(batch, cluster, current);
      return;
    }
    const updated = current.status === "deep" ? batch : await save(cluster, "deep", undefined, false);
    if (updated) onDeep(updated, cluster, stateFor(updated, cluster.id));
  }

  function closeBuildConfirmation() {
    setConfirmBuild(false);
    window.requestAnimationFrame(() => buildButtonRef.current?.focus());
  }

  return <section className="bill-memory-wall" aria-labelledby="bill-memory-title">
    <header className="bill-memory-head">
      <div className="bill-memory-title"><h2 id="bill-memory-title">{journey.title}</h2><p>{journey.clusters.length} 条候选线索 · 账单只提供参考证据，不代表已经确认的经历</p></div>
      <div className="bill-memory-progress" aria-label={`已处理 ${progress.total - progress.pending} 条，共 ${progress.total} 条`}>
        <div className="bill-memory-progress-track"><span style={{ transform: `scaleX(${progress.total ? (progress.total - progress.pending) / progress.total : 0})` }} /></div>
        <div className="bill-memory-legend" aria-live="polite"><span className="confirmed">已确认 {progress.confirmed}</span><span className="brief">已简答 {progress.brief}</span><span className="deep">已细聊 {progress.deep}</span><span className="skipped">已跳过 {progress.skipped}</span><span className="pending">待处理 {progress.pending}</span></div>
      </div>
      <div className="bill-memory-build"><button ref={buildButtonRef} type="button" disabled={!progress.canBuild || busy || writingBusy} onClick={() => setConfirmBuild(true)}><Icon name="build" size={14} />{busy ? "正在准备…" : "构建这份记录"}</button><small>{progress.canBuild ? `将摄取 ${progress.included} 条，跳过 ${progress.skipped} 条` : progress.pending ? `还有 ${progress.pending} 条待处理，也可以逐条跳过` : "至少保留一条想收录的线索"}</small></div>
    </header>

    <div className="bill-clue-grid">{journey.clusters.map((cluster) => {
      const state = states.get(cluster.id)!;
      const isEditing = editing?.clusterId === cluster.id;
      const related = cluster.relatedClusterIds?.map((id) => journey.clusters.find((item) => item.id === id)).find(Boolean);
      const note = briefs[cluster.id] ?? state.note ?? "";
      return <article key={cluster.id} className={`bill-clue-card is-${state.status}${isEditing ? " is-open" : ""}`}>
        <header><h3>{cluster.title}</h3><BillEntryCount cluster={cluster} /></header>
        <p className="bill-clue-summary">{cluster.summary}</p>
        <span className={`bill-clue-status is-${state.status}`}><i aria-hidden="true" />{journeyStatusLabel(state)}</span>
        {related ? <p className="bill-clue-related"><Icon name="route" size={13} />可能也和「{related.title}」有关，可分开处理</p> : null}

        {isEditing && editing.mode === "confirm" ? <div className="bill-clue-panel">
          <p>即将收录为：<b>「{cluster.proposedMemory || cluster.summary}」</b></p>
          <BillEvidence cluster={cluster} />
          <footer><button type="button" disabled={Boolean(saving) || writingBusy} onClick={() => setEditing({ clusterId: cluster.id, mode: "brief" })}>不对，简单说说</button><button type="button" className="primary" disabled={Boolean(saving) || writingBusy} onClick={() => void save(cluster, "confirmed")}>{saving === cluster.id ? "正在保存…" : "确认收录"}</button></footer>
        </div> : isEditing && editing.mode === "brief" ? <div className="bill-clue-panel is-brief">
          <BillEvidence cluster={cluster} />
          <MemoryWritingAssist background={backgrounds[cluster.id] || ""} onBackground={(value) => setBackgrounds((current) => ({ ...current, [cluster.id]: value }))} placeholder="补充一两句，比如是怎么开始的、跟谁有关……" disabled={Boolean(saving) || writingBusy || !vault} generating={writing?.clusterId === cluster.id || starting} onGenerate={() => void generateBrief(cluster, note)} />
          <label htmlFor={`bill-brief-${cluster.id}`}>这条记录准备收录的说法</label>
          <TextArea id={`bill-brief-${cluster.id}`} rows={3} value={note} disabled={Boolean(saving) || writingBusy} onChange={(event) => setBriefs((current) => ({ ...current, [cluster.id]: event.target.value }))} placeholder="在这里写一两句，比如是怎么开始的、跟谁有关……" />
          {briefNeedsDeepSuggestion(note) ? <p className="bill-clue-deep-hint"><Icon name="message" size={13} />这段内容已经很丰富，也可以展开细聊；直接提交也会完整保留。</p> : null}
          <footer><button type="button" disabled={Boolean(saving) || writingBusy} onClick={() => setEditing(undefined)}>取消</button><button type="button" className="primary" disabled={Boolean(saving) || writingBusy} onClick={() => void save(cluster, "brief", note)}>{saving === cluster.id ? "正在保存…" : note.trim() ? "提交这句话" : "跳过补充，认这个摘要"}</button></footer>
        </div> : state.status === "pending" ? <div className="bill-clue-actions">
          <button type="button" disabled={Boolean(saving) || writingBusy} onClick={() => setEditing({ clusterId: cluster.id, mode: "confirm" })}>确认为事实</button><button type="button" disabled={Boolean(saving) || writingBusy} onClick={() => setEditing({ clusterId: cluster.id, mode: "brief" })}>简单说说</button><button type="button" className="deep" disabled={Boolean(saving) || writingBusy} onClick={() => void startDeep(cluster)}>展开细聊</button><button type="button" className="skip" disabled={Boolean(saving) || writingBusy} onClick={() => void save(cluster, "skipped")}>暂时不收录</button>
        </div> : <div className="bill-clue-result">
          <button type="button" disabled={Boolean(saving) || writingBusy} onClick={() => state.status === "deep" ? void startDeep(cluster) : state.status === "skipped" ? void save(cluster, "pending", undefined, false) : setEditing({ clusterId: cluster.id, mode: state.status === "brief" ? "brief" : "confirm" })}>
            <span>{state.status === "skipped" ? "这条线索不会进入最终叙述。" : state.resultText || cluster.proposedMemory}</span><small>{state.status === "deep" ? "点击查看或继续完整对话" : state.status === "skipped" ? "点击重新处理" : "点击可重新核对或改用其他方式"}</small>
          </button>
        </div>}
      </article>;
    })}</div>

    {writing ? <p className="bill-writing-progress" role="status">AI 正在起草，完成后会填回当前线索。<button type="button" onClick={() => openContextAgent({ runId: writing.run.id })}>查看进度</button></p> : null}
    {error ? <p className="bill-memory-error" role="alert">{error}</p> : null}
    {undo ? <div className="bill-memory-toast" role="status" aria-live="polite"><span>已保存「{undo.title}」</span><small>{seconds} 秒后关闭</small><button type="button" disabled={Boolean(saving) || writingBusy} onClick={() => void undoLast()}>撤销</button></div> : null}
    {confirmBuild ? <BuildConfirmation batch={batch} busy={busy} onClose={closeBuildConfirmation} onConfirm={() => onBuild(batch)} /> : null}
  </section>;
}
