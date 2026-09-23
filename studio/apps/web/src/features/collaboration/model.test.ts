import { describe, expect, it } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { JOURNEY_WRAP_UP_DISPLAY_PROMPT, agentContextIdentity, attachedContextPrompt, boundAgentThreadForPage, boundAgentThreadForTopic, contextPrompt, continuationModelSelection, groupAgentThreads, isJourneyWrapUpRun, letterRunVersions, resolveAgentAutoSubmission, resolveComposerMode, resolveRunContext, runDisplayPrompt, runFinalAnswer, shouldSubmitAgentInput, visibleAgentAnswer } from "./model";

describe("collaboration model", () => {
  it("hides photo payloads, including a partial streaming block", () => {
    const target = { kind: "photo-memory" as const, importId: "batch", storedPath: "sources/photo.md", label: "照片", phase: "enrich" as const };
    expect(visibleAgentAnswer('你想从哪里讲起？<photo-memory>{"photos":[]}</photo-memory>', target)).toBe("你想从哪里讲起？");
    expect(visibleAgentAnswer('看看这里。<photo-memory>{"photos":', target)).toBe("看看这里。");
    expect(resolveComposerMode("write", target)).toBe("read");
  });
  it("extracts the final answer from Codex events", () => {
    const run = { events: [{ payload: { item: { type: "agentMessage", phase: "final_answer", text: "最终判断" } } }] } as unknown as WikiRun;
    expect(runFinalAnswer(run)).toBe("最终判断");
  });

  it("extracts the final answer from the runtime-neutral Pi result", () => {
    const run = {
      runtimeId: "pi",
      result: { finalAnswer: "自定义模型回答" },
      events: [{ payload: { type: "assistant.message", text: "处理中", final: false } }],
    } as unknown as WikiRun;
    expect(runFinalAnswer(run)).toBe("自定义模型回答");
  });

  it("keeps the display prompt separate from the technical context", () => {
    const run = { title: "任务", prompt: "边界\n用户请求：\n真实问题", events: [] } as unknown as WikiRun;
    expect(runDisplayPrompt(run)).toBe("真实问题");
    expect(contextPrompt({ scope: "人物", title: "甲", suggestions: [] }, "继续查证")).toContain("用户请求：\n继续查证");
  });

  it("keeps attached topic context separate from the user's own words", () => {
    const prompt = attachedContextPrompt({
      title: "你愿意把哪一种身体信号当作底线？",
      currentUnderstanding: "身体恢复仍不稳定。",
      reason: "近期记录还不足以确认稳定节奏。",
    }, "我想先说说最近一次晚睡。");

    expect(prompt).toContain("不是用户已经说过的话");
    expect(prompt).toContain("话题：你愿意把哪一种身体信号当作底线？");
    expect(prompt).toContain("用户这次想说：\n我想先说说最近一次晚睡。");
    expect(prompt).toContain("不要求每轮都提问");
  });

  it("groups multiple turns from one Agent session into one conversation", () => {
    const first = { id: "run-1", runtimeSessionId: "session-1", createdAt: "2026-08-20T10:00:00.000Z" } as WikiRun;
    const followUp = { id: "run-2", runtimeSessionId: "session-1", createdAt: "2026-08-20T11:00:00.000Z" } as WikiRun;
    const separate = { id: "run-3", createdAt: "2026-08-21T10:00:00.000Z" } as WikiRun;

    const threads = groupAgentThreads([first, separate, followUp]);

    expect(threads).toHaveLength(2);
    expect(threads[0]?.latest.id).toBe("run-3");
    expect(threads[1]?.runs.map((run) => run.id)).toEqual(["run-1", "run-2"]);
    expect(threads[1]?.latest.id).toBe("run-2");
  });

  it("restores the latest conversation bound to a page even while it is running", () => {
    const older = { id: "run-old", contextPageId: "sources/日记/今天", status: "completed", createdAt: "2026-09-03T09:00:00.000Z" } as WikiRun;
    const running = { id: "run-running", contextPageId: "sources/日记/今天", runtimeSessionId: "session-current", status: "running", createdAt: "2026-09-03T11:00:00.000Z" } as WikiRun;
    const unrelated = { id: "run-other", contextPageId: "sources/日记/别处", status: "completed", createdAt: "2026-09-03T12:00:00.000Z" } as WikiRun;

    expect(boundAgentThreadForPage([older, unrelated, running], "sources/日记/今天")?.latest.id).toBe("run-running");
  });

  it("restores legacy source conversations whose stored path includes the vault prefix", () => {
    const legacy = {
      id: "run-legacy",
      status: "waiting_approval",
      createdAt: "2026-09-03T11:00:00.000Z",
      sourceContext: { importId: "manual", storedPath: "vault/personal/原始知识库/日记/今天.md", flow: "direct" },
    } as unknown as WikiRun;

    expect(boundAgentThreadForPage([legacy], "原始知识库/日记/今天")?.latest.id).toBe("run-legacy");
  });

  it("keeps completed perspective rereads as ordered letter versions", () => {
    const target = { kind: "letter-version" as const, pageId: "wiki/12 回信/今天", lensId: "yanni", lensName: "雅尼", label: "雅尼视角回信" };
    const earlier = { id: "run-1", status: "completed", updatedAt: "2026-08-20T10:00:00.000Z", createdAt: "2026-08-20T09:00:00.000Z", outputTarget: target, result: { finalAnswer: "第一版" }, events: [] } as unknown as WikiRun;
    const latest = { id: "run-2", status: "completed", updatedAt: "2026-08-21T10:00:00.000Z", createdAt: "2026-08-21T09:00:00.000Z", outputTarget: target, result: { finalAnswer: "第二版", completedAt: "2026-08-21T11:00:00.000Z" }, events: [] } as unknown as WikiRun;
    const running = { id: "run-3", status: "running", updatedAt: "2026-08-22T10:00:00.000Z", createdAt: "2026-08-22T09:00:00.000Z", outputTarget: target, result: { finalAnswer: "未完成" }, events: [] } as unknown as WikiRun;
    const otherLetter = { ...latest, id: "run-4", outputTarget: { ...target, pageId: "wiki/12 回信/别处" } } as WikiRun;

    expect(letterRunVersions([latest, running, otherLetter, earlier], target.pageId)).toEqual([
      expect.objectContaining({ id: "run-1", markdown: "第一版" }),
      expect.objectContaining({ id: "run-2", markdown: "第二版", createdAt: "2026-08-21T11:00:00.000Z" }),
    ]);
  });

  it("submits Agent input on Enter while preserving Shift+Enter and IME composition", () => {
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: false })).toBe(true);
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: true })).toBe(false);
    expect(shouldSubmitAgentInput({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
    expect(shouldSubmitAgentInput({ key: "a", shiftKey: false })).toBe(false);
  });

  it("turns an explicit auto-submit request into one ready-to-send Agent message", () => {
    expect(resolveAgentAutoSubmission({ prompt: "  带上下文的问题  ", displayPrompt: "  我真正输入的话  ", mode: "read", autoSubmit: true })).toEqual({
      prompt: "带上下文的问题",
      displayPrompt: "我真正输入的话",
      mode: "auto",
      outputTarget: undefined,
    });
    expect(resolveAgentAutoSubmission({ prompt: "只预填，不发送" })).toBeUndefined();
    expect(resolveAgentAutoSubmission({ prompt: "   ", autoSubmit: true })).toBeUndefined();
    const sourceContext = { importId: "batch", storedPath: "sources/日记.md", flow: "direct" as const };
    expect(resolveAgentAutoSubmission({ prompt: "收进理解", autoSubmit: true, sourceContext })?.sourceContext).toEqual(sourceContext);
    const contextOverride = { scope: "近况回信 · 主动写信", title: "匿名阶段", pageId: "wiki/stage", suggestions: [] };
    expect(resolveAgentAutoSubmission({ prompt: "写信", autoSubmit: true, mode: "write", lockMode: true, contextOverride })).toMatchObject({ mode: "write", contextOverride });
    const readingContext = { scope: "近况回信", title: "正在阅读的旧回信", pageId: "wiki/old-letter", suggestions: [] };
    expect(resolveRunContext(readingContext, contextOverride)).toEqual(contextOverride);
    expect(contextPrompt(resolveRunContext(readingContext, contextOverride), "写一封新回信")).not.toContain("wiki/old-letter");
  });

  it("lets Agent infer every normal conversation while preserving validation", () => {
    expect(resolveComposerMode()).toBe("auto");
    expect(resolveComposerMode("read")).toBe("auto");
    expect(resolveComposerMode("write")).toBe("auto");
    expect(resolveComposerMode("write", undefined, true)).toBe("write");
    expect(resolveComposerMode("auto")).toBe("auto");
    expect(resolveComposerMode("validate")).toBe("validate");
  });

  it("keeps journey enrichment strictly read-only and hides the report payload", () => {
    const target = { kind: "journey-report" as const, importId: "batch-1", storedPath: "sources/消费账单/旅程.md", label: "消费旅程报告" };
    expect(resolveComposerMode("auto", target)).toBe("read");
    expect(resolveAgentAutoSubmission({ prompt: "继续", mode: "auto", autoSubmit: true, outputTarget: target })).toMatchObject({ mode: "read", outputTarget: target });
    expect(visibleAgentAnswer("我理解了。\n<journey-report>\n## 完整旅程\n正文\n</journey-report>", target)).toBe("我理解了。");
  });

  it("recognizes the explicit journey wrap-up turn", () => {
    const target = { kind: "journey-report" as const, importId: "batch-1", storedPath: "sources/消费账单/旅程.md", label: "消费旅程报告" };
    expect(isJourneyWrapUpRun({ displayPrompt: JOURNEY_WRAP_UP_DISPLAY_PROMPT, outputTarget: target } as WikiRun)).toBe(true);
    expect(isJourneyWrapUpRun({ displayPrompt: "继续聊聊", outputTarget: target } as WikiRun)).toBe(false);
  });

  it("keeps an open journey conversation stable while its report content refreshes", () => {
    const target = { kind: "journey-report" as const, importId: "batch-1", storedPath: "sources/消费账单/旅程.md", label: "消费旅程报告" };
    const before = { scope: "消费旅程", title: "支付宝消费旅程", summary: "12 笔消费", suggestions: [], defaultOutputTarget: target };
    const after = { ...before, title: "支付宝消费旅程（已补充）", summary: "报告内容已经更新", defaultOutputTarget: { ...target } };

    expect(agentContextIdentity(after)).toBe(agentContextIdentity(before));
    expect(agentContextIdentity({ ...before, defaultOutputTarget: { ...target, storedPath: "sources/消费账单/另一段旅程.md" } })).not.toBe(agentContextIdentity(before));
  });
});


