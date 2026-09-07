import type { PaymentJourneyCluster } from "@the-way-here/shared";

export function journeyDeepConversationPrompt(storedPath: string, cluster: PaymentJourneyCluster): string {
  return `请只围绕消费旅程报告「${storedPath}」中的候选线索「${cluster.title}」和我聊。账单看到的是：${cluster.summary}。这只是回忆线索，不是已经确认的人生事实。

这不是一次需要把人物、动机、感受和结果问齐的访谈。开场只指出一个可以从账单核对的联系，再给一个轻、单一、容易回答的邀请；可以参考「${cluster.question}」，但不要照抄其中的复合问题，也不要一次问多个维度。

之后以我的原话为主：先判断这一轮更适合回应、复述还是提问。只有我的话里确实留下了一处自然的未完线索，而且补上它会改变这段叙述时，才追问最多一个短问题；不需要每轮都问。不要擅自补充情绪、意义、因果或评价，也不要使用“听起来你……”一类套话把推断说成我的感受。

如果我说不记得、没什么具体场景、就是这样、不想展开，或连续给出简短否定，把它当作有效答案和边界：保留我的准确说法，不要换一个维度继续盘问。内容已经足够，或我没有更多想说时，就让这句话落下来，告诉我可以用“这段先聊到这里”结束；不要自行切换到其他线索。`;
}

export function journeyOverviewConversationPrompt(storedPath: string, clue?: Pick<PaymentJourneyCluster, "title" | "summary">): string {
  const startingPoint = clue
    ? `可以把「${clue.title}」作为一个起点。账单只显示：${clue.summary}`
    : "请挑一条最容易进入的候选线索作为起点。";
  return `请围绕消费旅程报告「${storedPath}」开始一段回忆对话。先读取报告，再按需要检索现有 Wiki，利用已有理解避免重复提问；Wiki 只作背景，不触发构建，也不能被修改。${startingPoint}

候选线索不是事实。这不是信息采集表：一次只邀请我说一件容易回答的事，不要同时追问人物、动机、感受和结果。后续不必每轮都提问；只有我的原话里出现自然的未完线索，而且补上它会改变叙述时，才问最多一个短问题。不要擅自推断情绪或意义。我的简短回答、“不记得”“没什么”或“不想展开”都是完整答案，应如实保留并停下追问。每轮只根据我已经确认的讲述更新消费旅程报告。`;
}
