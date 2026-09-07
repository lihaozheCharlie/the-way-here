import { describe, expect, it } from "vitest";
import type { PaymentJourneyCluster } from "@the-way-here/shared";
import { journeyDeepConversationPrompt, journeyOverviewConversationPrompt } from "./journey-conversation";

const cluster = {
  id: "journey-t057",
  kind: "journey",
  title: "8月10日—8月14日 · 北京旅程候选",
  summary: "4 笔记录形成一段连续轨迹。",
  question: "你为何出发、和谁共享了这段时间，哪件小事最值得记住？",
  startDate: "2026-08-10",
  endDate: "2026-08-14",
  entryCount: 4,
  categories: ["出行"],
  evidence: [],
} satisfies PaymentJourneyCluster;

describe("journey conversation prompts", () => {
  it("treats short or negative replies as a boundary instead of another interview angle", () => {
    const prompt = journeyDeepConversationPrompt("sources/消费账单/旅程.md", cluster);
    expect(prompt).toContain("不需要每轮都问");
    expect(prompt).toContain("没什么具体场景");
    expect(prompt).toContain("不要换一个维度继续盘问");
    expect(prompt).toContain("不要擅自补充情绪");
    expect(prompt).not.toContain("再问这个开放式问题");
  });

  it("keeps overview conversations low-pressure and single-threaded", () => {
    const prompt = journeyOverviewConversationPrompt("sources/消费账单/旅程.md", cluster);
    expect(prompt).toContain("不是信息采集表");
    expect(prompt).toContain("不必每轮都提问");
    expect(prompt).toContain("都是完整答案");
  });
});
