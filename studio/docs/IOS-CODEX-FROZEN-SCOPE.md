# Codex 冻结资料读取边界

冻结任务使用独立 App Server 连接并启用 experimentalApi。普通 Codex 会话继续使用原实例、原权限与恢复行为。每次冻结任务只把单份证据及公共读取器复制进新的私有目录，不把实时知识库、其他版本或其他空间加入可读范围。

当前打包的 Codex 0.162.1 已拒绝旧 `readOnly.access`。实现采用该二进制 `app-server generate-json-schema --experimental` 生成的真实协议：command/exec 使用 `permissionProfile`，thread/start、thread/resume 和 turn/start 使用 `permissions`。两者均为 profile ID，不能混入旧 sandbox 参数。每份冻结目录启动自己的 CLI，只通过启动参数定义临时 profile：

- filesystem `:root = deny`、`:minimal = read`、该冻结目录的规范绝对路径 `= read`。
- network.enabled = false；不继承 `:workspace` 或真实工作区根。
- 模型只有现有 Pi 冻结资料工具对应的 `read_knowledge_evidence` 动态工具；原生执行、插件、应用与外部 MCP 禁用。

启动模型前检查有效配置、确认 profile 可选，再用新建匿名 canary 验证范围内可读、范围外拒绝。缺少协议支持、策略被忽略、配置无法确认或探针失败时，明确失败并保留问题，不降级 fullAccess。动态调用绑定活动 thread/turn；会话只能在同 KB、同 hash 范围内恢复，未知旧上下文要求重新发起。完成、失败和关闭时清理副本及专用进程。普通 direct 检索优先使用 `TWH_BUNDLED_NODE`，不启用 Electron RunAsNode。

## 真实匿名协议验收

`scripts/verify-codex-frozen-protocol.mjs --anonymous-adhoc-copy --no-outer-seatbelt` 已对0.162.1真实二进制验证：initialize、config/read、permissionProfile/list、两次 command/exec；inside exit0且内容匹配，outside exit1 Operation not permitted且无泄漏。未发送 thread/turn/model请求。所有HOME/CODEX_HOME、auth store和文件均为临时匿名环境，自定义模型provider仅指向127.0.0.1:9；命令profile禁网。不能额外套测试Seatbelt，否则macOS拒绝再应用内部沙盒，探针会正确失败。

缓存二进制尚待整包重签，因此仅对字节相同的/tmp副本与公共库作ad-hoc签名后执行；签名前SHA256相同，原文件未改。这是协议/策略验收，不代表原缓存签名或正式包已验收。报告位于`.runtime/ios/codex-frozen-protocol-compat.json`，生成schema位于`.runtime/ios/codex-0.162.1-schema/`。临时进程和目录均已清理。

公共配置依据：[OpenAI Permissions文档](https://learn.chatgpt.com/docs/permissions)。具体RPC字段以该版本CLI生成schema和真实匿名策略结果为准。
