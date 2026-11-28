# Studio AI 构建协作协议

本文件只适用于 `studio/` 产品工程；根 `AGENTS.md` 的知识变更与隐私边界继续有效。

## 工程流程（常驻合同）

每次 Studio 任务都走这套流程，不靠斜杠命令触发。剧本和原则用 pstack，本仓的差异在 `agents/twh/`，入口说明见 `.agents/skills/twh-mode/SKILL.md`。

1. **先复述。** 用大白话说出操作者的目标和满足它的最小改动，然后开始，不等确认。只读的问题先调查，不改代码。
2. **选剧本，抄进待办。** 映射见 `agents/twh/harness.md`。跳过某一步时写一行 `跳过：<步骤>，<原因>`。
3. **完成判定要能跑。** 它是命令、数字或文件状态，不是时长；汇报里的每个数字和断言都标注实测、推断或猜测。〔R-20〕
4. **写码和验证分开。** 主 Agent 管设计、审查、验证；写码交给子 Agent，派活第一句是 `先读 <仓库根>/studio/agents/twh/worker.md，再做任何事。` 并行的子 Agent 各用各的 worktree（`pnpm twh worktree new <名字>`）。
5. **对着真实产物验证。** `pnpm gate` 跑 lint、类型和单测；改了界面的用 `verify-twh` skill 在真实界面上看结果。换了界面验证、结论不确定，都不算通过。〔R-21〕
6. **推送前过裁判。** 按 `agents/twh/judge.md` 派一个没写过这次代码的 Agent，裁决书绑定要推的 HEAD。落地步骤见 `agents/twh/land-on-main.md`。〔R-22〕
7. **汇报和记录。** 按 `agents/twh/report.md` 汇报。长任务和过夜运行用 `bash studio/scripts/agents/log.sh` 把决策记到 `studio/.runtime/audit/<任务>.tsv`。
8. **不可撤销的事只有操作者能发起：** 发布、迁移或删除真实数据、强推 main、给运行之外的人发消息。过夜不碰个人知识库。〔R-23〕

## 架构边界

- `apps/web` 只通过本地 API 与共享契约访问知识，不读取 Vault 文件。
- `apps/server` 负责 HTTP、路径安全和编排；领域解析放在 `packages/wiki-core` 与 `packages/life-views`。
- `packages/codex-bridge` 只封装 Codex 协议；`packages/run-manager` 只负责运行记录、快照和差异。
- `packages/shared` 保存跨前后端契约。外部输入必须在服务端做运行时校验，不能把 TypeScript 类型当成安全边界。〔R-01〕
- Studio 不复制 `knowledge-engine/skills` 中的归档、抽取或人生判断规则。
- 桌面 IPC 的频道名写在三处（`main.mjs`、`preload.cjs`、`bridge.ts`），改一处就要对齐另外两处。〔R-06〕

## 多知识库安全

- 浏览器活动库只是 UI 状态；每个 Run 必须持久化 `knowledgeBaseId` 与配置快照。〔R-02〕
- Prompt、快照、审批、验证、diff 和重建必须使用 Run 绑定的知识库上下文。〔R-03〕
- 写锁按知识库隔离；任何配置路径解析后都必须仍位于该知识库的内容根内，没配内容根时就是工作区内。〔R-04〕
- 新写入接口必须限制在配置允许的 Wiki 或来源目录，并处理并发修改。〔R-05〕

## 实现与验证

### 发布更新的长期授权

