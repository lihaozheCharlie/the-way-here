import type { ConversationPrompt, PaymentJourneySummary, StateSignal, TodayView } from "@the-way-here/shared";
import { openContextAgent } from "../collaboration/model";
import { pageHref } from "../../shared/routing";
import { dailyPromptSeed, stablePromptOrder } from "./conversation-prompts";

export function signalConversationPrompt(signal: StateSignal): string {
  return `我想从「${signal.name}」说起。现在的阶段性理解是：${signal.judgment}。之所以在此刻提起，是因为：${signal.reason || signal.observation}。请先区分已有证据、当前理解和仍然未知，再从最需要我亲自补充的地方开始，一次只问我一个具体问题。`;
}

function wikiConversationPrompt(prompt: ConversationPrompt): string {
  const evidence = prompt.links.map((link) => link.label).join("、");
  return `我想聊聊这个问题：“${prompt.question}”\n\n当前已有理解：${prompt.currentUnderstanding}\n为什么现在值得聊：${prompt.reason}\n仍然未知：${prompt.unknown}${evidence ? `\n相关知识：${evidence}` : ""}\n\n请先让我表达具体经历，再结合相关证据帮我理清线索；一次只问我一个具体问题。`;
}

export function openLifeConversation(question: TalkingQuestion): void {
  openContextAgent({
    mode: "read",
    attachedContext: {
      title: question.question,
      currentUnderstanding: question.currentUnderstanding,
      reason: question.reason,
    },
  });
}

type TalkingQuestion = {
  id: string;
  title: string;
  question: string;
  currentUnderstanding: string;
  reason: string;
  unknown: string;
  agentPrompt: string;
  pageId?: string;
  sourceHref?: string;
  sourceLabel?: string;
  basis: string[];
  kind: ConversationTopicKind;
  evidenceCount: number;
  weight?: number;
};

export type ConversationTopicKind = "understanding" | "state" | "ledger" | "casual";

export const conversationTopicKinds: Record<ConversationTopicKind, { label: string; description: string }> = {
  understanding: { label: "已有理解", description: "从已有判断里留下的待确认问题" },
  state: { label: "状态线索", description: "最近反复出现、还没有说清楚的状态" },
  ledger: { label: "账单线索", description: "从时间、地点和行动里找回真实经历" },
  casual: { label: "随口话头", description: "没有足够材料时，从一件小事开始" },
};

export const todayOpeners = [
  { id: "noticed-small-thing", question: "最近有没有哪件小事，让你比平时更在意？", agentPrompt: "我想从最近一件让我比平时更在意的小事开始。请接着我的回答，一次只问一个关于人物、处境或感受的具体问题。" },
  { id: "stayed-in-mind", question: "今天过去以后，哪一个瞬间还留在你心里？", agentPrompt: "我想说说今天过去以后还留在心里的一个瞬间。请接着我的回答问细节。" },
  { id: "almost-said", question: "最近有没有一句差点说出口、最后又收回去的话？", agentPrompt: "我想从最近一句差点说出口、最后又收回去的话开始。请一次只问一个问题，陪我把当时的处境和顾虑说清楚。" },
  { id: "unexpected-ease", question: "这两天有没有什么时刻，让你意外地松了一口气？", agentPrompt: "我想说说这两天一个让我意外松了口气的时刻。请顺着我的回答继续问具体细节。" },
  { id: "keep-returning", question: "最近脑子里反复回来的一件事，是什么？", agentPrompt: "我想说说最近脑子里反复回来的一件事。请先陪我还原发生了什么，一次只问一个问题。" },
] as const;

export const todayStarterPhrases = ["是的，其实…", "还好，但…", "说不好，可能是…"] as const;

export function talkingQuestions(data: TodayView, recentJourney?: PaymentJourneySummary): TalkingQuestion[] {
  const wikiQuestions = data.conversationPrompts.map((prompt) => {
    const evidence = prompt.links.find((link) => link.resolvedId);
    return {
      id: `wiki:${prompt.id}`,
      title: prompt.title,
      question: prompt.question,
      currentUnderstanding: prompt.currentUnderstanding,
      reason: prompt.reason,
      unknown: prompt.unknown,
      agentPrompt: wikiConversationPrompt(prompt),
      pageId: evidence?.resolvedId,
      sourceHref: evidence?.resolvedId ? pageHref(evidence.resolvedId) : undefined,
      sourceLabel: evidence?.resolvedId ? "看看依据" : undefined,
      basis: prompt.links.map((link) => link.label).filter(Boolean).slice(0, 2),
      kind: "understanding" as const,
      evidenceCount: prompt.links.filter((link) => link.resolvedId).length || prompt.links.length,
      weight: prompt.weight,
    };
  });
  const signalQuestions = data.focusCandidates.map((signal) => {
    const evidence = signal.links.find((link) => link.resolvedId);
    return {
      id: `signal:${signal.id}`,
      title: signal.name,
      question: `最近哪一个具体时刻，让你觉得「${signal.name}」正在变好或变坏？`,
      currentUnderstanding: signal.judgment,
      reason: signal.reason || "这是一处仍在验证、需要回到你的真实经历中继续理解的地方。",
      unknown: signal.observation || "还不知道这条理解在你今天的生活里是否仍然成立。",
      agentPrompt: signalConversationPrompt(signal),
      pageId: evidence?.resolvedId,
      sourceHref: `/focus/${encodeURIComponent(signal.id)}`,
      sourceLabel: "看看它从哪里来",
      basis: [signal.name, signal.kind].filter(Boolean),
      kind: "state" as const,
      evidenceCount: signal.links.filter((link) => link.resolvedId).length || signal.links.length,
      weight: 1,
    };
  });
  const journeyCluster = recentJourney?.clusters[0];
  const journeyQuestion = recentJourney && journeyCluster ? [{
    id: `journey:${journeyCluster.id}`,
    title: journeyCluster.title,
    question: journeyCluster.question,
    currentUnderstanding: `${recentJourney.transactionCount} 笔账单记录里，出现了 ${recentJourney.clusters.length} 段有时间顺序的生活线索。`,
    reason: "账单已经留下时间、地点与行动，但真正重要的人物、动机和感受只能由你说出来。",
    unknown: "当时和谁在一起、为什么出发，以及这段经历后来改变了什么。",
    agentPrompt: recentJourney.agentPrompt || `请从「${journeyCluster.title}」开始，一次问我一个关于人物、动机或感受的问题。先陪我把经历说出来。`,
    sourceHref: "/sources",
    sourceLabel: "看看相关记录",
    basis: ["近期账单", journeyCluster.title],
    kind: "ledger" as const,
    evidenceCount: recentJourney.transactionCount,
    weight: 2,
  }] : [];
  const candidates = [...wikiQuestions, ...journeyQuestion, ...signalQuestions];
  if (candidates.length) return stablePromptOrder(candidates, dailyPromptSeed());
  return [{
    id: "recent-moment",
    title: "从一件小事开始",
    question: "最近哪一件小事，让你觉得自己和平时有一点不一样？",
    currentUnderstanding: "这里还没有足够具体的记录，无法替你判断正在发生什么。",
    reason: "从一个真实片段开始，比先给自己下结论更容易找到线索。",
    unknown: "当时发生了什么、你在意什么，以及它为什么留在了心里。",
    agentPrompt: "我想从最近一件让我觉得自己和平时有一点不一样的小事开始。请一次只问我一个关于人物、处境、感受或判断的具体问题，先陪我说清楚。",
    basis: ["从最近发生的小事开始"],
    kind: "casual",
    evidenceCount: 0,
  }];
}
