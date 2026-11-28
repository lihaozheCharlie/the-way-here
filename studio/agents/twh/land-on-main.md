# 落地到 main

代替 pstack 的 Opening a PR、Babysit、Shipping。你拥有落地的内容：只推验证过的 HEAD。

## 前置

在独立 worktree 里工作，从最新的 origin/main 切出：

```bash
pnpm twh worktree new <任务名>
```

## 步骤

1. 同步基线。`git fetch origin`，基线落后就 rebase。
2. 拆成小而有序的提交。顺序要能证明工作：失败的测试在前，修复在后；删除在前，重塑在后；基线在前，处理在后。每个提交只做一件事。提交说明写 `type(scope): subject`；动产品代码的，正文带 `## Why` 和 `## Verification`，四十行以内。
3. 清 diff。"可能有帮助"的顺手改动拿掉。与任务无关的改动另起提交。改门禁、hook、CI、skill 的提交不许混进产品代码。
4. 对已提交的 HEAD 跑门：

```bash
pnpm gate
python3 knowledge-engine/tools/gate.py
```

第二条只在动了 `knowledge-engine` 或 `vault/demo` 时需要。

5. 记决策日志：

```bash
bash studio/scripts/agents/log.sh studio/.runtime/audit/<任务>.tsv <阶段> <决定> <原因> <证据> <结果>
```

6. 派裁判。按 `judge.md` 派一个没写过这次代码的 Agent。裁决书必须绑定要推的那个 HEAD。
7. 推送。`git push origin HEAD:main`。pre-push hook 会再跑一次门并校验裁决书；ZCode 里 `push-guard` 还会拦 `--no-verify` 和跳过裁判的写法。被拦就按提示补，不要绕。
8. 盯 CI。`pnpm twh ci watch`。红了当场修，再走一遍第 4 到第 7 步。
9. 收尾。按 `report.md` 汇报。

## 不做的事

- 强推 main。
- 为了让门变绿去改门。门本身错了就单独一个提交改门，并让裁判会签。
- 把门禁、hook、CI、skill 的改动混进产品代码的提交。
- 在主工作树里做需要验证的改动。

## 人手推送

操作者自己推自己写的提交时用 `TWH_JUDGE_BYPASS=1 git push`。hook 会打印一行记录。Agent 不用这个变量，`push-guard` 见到就拦。