- 用户于 2026-10-27 明确授权：今后要求“推送更新”“发布新版”等时，可连续执行本软件的检查、构建、Developer ID 签名、向 Apple 上传构建包公证、隔离安装验收、GitHub Release 上传及公开、客户端更新 feed 切换，无需就这些常规步骤重复确认。
- 此授权在用户要求发布时生效，不自行发起新版本发布；只发布产品代码和匿名演示资源，不包含私人知识库、录音、密钥或用户资料。
- 发布流程和凭据 profile 名称统一见 `docs/DIRECT-DISTRIBUTION.md`；凭据仍只使用现有钥匙串，不写入仓库或聊天。〔R-07〕
- 发布完成还须同步官网 `/download/` 的版本、下载链接与相关更新说明，并确认 Sites 部署成功；不能只切换客户端 feed 就结束发布。官网沿用既有站点及受支持源码流程，安装包仍托管 GitHub。〔R-08〕
- 发布前递增桌面版本号并准备准确的中英文说明。全部检查、公证、最终安装包启动验收与托管哈希校验通过后再公开；失败时修复或报告具体阻塞，不能发布未验证产物。〔R-09〕
- 沿用当前对话中的明确授权及本节作为后续审批依据，不据此修改平台安全设置或绕过审批拒绝。〔R-23〕

### 用户配置与升级保留

- 用户明确选择的保存目录、语言、通知、界面和窗口偏好是受保护配置，不属于安装包默认值或可重建缓存。升级只补缺失字段，不覆盖已有值；不得通过清空浏览器存储或历史记录重置配置。〔R-10〕
- 桌面界面偏好统一使用 `shared/preference-storage.ts` 和主进程 `UserPreferences`，仅迁移已存在的旧选择，不把组件默认值写回；知识库相关目录必须按工作区与知识库隔离。〔R-11〕 AI 密钥继续走既有加密设置，不得进入通用偏好文件。〔R-12〕
- 文字保存目录独立持久化，不能依赖草稿/历史索引的存在。配置损坏必须保留原文件并报告，不能静默用默认配置覆盖。〔R-13〕
- 新增可修改配置时更新 `docs/USER-PREFERENCES.md` 的持久化清单，并验证重启与升级后保留。发布验收须包含真实偏好保留，不能只验证匿名占位文件；〔R-14〕 桌面测试的 userData 与 sessionData 都必须隔离。〔R-15〕

### 产品改动的复现与验收

步骤在 pstack 的 bug-fix 剧本里：先在真实界面复现，失败的复现排在修复前面，沿着因果链修到第一个出错的地方，不叠加"可能有帮助"的补丁。本仓只补三条判断性说明：

- 匿名数据要保留触发问题的条件，例如长内容、已有配置、切换上下文或异步加载。
- 在实际宿主里验收用户看得见的结果，并检查数据归属和失败恢复。
- 汇报时说清静态检查、组件测试、实际页面、已安装客户端各自覆盖到哪一步；没验证到的部分和原因明说。

### 临时服务与端口清理

- 除非用户明确要求启动并保持运行，否则不得在任务结束后留下 Agent 启动的服务、监听端口或后台进程。修复、构建与验证不等于授权常驻运行。〔R-16〕
- 验证优先用 `pnpm twh launch` 和 `pnpm twh cleanup`，它们独占实例的生命周期并在清理后核对端口。用现成的 `scripts/verify-*.mjs` 时，成功、失败、超时或中断都走它们自带的清理。
- 最终回复前必须停止本次启动的服务及其子进程，并检查进程已退出、端口不再被这些进程占用。只发送停止信号不算完成验证。〔R-16〕
- 不终止用户或其他任务原有的服务，不按端口盲目杀进程。未经用户要求，不替用户重启日常开发服务。

### 代码与提交

- 优先在现有 package 内拆分职责，不为单个文件创建新 package。
- 前端按垂直功能组织；共享展示逻辑与纯函数应从 `App.tsx` 提取并测试。
- 不提交真实日记、人物资料、任务快照、Codex 线程、本机绝对路径或本地生成物。〔R-17〕
- 改动数据模型、任务协议或知识库上下文时，同步更新 `docs/ARCHITECTURE.md` 和匿名演示测试。〔R-18〕

落地前在 `studio/` 运行 `pnpm gate`。发布前再加 `--full`，连构建一起跑。〔R-19〕

