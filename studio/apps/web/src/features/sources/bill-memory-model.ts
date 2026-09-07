import type { PaymentJourneyClueState, PaymentJourneyCluster, PaymentJourneySummary, PaymentJourneyTransactionEvidence } from "@the-way-here/shared";

export type BillEvidenceRow = { id: string; summary: string; detail: string };

function displayTransactionDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  return match ? `${Number(match[2])}月${Number(match[3])}日 ${match[4]}:${match[5]}` : value;
}

function transactionText(transaction: PaymentJourneyTransactionEvidence): BillEvidenceRow {
  const date = displayTransactionDate(transaction.createdAt);
  const amount = `${transaction.amount.toFixed(2)} 元`;
  const payment = transaction.direction ? `${transaction.direction} ${amount}` : amount;
  const refund = transaction.refund > 0 ? ` · 成功退款 ${transaction.refund.toFixed(2)} 元` : "";
  return {
    id: transaction.id,
    summary: `${date} · ${transaction.merchant} · ${transaction.product} · ${payment}`,
    detail: `${date} · ${transaction.merchant} · ${transaction.product} · ${transaction.category} · ${payment} · ${transaction.status}${refund}`,
  };
}

export function billEvidencePreview(cluster: PaymentJourneyCluster, limit = 3): { rows: BillEvidenceRow[]; omitted: number; omittedDetail: string } {
  const transactions = cluster.transactions || [];
  if (transactions.length) {
    const evidence = transactions.map(transactionText);
    return {
      rows: evidence.slice(0, limit),
      omitted: Math.max(0, evidence.length - limit),
      omittedDetail: evidence.slice(limit).map((item) => item.detail).join("\n"),
    };
  }
  const evidence = cluster.evidence.map((detail, index) => ({ id: `${cluster.id}-${index}`, summary: detail, detail }));
  return {
    rows: evidence.slice(0, limit),
    omitted: Math.max(0, cluster.entryCount - Math.min(limit, evidence.length)),
    omittedDetail: evidence.slice(limit).map((item) => item.detail).join("\n"),
  };
}

export function journeyClueStates(journey: PaymentJourneySummary): PaymentJourneyClueState[] {
  const states = new Map((journey.clueStates || []).map((state) => [state.clusterId, state]));
  return journey.clusters.map((cluster) => states.get(cluster.id) || { clusterId: cluster.id, status: "pending" });
}

export function journeyProgress(journey: PaymentJourneySummary) {
  const states = journeyClueStates(journey);
  const count = (status: PaymentJourneyClueState["status"]) => states.filter((state) => state.status === status).length;
  const completedDeep = states.filter((state) => state.status === "deep" && Boolean(state.conversationTurns)).length;
  const pending = count("pending") + count("deep") - completedDeep;
  const included = count("confirmed") + count("brief") + completedDeep;
  return { total: states.length, pending, confirmed: count("confirmed"), brief: count("brief"), deep: completedDeep, skipped: count("skipped"), included, canBuild: states.length > 0 && pending === 0 && included > 0 };
}

export function briefNeedsDeepSuggestion(value: string): boolean {
  const normalized = value.trim();
  return normalized.length >= 120 || normalized.split(/[。！？!?\n]+/).filter(Boolean).length >= 4;
}

export function journeyStatusLabel(state: PaymentJourneyClueState): string {
  if (state.status === "confirmed") return "已确认为事实";
  if (state.status === "brief") return "已简单说说";
  if (state.status === "deep") return state.conversationTurns ? `已细聊 · ${state.conversationTurns} 轮` : "正在细聊";
  if (state.status === "skipped") return "已跳过";
  return "待处理";
}
