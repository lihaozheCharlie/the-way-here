# Agent 工程手册

写给在这套流程下工作的 Agent，也写给操作者。读完你就知道：日常任务怎么走、每道闸门拦什么、被拦住时该做什么、哪些事只有操作者能做。规则本身分散在 `studio/AGENTS.md`（常驻合同和规则表）、`studio/agents/twh/`（剧本和规程）和 `.agents/skills/`（skill），本文是它们的地图和用法说明，不重复规则原文。

## 一、这套机制解决什么问题

以前仓库的信号靠两样东西：人的自觉和 CI——CI 是坏的，自觉没有记录。现在的核心想法是一句话：**信任来自能跑的检查和独立的复核，不来自"我记得要这么做"。**

具体是三道闸门，按顺序：

1. **提交闸门**（git hook）：提交说明必须说清改了什么；动了产品源码必须写 `## Why` 和 `## Verification`；暂存内容过隐私扫描（密钥、本机路径、私人库文件）；暂存的代码过 lint。
2. **本地门**（`pnpm gate`）：lint、棘轮、类型、单测、规则表、功能地图，一条命令六步，退出码就是结论，结果按提交落盘。
3. **推送闸门**（pre-push hook + ZCode 拦截）：每个推送重跑一遍门；推 main 还必须有没写过这次代码的裁判写下的裁决书，且绑定要推的那个提交。

在它背后还有两样日常设施：**验证实例**（`pnpm twh` 启动一个只有演示数据的匿名实例，让你像用户一样点界面、截图取证、用完自动清理）和**决策日志**（长任务每做一个决定记一行，事后可审计）。

## 二、术语表

| 词 | 意思 |
| --- | --- |
| 门 / gate | `pnpm gate`，六步检查，退出码即结论 |
| 裁判 | 没写过这次代码的 Agent，独立复跑、实跑、审 diff，写裁决书 |
| 裁决书 | `studio/.runtime/judge/<提交>.json`，绑定提交和它最后一次完整的门结果 |
| 放宽 | 让某道门变松的改动：改门文件、上调棘轮基线、删测试、加压制注释 |
| 会签 | 裁判对某条放宽的显式批准，写到具体提交 |
| 棘轮 | lint 警告基线 `lint-baseline.json`，只准降不准升 |
| 功能地图 | `.agents/skills/verify-twh/features/`，每个用户可见功能一份"怎么到达、怎么驱动、有什么坑" |
| 旅程 | `studio/scripts/verify-*.mjs` 里现成的整段界面验证 |
| 盲评 | 同一任务给几个变体，候选不知道自己在被评，裁判只看脱敏标签 |

## 三、日常任务全流程

以"修一个界面 bug"为例，其他任务换剧本，骨架相同。

**1. 派活怎么说。** 五样东西，每样一句：目标、完成判定（必须是能跑的命令、数字或文件状态，不是"做好一点"）、要看的证据（截图、前后数字、读回的值）、已知的线索、约束。不列 skill，不先给原因猜测。

**2. 入口复述。** `/twh-mode`（或直接按 `studio/AGENTS.md` 的合同）先用大白话复述目标和最小改动，选剧本抄进待办，然后开工，不等确认。只读的问题先调查。

**3. 写码在子 Agent 里。** 主会话管设计、审查、验证；写码派给子 Agent，派活说明第一句永远是：`先读 <仓库根>/studio/agents/twh/worker.md，再做任何事。`并行子 Agent 各用各的 worktree：

```bash
pnpm twh worktree new my-task
```

**4. 验证两件事都做。** 机器的门：`pnpm gate`。真实的界面：改了什么功能就在 `features/<功能>.md` 里找对应的驱动步骤，逐条照原文执行；证据用 `pnpm twh evidence screenshot <名字>` 落盘。换了界面验证、结论不确定，都不算通过。

**5. 提交有格式。** `type(scope): subject`，动产品代码的提交正文必须有 `## Why` 和 `## Verification`。提交要小而有序：失败的测试在前，修复在后；删除在前，重塑在后。改门、hook、CI 的提交不混产品代码。

**6. 派裁判。** 用 `/judge`，它会派一个全新上下文的子 Agent，给它合同和 diff 范围，不给你的结论。裁判自己跑门、实跑、查放宽，写裁决书。一般二十分钟；它没查完的会写进 Flags。FAIL 就修，修完派新裁判，不要续用。

**7. 推送。** `git push origin HEAD:main`。pre-push 会重跑门、校验裁决书。被拦就按提示补，不要绕。

**8. 盯 CI。** `pnpm twh ci watch`。红了当场修，修完从第 4 步重来。

## 四、命令速查

