---
description: 把 Agent 反复犯的错变成结构、类型、lint 或测试，并登记规则表。参数是那类错误；不给就从历史里找。
argument-hint: "[那类错误]"
---
按 pstack 的 `correct` skill 做（读 `<pstack根>/skills/correct/SKILL.md`，根目录用 `pnpm twh pstack-root` 查），加上本仓的要求：

- 证据来源除了提交、回退、评审意见，还包括运行记录：用 `ListSessions` 和 `ReadSession` 读当前工作区最近的会话，找操作者的纠正和被跳过的检查。不读别的项目的。
- 一类错误出现两次才算数。
- 每条新检查先证明它会在真实出过的错上失败，再证明当前代码通过。把那次失败写进规则表的"谁在强制"一格旁边的说明里。
- 规则表在 `studio/AGENTS.md` 的"规则表"一节：每条规则旁边写谁在强制它。结构上做掉之后删掉对应的文字规则。
- 改门、改规则表的提交单独成提交，不混进产品代码；推送前让裁判会签。
- 最后运行 `node studio/scripts/check-rule-table.mjs` 和 `pnpm gate`。

用户参数：$ARGUMENTS
