import { expect, test } from "vitest";
import { parseDreamDraft, parseDreamReview } from "./dream-workflow.js";

const corpus = { pages: [{ pageId: "record", markdown: "# 记录\n\n第一条正文。\n第二条正文。\n" }] };
const cite = { pageId: "record", line: 3, quote: "第一条正文。" };
const finding = { text: "核对说明。", verdict: "partial", evidence: [cite] };

test("review keeps the first entries when the model writes past a display cap", () => {
  const review = parseDreamReview({
    summary: "总结。",
    actualPath: { text: "现实路径。", verdict: "unknown", evidence: [] },
    reviews: [{ branchId: "a", claims: [finding, finding, finding, finding, finding, finding, finding] }],
    actualTimeline: Array.from({ length: 11 }, (_, i) => ({ date: "2020-03-0" + (1 + (i % 9)), finding })),
    comparison: Array.from({ length: 7 }, () => ({ dimension: "维度", actual: "现实",
      branches: [{ id: "a", text: "结果", claimIndex: 1 }] })),
    takeaways: ["一", "二", "三", "四"],
  }, corpus, [{ id: "a", count: 5 }]);
  expect(review.reviews[0]!.claims).toHaveLength(5);
  expect(review.actualTimeline).toHaveLength(8);
  expect(review.comparison).toHaveLength(6);
  expect(review.takeaways).toEqual(["一", "二", "三"]);
});

test("structural review requirements stay strict", () => {
  expect(() => parseDreamReview({
    summary: "总结。",
    actualPath: { text: "现实路径。", verdict: "unknown", evidence: [] },
    reviews: [{ branchId: "a", claims: [finding] }],
  }, corpus, [{ id: "a", count: 5 }])).toThrow("逐条覆盖");
});

test("draft timelines and gaps are capped instead of rejected", () => {
  const draft = parseDreamDraft({
    outcome: "如果提交申请。",
    timeline: Array.from({ length: 7 }, () => ({ horizon: "一周内", possibility: "一个场景。", condition: "", basis: [cite] })),
    gaps: Array.from({ length: 8 }, (_, i) => "缺口" + i),
  }, corpus, "2020-03-01", "2020-06-01");
  expect(draft.timeline).toHaveLength(5);
  expect(draft.gaps).toHaveLength(6);
});
