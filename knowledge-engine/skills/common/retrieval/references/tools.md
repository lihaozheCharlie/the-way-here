# 共享检索工具

## 已有冻结资料

优先使用调用方提供的 `read_knowledge_evidence` 专用工具，或其给定的冻结 `evidence_reader.py`。专用工具固定文件、知识库和版本，模型不能更改它们。

命令行工具参数：`python3 <reader> --file <evidence.json> --knowledge-base <id> --hash <hash> --action <action> --purpose <简短问题>`。路径和文字须作为独立参数或正确引用的 shell 参数传递，勿拼接不可信文字执行。

- `overview --offset 0 --limit 20`：分页目录；若调用方提供 lanes/candidates，也会展示。
- `search --terms <关键词1> <关键词2> --offset 0 --limit 20`：正文及标题/别名 OR 搜索，返回总数、行号和短摘录。无四维词表或预测筛选限制。
- `read --page <页面ID> --start 1 --limit 80`：有行号原文及该范围时间线索，按 totalLines 翻页。
- `neighbors --page <页面ID> --offset 0 --limit 20`：出链、反链及未解析链接；只返回当前快照内节点。

每个 action 是独立参数，例如 `--action search --terms 海外 签证`。limit 范围1—200。片段截断会显式标记，引用前回读。共享工具只读；调用方可在私有运行记录保存有上限的动作摘要，工具不写知识库或推理日志。

## 当前知识库的任务快照

在项目根运行，使用本次已选定的知识库 ID：

```bash
THE_WAY_HERE_KNOWLEDGE_BASE=<id> pnpm --dir studio --filter @the-way-here/server exec tsx ../../../knowledge-engine/skills/common/retrieval/scripts/snapshot.mts
```

它使用 `wiki-core` 的同一套来源、时间、别名和双链实现，将完整资料及共享 profiles 写入系统临时目录，输出 file、reader、knowledgeBaseId、inputHash。之后使用上一节工具；不需要 Studio 服务，不加载预测词表、不生成预测。快照仅供本任务，结束时删除本次输出的临时目录，不删除其他任务的目录。若依赖不可用，可以使用只读文件工具按本 Skill 的同样边界检索，不读取预测私有文件作为普通查询输入。

快照是创建时的资料视图，不能作为实时更新订阅。输出中的语义角色、时间和关联线索仍须回读原文核验。