```bash
pnpm gate                      # 完整门（本地和 CI 同一条）
pnpm gate build                # 加构建
pnpm gate test                 # 只跑一步（部分运行不算完整一轮）
pnpm twh launch --build        # 启动匿名验证实例
pnpm twh doctor                # 这个实例值得驱动吗
pnpm twh go /letters           # 打开路由，等主区域可见
pnpm twh drive --eval "<js>"   # 做一步操作，page/expect/origin 在作用域里，要 return
pnpm twh drive --script <名>   # 跑一段现成旅程
pnpm twh evidence screenshot x # 截图 / evidence aria x 无障碍树
pnpm twh cleanup               # 关实例、删临时区、留回执，证据保留
pnpm twh verify --affected a..b # 按改动挑旅程并重跑
pnpm twh worktree new|audit|prune
pnpm twh judge record|check [--unsigned]
pnpm twh ci watch [分支]
pnpm eval --suite eval/letter  # 盲评
pnpm lint:ratchet              # 棘轮检查；--update-baseline 下调
node scripts/check-rule-table.mjs
node scripts/check-gate-loosening.mjs <范围>
python3 knowledge-engine/tools/gate.py --kb demo      # Wiki 门
bash studio/scripts/agents/log.sh <日志> <阶段> <决定> <原因> <证据> <结果>
```

## 五、按任务类型查剧本

| 任务 | 剧本（pstack） | 本仓叠加 |
| --- | --- | --- |
| 只读问题 | investigation + how/why | 不改代码，结论带引用 |
| 缺陷 | bug-fix | 先在真实界面复现；失败的复现排在修复前 |
| 新功能 | feature | 子 Agent 写码，功能地图补条目 |
| 只改结构 | refactoring | 先钉住行为；typecheck 和 lint 不算钉住 |
| 性能 | perf-issue / hillclimb | 数字要有基线、次数、范围、限制因素 |
| UI 决策没定 | prototype | 带切换器的变体加截图 |
| 改 Skill/提示词 | authoring-a-skill + eval | 先盲评（`pnpm eval`）再落地 |
| Wiki 构建 | registry.yaml 路由 | 前后来源快照，`gate.py --since`，可追溯检查 |
| 大的/没人看着 | figure-it-out | 设计流程、记决策日志 |

改 Wiki 的完整链：`source_manifest.py --snapshot` → 构建 Skill → `gate.py --kb <id> --since <快照>`（来源正文变了会失败，变动页面做可追溯检查）。

## 六、被拦住时怎么办

| 拦截 | 原因 | 正确做法 |
| --- | --- | --- |
| 提交说明没信息量 / 缺 Why | hook | 写出改了哪个功能、行为有什么变化；产品代码补两节正文 |
| 隐私扫描 | 暂存内容里有密钥、本机路径、私人库文件 | 确认真的泄漏就修；误报写 `.githooks/allow-privacy.txt` 并让裁判会签 |
| lint 棘轮红 | 新代码用了存量写法（any、直接启动 Electron 等） | 修掉；确实需要例外就 lint-disable 加到期日和理由，棘轮基线下调用 `--update-baseline` 并让裁判会签 |
| 推 main 被拒：无裁决书 | pre-push / push-guard | 按 `agents/twh/judge.md` 派裁判，`pnpm twh judge record` 登记 |
| 推 main 被拒：未会签的放宽 | 裁决书里缺会签 | 看 `pnpm twh judge check --unsigned`，让裁判读过 diff 后按提交会签 |
| `--no-verify` 被拒 | push-guard | 门没过就修；门本身错了单独提交改门并让裁判会签 |
| CI 红 | 任何 job | `gh run view <id> --log-failed`，修完走完验证再推 |
| twh launch 拒绝启动 | 构建产物比源码旧 | `pnpm twh launch --build`；确实要用旧产物加 `--allow-stale` 并明白自己在看什么 |

## 七、怎么改这套机制本身

这属于"放宽"或"收紧"，走 `/correct` 的路子：同类错误出现两次才立规矩；每条新检查先证明它会在真实出过的错上失败；登记进规则表（每条"必须/不得"旁边写谁在强制它）；结构上做掉之后删掉文字规则。改门、规则表、hook 的提交单独成提交，裁判逐提交会签。例外一律带理由和到期日。

## 八、过夜任务

发之前核对四项（全文见 `agents/twh/contracts/overnight.md`）：这类活你亲手做过一遍；Agent 有你会用的工具和信号；每步能自证并能停下线；你读过几份运行记录并把重复失败变成了检查。档位默认 `stack`（只产出自带裁决书的分支，早上你合）；连续 5 晚干净才放开自动推。循环每轮五件事：查判定、最小改动、实跑、提交或丢弃、记一行日志。卡住超过 N 轮就停并写原因。过夜不碰个人知识库、不发布、不迁移数据。

## 九、操作者专属

- 自己推自己写的提交：`TWH_JUDGE_BYPASS=1 git push`。Agent 用这个变量会被 push-guard 直接拒绝。
- 不可撤销的事只有操作者发起：发布、迁移或删除真实数据、强推 main、给运行之外的人发消息。
- 日常开发服务：Agent 不重启、不清理你的端口；它们只驱动自己启动的匿名实例。

## 十、已知边界

- 推送拦截覆盖命令层；用脚本包一层再调 git 的绕法不在防护内，靠夜间巡检抽查裁决书兜底（裁决书是自报的，这一点写在 judge.md）。
- 功能地图和 CI 只验证 Web 层；桌面（Electron）层的脚本需要打包好的应用，在发布流程里验收。
- 盲评目前只有回信一个套件、样本量小，结果是参考不是回归防线。
- `~/Library/Application Support/the-way-here/vaults/` 里 2026-11-28 之前的旧目录是历史测试残留，清理需要操作者确认。
