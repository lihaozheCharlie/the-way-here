import { describe, expect, it } from "vitest";
import type { TodayView } from "@the-way-here/shared";
import { selectHomeQuestion } from "./talking-questions";

const empty: TodayView = { currentStages: [], stateSignals: [], focusCandidates: [], conversationPrompts: [], focusPages: [], recentPages: [] };

describe("home question", () => {
  it("asks one cold-start question when nothing has been recorded", () => {
    const question = selectHomeQuestion(empty);
    expect(question.kind).toBe("casual");
    expect(question.question).toContain("小事");
    expect(question.evidenceCount).toBe(0);
  });

  it("prefers one evidence-backed question over the cold start", () => {
    const question = selectHomeQuestion({
      ...empty,
      conversationPrompts: [{
        id: "prompt-1",
        title: "作品",
        question: "作品进入现实之后，你还在证明什么？",
        currentUnderstanding: "此前只做过一次外部贡献。",
        reason: "上次的分享还没有说完。",
        unknown: "这次和上次有什么不同。",
        links: [],
        status: "active",
        weight: 1,
      }],
    });
    expect(question.question).toBe("作品进入现实之后，你还在证明什么？");
    expect(question.kind).toBe("understanding");
  });
});
