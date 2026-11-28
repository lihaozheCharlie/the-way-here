---
name: verify-twh
description: 像用户一样驱动 The Way Here 来证明行为。启动一个匿名的验证实例、体检、操作界面、截图取证、清理。用户或剧本要求"在应用里验证""实跑""看看界面上对不对""repro"时使用；改了 studio/apps 下任何界面或接口之后也用它。
---

# verify-twh

写给下一个冷启动的 Agent：你从没见过这个应用，照这六节做就能驱动它并拿到证据。命令都在 `studio/` 目录下运行。

## Launch（启动）

```bash
pnpm twh launch --build
```

它在临时目录里建一个匿名工作区（只拷演示库和知识引擎，不含任何私人内容），启动本地服务和浏览器，打印 `origin` 和证据目录。`--build` 会先 `pnpm build`；构建产物比源码旧时它拒绝启动，因为实跑看到的不是你刚改的代码。

- 就绪的意思是可用：首页能打开、能过 AI 引导，不是进程活着。启动完成后跑一次 Doctor。
- 两个实例可以并排跑，各用各的临时目录和随机端口。但 `pnpm twh` 一次只管一个，已在跑就复用它。
- 绝不驱动不是你这次启动的实例，尤其是操作者自己开着的开发服务。

## Doctor（体检）

```bash
pnpm twh doctor
```

回答"这个实例值得驱动吗"：服务是否响应、工作区是否在临时目录、浏览器是否连着、构建是否比源码旧、实例是从哪个提交启动的、工作树有几处未提交改动。任何一条不对先修，不要带着问题往下跑。一次驱动失败之后再驱动前，再体检一次。

## Drive（驱动）

打开一个路由，等主区域可见：

```bash
pnpm twh go /letters
```

做一步操作。`--eval` 里是函数体，作用域里有 `page`（Playwright Page，默认超时 10 秒）、`expect`、`origin`，要 `return` 一个值：

```bash
pnpm twh drive --eval "await page.getByRole('button', { name: '导入资料', exact: true }).click(); return await page.getByRole('dialog').count();"
```

- 用无障碍角色和名字定位，不用坐标，不用 DOM 位置。
- 一步一个动作。先看当前状态，再动作，再看结果。
- 跑一段现成的旅程：`pnpm twh drive --script verify-web`。名字不带 `.mjs`，可用的名字在 `studio/scripts/` 下以 `verify-` 开头。
- 按改动挑旅程：`pnpm twh verify --affected origin/main..HEAD`，加 `--dry-run` 只列不跑，加 `--desktop` 连桌面端一起跑。
- 每个功能怎么到达、怎么驱动、有什么坑，看 `features/README.md` 的索引，再读对应的 `features/<功能>.md`。地图里列了几个入口，就都要走，只挑方便的那一个不算验证完。
- 数据缺前置条件时报告失败，把原因写进那个功能的 Gotchas。不要为了能过而削弱步骤。

## Evidence（证据）

```bash
pnpm twh evidence screenshot 回信列表
pnpm twh evidence aria 回信列表
```

存进 `studio/.runtime/evidence/<运行号>/`。证明的标准：

- 走用户的路径，不走内部的测试接口。
- 既截动作，也截动作之后的状态，不只截最后一屏。
- 界面之外的结果也要看：写了哪个文件、存了什么值。改动存储的，把值读回来。
- 需要前后对比的，改动前先截基线。
- 截图里可能带着私人内容时不要落盘，只留最少的那几张。这个 skill 启动的实例只有演示库，不会有这个问题。

## Cleanup（清理）

```bash
pnpm twh cleanup
```

关浏览器、停服务、删临时工作区，核对端口确实不再监听。证据保留。成功、失败、超时、中断都要清理；每轮失败的尝试之后也清理，不要把进程和端口留到下一轮。只杀自己启动的，不按名字杀进程。

## Helpers（随附脚本）

| 文件 | 作用 |
| --- | --- |
| `scripts/twh.mjs` | 上面这些命令的入口。`pnpm twh help` 看全部 |
| `scripts/twh/driver.mjs` | 驾驭进程，launch 时在后台启动，独占实例的生命周期 |
| `scripts/verify-*.mjs` | 现成的旅程，每个自带启动和清理 |
| `scripts/installed-app-session.mjs` | 驱动已安装的桌面应用时用它，不要直接 `_electron.launch` |
