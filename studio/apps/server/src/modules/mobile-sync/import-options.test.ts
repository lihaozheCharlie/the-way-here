import { describe, expect, it } from "vitest";
import { prepareMobileImportRequest } from "./import-options.js";
import { prepareImportBatch } from "../imports/prepare-import.js";

describe("mobile shared import selections", () => {
  const time = "2026-10-01T00:00:00Z";
  it("filters dates and groups and identifies the owner before rendering", () => {
    const files = [{ name: "chat.json", content: JSON.stringify({ conversations: [
      { title: "Friend", messages: [{ sender: "Alice", text: "included", date: "2026-09-10" }, { sender: "Bob", text: "old secret", date: "2025-01-01" }] },
      { title: "Group", isGroup: true, messages: [{ sender: "Alice", text: "group secret", date: "2026-09-10" }] },
    ] }) }];
    const request = prepareMobileImportRequest(files, { importChannel: "other-ai", owner: "Alice", excludeGroups: "true", startDate: "2026-09-01" });
    const batch = prepareImportBatch(files, request.channel!, time, request.importOptions);
    expect(batch.files).toHaveLength(1);
    expect(batch.files[0]!.content).toContain("## 我");
    expect(batch.files[0]!.content).toContain("included");
    expect(batch.files[0]!.content).not.toContain("secret");
  });
  it("rejects invalid options and filters on unstructured text", () => {
    expect(() => prepareMobileImportRequest([], { importChannel: "invented" })).toThrow();
    expect(() => prepareMobileImportRequest([], { startDate: "2026-02-30" })).toThrow();
    expect(() => prepareMobileImportRequest([], { excludeGroups: "yes" })).toThrow();
    expect(() => prepareImportBatch([{ name: "chat.json", content: "{}" }], "other-ai", time, { owner: 7 } as never)).toThrow(/名称/);
    expect(() => prepareImportBatch([{ name: "chat.txt", content: "hello" }], "other-ai", time, { owner: "Alice" })).toThrow(/JSON/);
  });
  it("normalizes WeChat CSV and excludes transactions from every evidence output", () => {
    const files = [{ name: "wechat.csv", content: "微信支付账单明细\n交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号\n2026-09-01 10:00:00,消费,Keep,tea,支出,￥12.00,零钱,支付成功,1\n2026-09-02 10:00:00,消费,Secret,cake,支出,￥23.00,零钱,支付成功,2\n2025-01-01 10:00:00,消费,Old,cake,支出,￥23.00,零钱,支付成功,3" }];
    const request = prepareMobileImportRequest(files, { importChannel: "alipay", excludedMerchants: "Secret", startDate: "2026-09-01" });
    const batch = prepareImportBatch(files, request.channel!, time, request.importOptions);
    expect(batch.journey!.transactionCount).toBe(1);
    expect(batch.files.every(file => !file.content.includes("Secret") && !file.content.includes("Old"))).toBe(true);
  });
  it("computes a recent period and refuses a silent empty import", () => {
    expect(prepareMobileImportRequest([], { recentMonths: "3" }, new Date(time)).importOptions!.startDate).toBe("2026-07-01");
    expect(() => prepareImportBatch([{ name: "chat.json", content: JSON.stringify({ messages: [{ sender: "Me", text: "old", date: "2020-01-01" }] }) }], "other-ai", time, { startDate: "2026-01-01" })).toThrow(/范围/);
  });
});
