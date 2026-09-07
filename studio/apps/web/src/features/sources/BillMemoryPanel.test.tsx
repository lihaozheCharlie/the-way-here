import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PaymentJourneyCluster } from "@the-way-here/shared";
import { BillEntryCount } from "./BillMemoryPanel";

function cluster(): PaymentJourneyCluster {
  return {
    id: "routine",
    kind: "routine",
    title: "午间习惯",
    summary: "两笔午间消费",
    question: "说说看",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    entryCount: 2,
    categories: ["餐饮"],
    evidence: [],
    confidence: "high",
    transactions: [1, 2].map((day) => ({
      id: `T00${day}`,
      createdAt: `2026-08-0${day} 12:00:00`,
      merchant: `交易对方 ${day}`,
      product: `商品详情 ${day}`,
      amount: day,
      direction: "支出",
      status: "交易成功",
      refund: 0,
      category: "餐饮",
    })),
  };
}

describe("BillEntryCount", () => {
  it("reuses the bill detail tooltip to expose every transaction on hover or focus", () => {
    const html = renderToStaticMarkup(<BillEntryCount cluster={cluster()} />);
    expect(html).toContain("2 笔 · 高置信");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("交易对方 1");
    expect(html).toContain("交易对方 2");
    expect(html).toContain("悬停或聚焦查看账单明细");
  });

  it("keeps the count non-interactive when no concrete evidence is available", () => {
    const item = cluster();
    item.transactions = [];
    const html = renderToStaticMarkup(<BillEntryCount cluster={item} />);
    expect(html).toContain("2 笔 · 高置信");
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain('role="tooltip"');
  });
});
