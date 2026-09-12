# 日记摄取

用户明确说明日记有变化，或要求摄取/运行 wiki 时使用。

## 工作流

1. 连接目录使用本次任务传入的变更引用集合与内容版本；先遵守 `linked-sources.md`。应用目录可能不受 Git 跟踪，不能用 Git 状态判断它是否有变更。旧式库内文件才结合 Git 状态与时间戳确定范围。
2. 添加标签或综合前，完整读取每篇日记。
3. 在心中执行信号扫描，并填写影响矩阵每一行。
4. 有证据支持时，对可维护的库内来源更新轻量来源连接；连接目录的原文和引用不写入以下区块，改在 Wiki 来源索引中维护，并由应用计算反向导航：
   - `## 状态追踪`：记录可观察状态证据；
   - `## 相关日记`：连接具体事件或阶段连续性；
   - `## 关联`：链接受影响的 wiki 页面和实体。
5. 把每个 `update` 行路由到唯一负责人；按照矩阵契约处理 `link-only`、`no-op` 和 `defer`。
6. 只有数量或代表性覆盖发生变化时，才更新 `wiki/08 来源索引/日记索引.md`。
7. 只有来源和用户期待支持有实质内容的回应时，才标记 `companion=update`；否则使用 `no-op`。
8. 日记数量变化时，显式重新生成实体索引：

```bash
python3 knowledge-engine/tools/diary_entity_audit.py --write
python3 knowledge-engine/tools/diary_entity_deep_audit.py --write
```

9. 应用质量门；有实质意义的运行要记录完整矩阵。

## 必需的矩阵摘要

```markdown
personal-line=
life-stage=
cycle=
thinking-model=
system=
event=
people=
experience=
state=
index=
public-navigation=
quote-collection=
companion=
```

每个值必须是 `update`、`link-only`、`no-op` 或 `defer`。
