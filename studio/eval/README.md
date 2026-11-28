# 盲评

改 Skill 或提示词之前先盲评：同一个任务交给几个变体，候选不知道自己在被评，裁判只看脱敏标签。

```bash
pnpm eval --suite eval/letter            # 跑回信套件
pnpm eval --suite eval/letter --dry-run   # 只检查盲化和目录，不调模型
pnpm eval --suite eval/letter --cases 1   # 只跑第一个案例
pnpm eval --suite eval/letter --judge none  # 只生成裁判包，另派一家模型的 Agent 评分
```

结果在 `studio/.runtime/eval/<运行号>/`：`report.md`、`results.tsv`、各份原文、裁判包，以及只有你能看的 `mapping.private.json`。

## 套件怎么写

每个套件一个目录：`suite.json`（变体和工作区）、`cases.jsonl`（每行一个案例）、`prompt.md`（候选看到的任务，`{case}` 会换成案例）、`rubric.md`（3 到 6 条评分标准）、`judge.md`（裁判提示词，`{rubric}` 和 `{letters}` 会替换）、`config.yaml`（匿名工作区的配置）。

变体是对工作区文件的替换（`find` 换成 `replace`），不复制整份 Skill。上游改了被替换的那段话，运行会报错并提示更新套件。

## 规则

- 候选看得到的东西里不出现 eval、test、judge、rubric、score 这些词，目录名、文件名、提示词都算。运行前自动检查，没过就不跑。
- 候选各用各的匿名工作区，只拷演示库和知识引擎，不碰个人知识库。
- 裁判只看脱敏标签。`--judge codex` 时裁判和候选同厂商，报告里会标出来；跨厂商用 `--judge none` 再派另一家的 Agent。
- 候选实际读了哪些文件从运行记录里核对，写在报告里，不听自述。
- 自己把每份输出读完再下结论。和裁判不一致时先怀疑评分标准。
- 一次会话的教训是轶事，不是规则。Skill 的改动要多次盲评都朝同一个方向再落地。

## 待接的套件

- 人物视角（`common-reasoning-lenses`）：换个模型重跑 `cross-domain-regression.md`，比对视角忠实度。
- Studio 的梦境提示词：改 `apps/server/src/modules/dreams` 里的提示词前后各跑一组匿名梦境档案。
- 把 `audit_style_repetition.py --strict` 接成回信套件的确定性检查，放在裁判打分之前。
