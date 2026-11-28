---
description: 读决策日志，把长任务或过夜运行的工作复盘给操作者看，换一家模型复核并标出值得注意的地方。参数是任务名。
argument-hint: "[任务名，对应 .runtime/audit/<任务名>.tsv]"
---
按 pstack 的 `show-me-your-work` skill 做（读 `<pstack根>/skills/show-me-your-work/SKILL.md`），加上本仓的要求：

- 日志在 `studio/.runtime/audit/<任务名>.tsv`，默认不进 git。追加一行用 `bash studio/scripts/agents/log.sh`。
- 对照运行记录核对日志说的是不是真事：用 `ReadSession` 读这次运行的会话，逐行核对证据指向的东西确实存在、确实支持那一行。日志错了就追加一行更正，不改历史。
- 交回之前派一个另一家模型的子 Agent 读日志和运行记录，标出：证据薄弱的决定、声称做了但没证明的验证、事后看有风险的选择、操作者扫一眼会漏掉的缺口。回复末尾用 Attention 一节列出，第一行写 `复核：<模型>`。"无标记"也是合法结果，模型名不能省。
- 这次运行足够大、操作者要靠这份记录才敢信结果时，才把日志随提交一起入库。

用户参数：$ARGUMENTS