## 规则表

正文里每条硬规则旁边有编号，这里写谁在强制它。"文字"表示没有机器检查，靠 Agent 自觉，这类规则越少越好。`/correct` 时更新这张表：结构上做掉了就删掉文字规则。校验命令：`node scripts/check-rule-table.mjs`。

| 编号 | 规则 | 谁在强制 |
| --- | --- | --- |
| R-01 | 外部输入在服务端做运行时校验，类型不是安全边界 | 文字 |
| R-02 | 每个 Run 持久化 `knowledgeBaseId` 与配置快照 | 结构：`packages/shared/src/runs.ts` 的 `WikiRun` 把 `knowledgeBaseId` 设为必填；`pnpm --filter @the-way-here/run-manager exec vitest run src/knowledge-base-binding.test.ts` |
| R-03 | Prompt、快照、审批、验证、diff、重建都用 Run 绑定的知识库上下文 | 文字（`apps/server/src/studio-application.test.ts` 覆盖了跨库场景） |
| R-04 | 配置路径解析后仍在该知识库的内容根内 | `pnpm --filter @the-way-here/wiki-core exec vitest run src/config.property.test.ts`、`pnpm --filter @the-way-here/server exec vitest run src/modules/content/source-access.property.test.ts` |
| R-05 | 新写入接口限制在配置允许的目录并处理并发修改 | 文字 |
| R-06 | IPC 频道名在三处一致 | `node --test apps/desktop/src/ipc-contract.test.mjs` |
| R-07 | 凭据只用钥匙串，不进仓库或聊天 | `.githooks/pre-commit`（隐私扫描：疑似密钥、本机路径） |
| R-08 | 发布完成要同步官网，不能只切 feed | 文字 |
| R-09 | 检查、公证、安装验收、哈希校验通过后才公开 | `pnpm desktop:release:check` |
| R-10 | 升级只补缺不覆盖；不清空存储来重置配置 | `node --test apps/desktop/src/user-preferences.property.test.mjs`、`pnpm twh drive --script verify-preferences` |
| R-11 | 知识库相关目录按工作区与知识库隔离 | 结构：`UserPreferences.address` 用工作区路径的哈希做键 |
| R-12 | AI 密钥不进通用偏好文件 | 结构：`preferenceScope` 只接受白名单里的键 |
| R-13 | 配置损坏时保留原文件并报告，不用默认值覆盖 | 结构：`UserPreferences.read` 解析失败即抛错；`pnpm --filter @the-way-here/desktop test` |
| R-14 | 发布验收包含真实偏好保留 | `pnpm twh drive --script verify-preferences` |
| R-15 | 桌面测试的 userData 与 sessionData 隔离 | `pnpm lint`（启动 Electron 只允许出现在驾驭层，存量走棘轮） |
| R-16 | 任务结束不留服务、端口、后台进程 | `pnpm twh cleanup` |
| R-17 | 不提交真实日记、私人资料、本机绝对路径、本地产物 | `.githooks/pre-commit`；结构：.gitignore 把私人库挡在仓库外 |
| R-18 | 契约、数据模型的变更要带上测试和文档 | `node studio/scripts/check-gate-loosening.mjs`（标出没带测试的契约变更，交裁判会签） |
| R-19 | 落地前跑门 | `pnpm gate` |
| R-20 | 完成判定能跑；数字标注实测、推断、猜测 | 文字 |
| R-21 | 界面改动在真实界面验证；不确定不算通过 | 文字（工具：`verify-twh` skill、`pnpm twh verify`） |
| R-22 | 推 main 前有绑定 HEAD 的 PASS 裁决书 | 结构：`.githooks/pre-push` 和 ZCode 的 push-guard 没有裁决书就拦 |
| R-23 | 不可撤销的事只有操作者发起；过夜不碰个人库；不绕过审批 | 文字 |
