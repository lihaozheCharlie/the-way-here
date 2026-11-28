---
name: twh-mode
description: The Way Here 仓的工程入口。用户说 /twh-mode、"按本仓流程"，或在 studio/ 做需要严谨流程的改动时使用。先复述目标和最小改动，路由到 pstack 的剧本，再叠加本仓的落地、裁判和隐私边界。
---

# twh-mode

本仓的工程流程等于 pstack 的剧本加本仓的差异层。剧本和原则用装好的 pstack，差异层在 `studio/agents/twh/`。

## 开工

1. 先读 `studio/AGENTS.md`（常驻合同）和 `studio/agents/twh/harness.md`（适配表）。
2. 用大白话复述操作者的目标，以及满足它的最小改动，然后开始，不等确认。只读的问题先调查，不改代码。
3. 选剧本，把它的步骤抄进待办清单（`TodoWrite`）。剧本在 `<pstack根>/skills/poteto-mode/playbooks/`，根目录用 `pnpm twh pstack-root` 查：

   | 任务 | 剧本 |
   | --- | --- |
   | 只读问题、要一个带引用的解释 | `investigation`，配合 how、why |
   | 缺陷 | `bug-fix`。先在真实界面复现，失败的复现排在修复前 |
   | 新行为 | `feature` |
   | 只改结构 | `refactoring`。先钉住行为，typecheck 和 lint 不算钉住 |
   | 实测变慢 | `perf-issue`；持续优化一个数字用 `hillclimb` |
   | UI 或交互的决策没定 | `prototype`。带切换器的几个变体加截图 |
   | 大的、跨模块的、没人看着的 | `figure-it-out`，它自己设计流程并记决策日志 |
   | 改 skill、提示词 | `authoring-a-skill` 加 `eval`，先盲评再落地 |
   | 过夜 | `studio/agents/twh/contracts/overnight.md` 加 `autonomous-run` |

4. 没有剧本合适的，按 `figure-it-out` 自己设计一个：完成判定写成能跑的谓词，拆成各自能验证的小单元，风险最大的未知数排最前。

## 本仓硬规则（覆盖剧本原文）

- 落地走 `studio/agents/twh/land-on-main.md`，不开 PR。剧本里说运行 Opening a PR、Babysit、Shipping 时，换成它。
- 推送 main 之前，必须有没写过这次代码的裁判给出 PASS，规程在 `studio/agents/twh/judge.md`。
- 派子 Agent 的第一句：`先读 <仓库根的绝对路径>/studio/agents/twh/worker.md，再做任何事。`并行的子 Agent 各用各的 worktree。
- 实跑用 `verify-twh` skill。界面改动没在真实界面上看到，就不算验证过。
- 隐私和数据边界优先于"能撤销就自己定"：过夜不碰个人知识库；发布、迁移真实数据只由操作者发起；只驱动这次运行自己启动的匿名实例。
- Wiki 任务的路由不变，仍按根 `AGENTS.md` 和 `knowledge-engine/skills/registry.yaml`。前后加来源哈希比对，收尾跑 `python3 knowledge-engine/tools/gate.py`。
- 汇报按 `studio/agents/twh/report.md`。
- 跳过剧本里的某一步时写一行 `跳过：<步骤>，<原因>`，然后往下走。pstack 里 Cursor 独有的功能（`/loop`、Bugbot、云 Agent、Automations）按 `harness.md` 换成替代做法。

## 一次任务的全程

```
派活 → 复述 → 选剧本 → 只读摸底 → （需要时）出方案或原型
→ 子 Agent 在 worktree 里写码 → pnpm gate → verify-twh 实跑
→ 拆成有序的小提交 → 裁判独立复跑并写裁决书 → 推 main → 盯 CI → 汇报
```

## 操作者纠正你的时候

同一种纠正出现第二次，就运行 `/correct`：把教训变成结构、类型、lint 或测试，登记进 `studio/AGENTS.md` 的规则表，删掉文字规则。不要在任务中途顺手改 skill，skill 的改动单独一个提交。

## 派活提示词的写法（给操作者的备忘）

说五样就够，每样一句：目标、完成判定、要看的证据、你已经知道的线索、约束。不用列 skill，剧本会排。不先给你的原因猜测，让 Agent 先复述问题。
