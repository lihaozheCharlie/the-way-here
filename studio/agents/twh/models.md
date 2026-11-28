# 模型分工

按角色选模型，不按任务大小。pstack 里出现的模型名不直接用，一律先在这张表里换成当前工具能给的。

| 角色 | 用途 | 默认 | 跨厂商时 |
| --- | --- | --- | --- |
| 写码 | feature、refactoring、bug-fix、perf、hillclimb | 当前会话的主模型 | 不换 |
| 机械改动 | swarm worker、批量小改、只改一个词的提交 | 当前会话的主模型，可以降一档推理 | 不换 |
| 裁判 | `judge.md`、swarm 验证、interrogate 的对手 | 没写过这次代码的新 Agent，与写码者同一会话模型 | ZCode 写的码用 `codex exec` 判；Codex 写的码用 ZCode 判；ZCode 内部也可以换 DeepSeek |
| 只读探查 | how、why、源码核对、功能地图的源码核对 | `Explore` 或只读会话 | 不换 |
| 评审小组 | arena、interrogate 的多人评审 | 每家模型各一个，至少两家 | 必须有一家与父会话不同 |

## 规则

- 裁判必须是新的上下文。续用写码 Agent 的会话不算裁判。
- 只有一家模型可用时照常判，但在裁决书的 Flags 里写明"同厂商裁判"。
- 模型选择写在派活说明里，不写进 `AGENTS.md`。
- ZCode 里当前可用的模型用 `ListModels` 查。需要另一个厂商当裁判时，默认直接用 `codex exec`（OpenAI）判 ZCode 写的码，或用 ZCode 判 Codex 写的码。ZCode 也支持在 `<仓库>/.zcode/agents/<名字>.md` 放自定义 Agent 定义来指定模型，这个格式本仓还没验证过，第一次用之前先实测。
