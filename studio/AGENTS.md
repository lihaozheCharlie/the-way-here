# Studio AI 构建协作协议

本文件只适用于 `studio/` 产品工程；根 `AGENTS.md` 的知识变更与隐私边界继续有效。

## 架构边界

- `apps/web` 只通过本地 API 与共享契约访问知识，不读取 Vault 文件。
- `apps/server` 负责 HTTP、路径安全和编排；领域解析放在 `packages/wiki-core` 与 `packages/life-views`。
- `packages/codex-bridge` 只封装 Codex 协议；`packages/run-manager` 只负责运行记录、快照和差异。
- `packages/shared` 保存跨前后端契约。外部输入必须在服务端做运行时校验，不能把 TypeScript 类型当成安全边界。
- Studio 不复制 `knowledge-engine/skills` 中的归档、抽取或人生判断规则。

## 多知识库安全

- 浏览器活动库只是 UI 状态；每个 Run 必须持久化 `knowledgeBaseId` 与配置快照。
- Prompt、快照、审批、验证、diff 和重建必须使用 Run 绑定的知识库上下文。
- 写锁按知识库隔离；任何配置路径解析后都必须仍位于工作区内。
- 新写入接口必须限制在配置允许的 Wiki 或来源目录，并处理并发修改。

## 实现与验证

### 临时服务与端口清理

- 除非用户明确要求启动并保持运行，否则不得在任务结束后留下 Agent 启动的服务、监听端口或后台进程。修复、构建与验证不等于授权常驻运行。
- 验证优先使用无需监听端口的测试。确需启动服务时，记录本次启动的父子进程及端口，并在启动时设置退出清理（如 `trap` 或 `try/finally`）；成功、失败、超时或中断均应清理。
- 最终回复前必须停止本次启动的服务及其子进程，并检查进程已退出、端口不再被这些进程占用。只发送停止信号不算完成验证；仍占用时继续处理。
- 不终止用户或其他任务原有的服务，不按端口盲目杀进程。未经用户要求，不替用户重启日常开发服务。

- 优先在现有 package 内拆分职责，不为单个文件创建新 package。
- 前端按垂直功能组织；共享展示逻辑与纯函数应从 `App.tsx` 提取并测试。
- 不提交真实日记、人物资料、任务快照、Codex 线程、本机绝对路径或本地生成物。
- 改动数据模型、任务协议或知识库上下文时，同步更新 `docs/ARCHITECTURE.md` 和匿名演示测试。

完成前在 `studio/` 运行：

```bash
pnpm typecheck
pnpm test
pnpm build
```
