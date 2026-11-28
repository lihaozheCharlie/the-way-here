---
description: 派一个没写过这次代码的裁判，独立复跑并写裁决书。参数是合同：目标、完成判定、要看的证据。
argument-hint: "[目标。done means …。show me …]"
---
按 `studio/agents/twh/judge.md` 派裁判。

1. 读 `studio/agents/twh/worker.md`，然后用 `Agent` 工具派一个 `general-purpose` 子 Agent。派活说明的第一句是：`先读 <仓库根的绝对路径>/studio/agents/twh/judge.md，再做任何事。`
2. 给它三样：合同（下面"用户参数"里的内容，没给就按"没给标准"处理）、范围（默认 `origin/main..HEAD`）、工作目录的绝对路径。不要给它你自己的结论或汇报。把 `studio/agents/twh/judge.md` 里"时限"一节说的事也说一遍，免得它无限核对下去。
3. 模型按 `studio/agents/twh/models.md` 的裁判一栏选；能换厂商就换。
4. 子 Agent 完成后，运行 `pnpm twh judge check` 确认裁决书有效。还有没会签的放宽时，`pnpm twh judge check --unsigned` 会列出种类和提交；不要替裁判签，让它自己看过 diff 再签。把裁决、证据路径、Flags、会签、没核对什么原样报给操作者。FAIL 就修，修完重新派一个新的裁判，不要续用旧的。

用户参数：$ARGUMENTS
