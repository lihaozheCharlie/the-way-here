# 适配表

pstack 的剧本按 Cursor 写。在别的工具里照下表换名字，表里没有的字段直接去掉并说一声。

## 工具名

| pstack 里写的 | ZCode | Codex | Cursor |
| --- | --- | --- | --- |
| `Task` 子 Agent | `Agent` 工具，`general-purpose` | 新会话或子 Agent，派活第一句先读 `worker.md` | `Task` |
| 只读子 Agent | `Explore` | 只读会话 | `readonly: true` |
| `AskQuestion` | `AskUserQuestion`。子 Agent 不用它 | 不用 | `AskQuestion` |
| 待办清单 | `TodoWrite` | 没有就写在回复里，每个阶段更新 | todolist |
| 运行另一个 skill | 读 `<pstack根>/skills/<名字>/SKILL.md` 并照做 | 同左 | 直接用 `/名字` |
| `environment: "cloud"` | 独立 worktree | 独立 worktree | 云端 Agent |
| `poteto-agent`、`comment-sicko` | `general-purpose`，派活第一句先读 `worker.md` | 同左 | 原生子 Agent |
| Bugbot、Automations、Projects、`/loop` | 跳过，写一行 `跳过：<步骤>，ZCode 没有，改用 <替代>`，然后继续 | 同左，定时任务用系统 cron 拉起 `codex exec` | 原生 |
| 运行记录 | `ListSessions` 和 `ReadSession` 工具 | `~/.codex/sessions/` | `~/.cursor/projects/<slug>/agent-transcripts/` |

只读当前工作区的运行记录，不翻别的项目的。

## 本仓覆盖（优先于剧本原文）

- 剧本说运行 Opening a PR、Babysit、Shipping 时，改走 `land-on-main.md`。
- 模型角色看 `models.md`。pstack 里写的模型名在本仓不直接使用。
- 派子 Agent 的第一句：`先读 <仓库根的绝对路径>/studio/agents/twh/worker.md，再做任何事。`
- 隐私和数据边界优先于"能撤销就自己定"：过夜不碰个人知识库；发布、迁移真实数据只由操作者发起；只驱动本次运行自己启动的匿名实例。
- Wiki 任务的路由不变，仍按根 `AGENTS.md` 和 `knowledge-engine/skills/registry.yaml`。构建前 `python3 knowledge-engine/tools/source_manifest.py --snapshot <文件>`，构建后 `python3 knowledge-engine/tools/gate.py --since <文件>`。
- 决策日志放 `studio/.runtime/audit/<任务>.tsv`，用 `bash studio/scripts/agents/log.sh` 追加。这个目录不进 git。

## 找 pstack

```bash
node studio/scripts/twh.mjs pstack-root
```

它会依次找环境变量 `PSTACK_ROOT`、ZCode 的插件缓存、`~/.cursor/plugins`。找不到时打印安装方法。

## 本仓的 skill 和命令

| 名字 | 作用 |
| --- | --- |
| `/twh-mode` | 入口。路由到 pstack 的剧本并叠加本仓规则 |
| `verify-twh` skill | 启动、体检、驱动、取证、清理匿名实例 |
| `/judge` | 按 `judge.md` 派裁判 |
| `/correct` | 把重复的错误变成结构、类型、lint 或测试 |
| `/reflect` | 从一次会话里提炼教训，经操作者批准后再改 skill |
| `/show-me-your-work`、`/ketchup` | 读决策日志复核，用人话汇报 |
