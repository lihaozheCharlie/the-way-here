---
name: common-quality-gate
description: "验证 wiki 或 Skill 修改是否满足证据、归档、前置元数据、生成索引安全、链接和完成标准；纯健康检查保持只读。"
---

# 通用：质量门

在 Markdown 或 Skill 修改后、宣布构建完成前，或执行 wiki 健康检查时使用。验证不会自行扩大任务的变更范围。

## 先读

- 归档或移动页面时读取 `knowledge-engine/skills/common/filing-rules.md`。
- 读取被检查页面所属领域的负责 Skill。
- 检查解释性查询或构建时读取 `knowledge-engine/skills/common/reasoning-lenses/SKILL.md`，验证人物视角没有污染中性证据或越过领域边界。

## 内容检查

- 每个非显然判断都能追溯到原始笔记、已标注的对话材料或既有综合页。推断标为 `推断` 或 `待查`。〔W-01〕
- 模板只提供结构，不构成生成占位内容的许可。省略无证据支持的项目、表格行、引文和章节。〔W-02〕
- 按主要对象归档，并维护有用的双向导航。〔W-03〕
- 不要在不同章节机械重复同一证据。〔W-04〕
- 使用与领域匹配的语言；人物、城市、系统、状态、事件和人生阶段需要不同类型的判断。〔W-05〕
- 当措辞本身是可沉淀证据时，保留用户准确原话。〔W-06〕
- 使用人物视角时，执行共享协议的忠实度检查与证据护栏，按成品段落定位结果；本质量门不复制人物规则。协议实质修改时，还须检查实际候选的多视角对照结果，不能以章节齐全代替语义审阅。〔W-07〕
- 重大重解释应在日志记录主视角、辅助任务和重跑范围。新增人物必须由动态发现脚本自动出现，下游 Skill 不得复制人物名单。〔W-08〕

## 连接来源检查

检查连接目录时读取 `knowledge-engine/skills/build/wiki-build/references/linked-sources.md`。确认原文已解引用、来源链接使用稳定目标、反向导航可发现，且失效来源没有被冒充为有效证据。标签工具不得写入外部原文或系统引用文件。〔W-09〕

## 验证：一条命令

从仓库根运行，退出码就是结论：

```bash
THE_WAY_HERE_KNOWLEDGE_BASE=demo python3 knowledge-engine/tools/gate.py --kb demo
```

它依次跑 ruff、标签更新两次、链接、Skill 系统、两个实体审计和本文件的规则表。〔W-10〕 第二次标签更新要报 `updated=0`，链接要报 `missing=0 ambiguous=0`，这些都由命令判断，不靠人读输出。非演示库必须显式写 `--kb <id>`，只靠环境变量选中会被拒绝。演示库没有日记来源，实体审计在它上面总是报告陈旧。

### 会改写 Wiki 的构建

构建前后各多一步，证明来源正文没被动过：

```bash
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/source_manifest.py --snapshot studio/.runtime/audit/sources-before.json
# 执行构建 Skill
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/gate.py --kb <id> --since studio/.runtime/audit/sources-before.json
```

来源目录下任何正文变化或删除都让门失败。〔W-12〕 只改了 frontmatter 的记为元数据变化，不算违规。带 `--since` 时还会对本次变动的页面做可追溯检查。

### 只读维护

健康检查、不修复时，跑同一条命令。实体审计报告生成索引陈旧时，这是检查结果，不等于必须立即重新生成；〔W-11〕 加 `--strict` 才算失败。只读审计绝不使用写入模式。〔W-13〕

### 重新生成实体索引

只有任务明确包含摄取或重新生成，或来源数量变化使生成索引陈旧时，才运行：

```bash
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/diary_entity_audit.py --write
THE_WAY_HERE_KNOWLEDGE_BASE=<id> python3 knowledge-engine/tools/diary_entity_deep_audit.py --write
```

## 需要人工复核的情况

修改格式错误的 YAML、已改名的原始笔记来源、歧义别名、生成索引数量的意外变化，以及需要用户判断的证据冲突前，先人工复核。

## 完成审计

1. 把目标重述为具体交付物。
2. 将每个请求类别映射到已修改或有意保持不变的产物。
3. 检查代表性文件内容和验证器实际输出。
4. 报告跳过的检查和未解决风险。
5. 只要请求中的要求仍不确定，就继续处理。

验证器通过只能证明它覆盖的约束成立，不能证明用户要求的语义工作已经完成。〔W-14〕

## 规则表

正文里每条硬规则旁边有编号，这里写谁在强制它。"文字"表示没有机器检查，靠 Agent 自觉。`common-skill-system` 改规则时同步更新这张表，校验命令是 `python3 knowledge-engine/tools/check_rule_table.py`。〔W-15〕

| 编号 | 规则 | 谁在强制 |
| --- | --- | --- |
| W-01 | 每条判断能追溯到来源，推断有标记 | `python3 knowledge-engine/tools/check_traceability.py`（只查本次变动的页面；默认只报告，`--strict` 算失败） |
| W-02 | 模板不是占位许可，没证据的项目省略 | 文字 |
| W-03 | 按主要对象归档，双向导航可发现 | `python3 knowledge-engine/tools/validate_wiki_links.py`（只证明链接不断；归档位置靠人） |
| W-04 | 不机械重复同一证据 | 文字（回信另有 `python3 knowledge-engine/skills/build/companion-reflection/scripts/audit_style_repetition.py`） |
| W-05 | 判断用与领域匹配的语言 | 文字 |
| W-06 | 措辞是证据时保留原话 | 文字 |
| W-07 | 人物视角按共享协议做忠实度检查 | 文字（回归用例在 `knowledge-engine/skills/common/reasoning-lenses/tests/`） |
| W-08 | 人物名单由动态发现产出，下游不复制 | `python3 knowledge-engine/tools/validate_skill_system.py` |
| W-09 | 标签工具不写外部原文和系统引用文件 | 文字 |
| W-10 | 第二次标签 `updated=0`，链接 `missing=0 ambiguous=0` | `python3 knowledge-engine/tools/gate.py` |
| W-11 | 索引陈旧是检查结果，不是必须重生成 | 文字 |
| W-12 | 不改写原始笔记正文 | `python3 knowledge-engine/tools/source_manifest.py` |
| W-13 | 只读审计不用写入模式 | 文字 |
| W-14 | 验证器通过不等于语义工作完成 | 文字 |
| W-15 | 这张表本身：每条硬规则都登记了谁在强制 | `python3 knowledge-engine/tools/check_rule_table.py` |