describe("topic conversation restoration", () => {
  const topic = { topicId: "wiki:demo-question", title: "匿名话题", currentUnderstanding: "已有线索", reason: "继续理解" };
  const first = { id: "first", knowledgeBaseId: "demo", contextTopicId: topic.topicId, runtimeSessionId: "session", createdAt: "2026-09-01", title: "旧标题", prompt: "第一轮" } as WikiRun;
  const next = { ...first, id: "next", createdAt: "2026-09-02", prompt: "继续聊" };
  it("reopens the latest turn and retains the full thread even after the topic wording changes", () => {
    const thread = boundAgentThreadForTopic([next, first], topic, "demo");
    expect(thread?.latest.id).toBe("next");
    expect(thread?.runs.map((run) => run.id)).toEqual(["first", "next"]);
    expect(thread?.id).toBe("session");
  });
  it("does not mix libraries, other topics or deleted conversations", () => {
    expect(boundAgentThreadForTopic([first], topic, "other")).toBeUndefined();
    expect(boundAgentThreadForTopic([first], { ...topic, topicId: "different" }, "demo")).toBeUndefined();
    expect(boundAgentThreadForTopic([], topic, "demo")).toBeUndefined();
  });
  it("restores legacy generated topic context, but never guesses from title alone", () => {
    const legacy = { ...first, contextTopicId: undefined, title: `处理：${topic.title}`, prompt: attachedContextPrompt(topic, "匿名经历") };
    expect(boundAgentThreadForTopic([legacy], topic, "demo")?.latest.id).toBe("first");
    expect(boundAgentThreadForTopic([{ ...legacy, prompt: "同标题的其他任务" }], topic, "demo")).toBeUndefined();
    expect(boundAgentThreadForTopic([{ ...legacy, contextTopicId: "different" }], topic, "demo")).toBeUndefined();
  });
});

it("uses newly selected models for continuation and preserves the runtime boundary", () => {
  const run = { runtimeId: "pi", model: "old-model", effort: "low" } as WikiRun;
  const selected = { runtimeId: "pi" as const, model: "new-model", effort: "high" as const };
  expect(continuationModelSelection(run, selected)).toEqual(selected);
  expect(() => continuationModelSelection(run, { ...selected, runtimeId: "codex" })).toThrow("开始新对话");
});
