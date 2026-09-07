import { describe, expect, it } from "vitest";
import type { PaymentJourneySummary } from "@the-way-here/shared";
import { billEvidencePreview, briefNeedsDeepSuggestion, journeyClueStates, journeyProgress } from "./bill-memory-model";

function journey(states: PaymentJourneySummary["clueStates"]): PaymentJourneySummary {
  return {
    provider: "alipay", title: "账单记忆", reportPath: "sources/账单.md", period: { start: "2026-05-01", end: "2026-05-31" }, transactionCount: 8, activeDays: 6, netExpense: 128, refundCount: 0, agentPrompt: "", revision: 1,
    clusters: ["a", "b", "c"].map((id) => ({ id, kind: "routine", title: id, summary: `${id} 摘要`, question: "说说看", startDate: "2026-05-01", endDate: "2026-05-02", entryCount: 2, categories: ["餐饮"], evidence: [], proposedMemory: `${id} 事实`, confidence: "medium" })),
    clueStates: states,
  };
}

describe("bill memory clue wall", () => {
  it("fills legacy missing states and only builds after every clue has a destination", () => {
    expect(journeyClueStates(journey([{ clusterId: "a", status: "confirmed" }])).map((state) => state.status)).toEqual(["confirmed", "pending", "pending"]);
    expect(journeyProgress(journey([{ clusterId: "a", status: "confirmed" }, { clusterId: "b", status: "brief" }, { clusterId: "c", status: "skipped" }]))).toMatchObject({ pending: 0, included: 2, skipped: 1, canBuild: true });
    expect(journeyProgress(journey([{ clusterId: "a", status: "skipped" }, { clusterId: "b", status: "skipped" }, { clusterId: "c", status: "skipped" }])).canBuild).toBe(false);
    expect(journeyProgress(journey([{ clusterId: "a", status: "confirmed" }, { clusterId: "b", status: "deep" }, { clusterId: "c", status: "skipped" }]))).toMatchObject({ pending: 1, deep: 0, canBuild: false });
    expect(journeyProgress(journey([{ clusterId: "a", status: "confirmed" }, { clusterId: "b", status: "deep", conversationTurns: 1 }, { clusterId: "c", status: "skipped" }]))).toMatchObject({ pending: 0, deep: 1, canBuild: true });
  });

  it("suggests deep chat for a long or multi-part brief without blocking submission", () => {
    expect(briefNeedsDeepSuggestion("一句简单补充")).toBe(false);
    expect(briefNeedsDeepSuggestion("第一件事。第二件事。第三件事。第四件事。" )).toBe(true);
    expect(briefNeedsDeepSuggestion("很长的一段话".repeat(25))).toBe(true);
  });

  it("shows at most three concrete transactions and retains complete hover details", () => {
    const cluster = journey([]).clusters[0]!;
    cluster.entryCount = 5;
    cluster.transactions = Array.from({ length: 5 }, (_, index) => ({
      id: `T00${index + 1}`,
      createdAt: `2026-05-0${index + 1} 12:0${index}:00`,
      merchant: `交易对方 ${index + 1}`,
      product: `商品详情 ${index + 1}`,
      amount: index + 1,
      direction: "支出",
      status: "交易成功",
      refund: index === 3 ? 1 : 0,
      category: "餐饮",
    }));
    const preview = billEvidencePreview(cluster);
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]?.summary).toContain("交易对方 1 · 商品详情 1 · 支出 1.00 元");
    expect(preview.omitted).toBe(2);
    expect(preview.omittedDetail).toContain("交易对方 4");
    expect(preview.omittedDetail).toContain("成功退款 1.00 元");
  });

  it("keeps legacy evidence readable while limiting it to three rows", () => {
    const cluster = journey([]).clusters[0]!;
    cluster.entryCount = 5;
    cluster.evidence = ["第一笔", "第二笔", "第三笔", "第四笔", "第五笔"];
    expect(billEvidencePreview(cluster)).toMatchObject({ rows: [{ summary: "第一笔" }, { summary: "第二笔" }, { summary: "第三笔" }], omitted: 2, omittedDetail: "第四笔\n第五笔" });
  });
});
