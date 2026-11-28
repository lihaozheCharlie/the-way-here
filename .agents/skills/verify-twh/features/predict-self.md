# 看见未来：预测自己

「看见未来」从用户过去的选择和习惯出发，给出几条可能的生活路径。演示库自带一份预测报告：情景树从「现在的我」分出几种未来，点一条能按「五年生活、经历依据、整体节奏」三步读下去，跳到原文，再看健康、工作、娱乐、爱四个维度会怎样变化、要注意什么；用户可以写下自己的想法让预测更贴近自己。还没有报告的知识库先看到「先扫描资料」的引导。浏览器和 Mac 客户端行为一致，没有桌面专属部分。

## Sub-features

- `predict-report` 有报告时页头是「看见未来」和「重新预测」，下方是情景树。
- `predict-scenario-tree` 情景树以「现在的我」为根，每条未来带估计概率，点选后高亮。
- `predict-reading-steps` 每条未来分「五年生活、经历依据、整体节奏」三步，可前后翻。
- `predict-evidence` 「经历依据」说明概率从哪来，能展开会改变判断的因素和原文，跳到原文后可「返回看见未来」。
- `predict-dimensions` 四个维度各自可折叠，选中未来后显示有利因素、需要关注的前提和行动项。
- `predict-current` 点「现在的我」回到不带未来的对照视图。
- `predict-thoughts` 「写下你的想法 ↓」跳到想法输入框；想法有字数上限，不会写进原始记录。
- `predict-save-thoughts` 「保存想法，更新预测」带着想法重新预测，需要可用模型。
- `predict-regenerate` 资料变化后提示「有更新，可以重新预测了」，可「暂时不用」。
- `predict-assessment` 「查看了解度依据」显示四个维度的覆盖程度。
- `predict-lock` 没有报告且了解度不够时，先「开始扫描」，显示解锁进度。
- `predict-ready` 了解度够了但还没有报告时，出现「预测未来」。
- `predict-ask` 这个页面的右侧 Agent 对话默认是只读。
- `predict-notify` 预测完成时，Mac 客户端不在前台会发系统通知。

## How to get to it (user POV)

- 侧边栏「看见未来」，路由 `/predict-self`。Mac 客户端还有菜单「显示 → 看见未来」。
- 情景树里的「现在的我」和每条未来；「写下你的想法 ↓」。
- 所选未来里的「五年生活、经历依据、整体节奏」「看看经历依据 →」「看看整体节奏 →」「← 上一步」。
- 「经历依据」里「查看原文 · N 条」下的原文链接。
- 四个维度的标题行，点它折叠或展开；「查看了解度依据」。
- 标题栏「搜索与命令」，输入「看见未来」后选带「前往栏目」的那一项。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- 旧地址 `/understanding/ahead` 自动跳到 `/predict-self`。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 演示库自带一份预测报告（五种未来、已达到了解度门槛），所以打开就是报告页。换成一个没有报告的知识库时页面长得不一样，见最后一步和 Gotchas。
- 配置目录是全新的，没有绑定在这个页面上的对话。第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 这几步只读。「重新预测」「保存想法，更新预测」「开始扫描」都会真的启动一次任务，不要点。

- **打开看见未来。** 点侧边栏「看见未来」。运行 `pnpm twh go /predict-self` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '看见未来' })).toBeVisible(); await expect(page.locator('.prediction-header .prediction-refresh')).toHaveText('重新预测'); await expect(page.locator('.life-scenario-map .prediction-root')).toBeVisible(); return { title: await page.locator('.desktop-window-title').innerText(), updated: await page.locator('.prediction-date').innerText() };"`。窗口标题是 `看见未来 · <知识库名>`；页头有「重新预测」，情景树可见；`updated` 形如「更新于 某日 · 根据当时的记录与想法生成」。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，「打开右侧对话」只能走到输入框出现。
- **情景树。** 看情景树，点第一条未来。运行 `pnpm twh drive --eval "const map = page.locator('.life-scenario-map'); const futures = map.locator('.prediction-branches button'); const count = await futures.count(); await expect(futures.first()).toHaveAttribute('aria-pressed', 'true'); const labels = await map.locator('.life-edge-labels span').allTextContents(); return { futures: await futures.locator('b').allTextContents(), labels, count, now: await map.locator('.prediction-root span').innerText() };"`。`futures` 是五种未来的标题，`labels` 是它们各自的路径类型，`now` 是「现在的我」的描述；第一条默认被选中。
- **切换未来。** 点第二条未来。运行 `pnpm twh drive --eval "const futures = page.locator('.life-scenario-map .prediction-branches button'); const title = await futures.nth(1).locator('b').innerText(); await futures.nth(1).click(); await expect(futures.nth(1)).toHaveAttribute('aria-pressed', 'true'); const detail = page.getByRole('article', { name: '所选生活情景' }); await expect(detail.locator('h2').first()).toHaveText(title); await expect(detail.getByRole('button', { name: '看看经历依据 →', exact: true })).toBeVisible(); return { picked: title, step: await detail.locator('.prediction-detail-head span').innerText() };"`。第二条被选中，下方的详情标题就是它，步骤显示 `1 / 3`。
- **三步阅读。** 点「看看经历依据 →」，再点「看看整体节奏 →」，再点「← 上一步」。运行 `pnpm twh drive --eval "const detail = page.getByRole('article', { name: '所选生活情景' }); const steps = detail.getByRole('navigation', { name: '阅读步骤' }); await detail.getByRole('button', { name: '看看经历依据 →', exact: true }).click(); await expect(steps.getByRole('button', { name: '经历依据', exact: true })).toHaveAttribute('aria-current', 'step'); await expect(detail.locator('.prediction-evidence-estimate')).toBeVisible(); await detail.getByRole('button', { name: '看看整体节奏 →', exact: true }).click(); await expect(steps.getByRole('button', { name: '整体节奏', exact: true })).toHaveAttribute('aria-current', 'step'); await expect(detail.locator('ol.life-stages > li').first()).toBeVisible(); await detail.getByRole('button', { name: '← 上一步', exact: true }).click(); await expect(steps.getByRole('button', { name: '经历依据', exact: true })).toHaveAttribute('aria-current', 'step'); return await detail.locator('.prediction-detail-head span').innerText();"`。三步依次被标为当前步骤，最后回到「经历依据」，返回 `2 / 3`。
- **从依据跳到原文。** 展开「查看原文 · N 条」，点第一条原文链接，再点返回。运行 `pnpm twh drive --eval "const detail = page.getByRole('article', { name: '所选生活情景' }); await detail.locator('.prediction-evidence-sources > summary').click(); const sources = detail.locator('.prediction-source'); const count = await sources.count(); const cue = await sources.first().locator('h3').innerText(); await sources.locator('a').first().click(); const back = page.locator('.reader .context-back'); await expect(back).toContainText('返回看见未来'); const opened = page.url(); await back.click(); await expect(page).toHaveURL(origin + '/predict-self'); return { evidence: count, firstCue: cue, opened };"`。展开后能数出依据条数；点原文进入 `/page/…`，返回按钮写着「返回看见未来」，点它回到预测页。
- **四个维度。** 点「工作」的标题行。运行 `pnpm twh drive --eval "const rows = page.locator('.life-dimensions .dim-row'); await expect(rows).toHaveCount(4); const names = await rows.locator('.dim-row-summary b').allTextContents(); await expect(rows.first()).toHaveAttribute('open', ''); await rows.nth(1).locator('.dim-row-summary').click(); await expect(rows.nth(1)).toHaveAttribute('open', ''); await expect(rows.first()).not.toHaveAttribute('open', ''); return names;"`。四个维度是「健康、工作、娱乐、爱」，默认展开第一个；点「工作」后变成它展开。
- **回到现在的我。** 点情景树的根节点。运行 `pnpm twh drive --eval "await page.locator('.life-scenario-map .prediction-root').click(); await expect(page.getByRole('article', { name: '所选生活情景' })).toHaveCount(0); await expect(page.locator('.life-dimensions h2').first()).toContainText('现在的你，以及想去的方向'); return '已回到现在的我';"`。所选未来的详情消失，四个维度的标题变成「现在的你，以及想去的方向」。
- **写下想法。** 点「写下你的想法 ↓」，在输入框里写一句，再还原。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '写下你的想法 ↓', exact: true }).click(); const thoughts = page.locator('#prediction-thoughts'); await expect(thoughts).toBeFocused(); const before = await thoughts.inputValue(); await thoughts.fill('匿名验收：想成为一个不后悔自己选择的人。'); await expect(page.locator('.prediction-thoughts-footer p')).toContainText('/ 4000'); await thoughts.fill(before); return { restored: await thoughts.inputValue(), counter: await page.locator('.prediction-thoughts-footer p').innerText() };"`。按钮把焦点送到输入框；输入后计数变化；还原后 `restored` 等于原来的内容。不要点「保存想法，更新预测」。
- **了解度依据。** 点「查看了解度依据」。运行 `pnpm twh drive --eval "await page.locator('.prediction-assessment > summary').click(); await expect(page.locator('.prediction-facet')).toHaveCount(4); return await page.locator('.prediction-facet').evaluateAll(nodes => nodes.map(node => node.querySelector('span').textContent + ' ' + node.querySelector('meter').value + '/' + node.querySelector('meter').max));"`。返回四个维度各自的覆盖分数，形如「健康 16/25」。
- **旧地址跳转。** 运行 `pnpm twh go /understanding/ahead` 和 `pnpm twh drive --eval "await expect(page).toHaveURL(origin + '/predict-self'); return page.url();"`。地址被替换成 `/predict-self`。
- **搜索与命令直达。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('看见未来'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/predict-self'); return page.url();"`。面板关闭，落在看见未来页。
- **打开右侧对话。** 点标题栏的对话按钮。运行 `pnpm twh go /predict-self` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.context-agent-boundary')).toHaveText('严格只读，不会改动任何文件'); return await page.locator('#context-agent-title').innerText();"`。右侧对话打开，标题「一起往下想」，边界提示是只读。没有模型时发送按钮是禁用的，不要点发送。
- **还没有报告的知识库。** 先用 `knowledge-bases.md` 新建一个知识库并切过去，再打开看见未来。运行 `pnpm twh go /predict-self` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '基于过去的选择和习惯，看看未来可能通向的几条路' })).toBeVisible(); await expect(page.locator('.prediction-unlock-progress > li')).toHaveCount(3); await expect(page.getByRole('button', { name: '开始扫描', exact: true })).toBeAttached(); return await page.locator('.prediction-lock h2').innerText();"`。看到的是「先看看记录够不够，再谈以后」的引导，解锁进度三步，以及「开始扫描」。不要点「开始扫描」。
- **整段旅程：路由与侧边栏位置。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它对这一页的断言是：十个主路由（含 `/predict-self`）在 1440 和 1024 两档宽度加载；在 `/predict-self` 上侧边栏「看见未来」处于激活，「梦境」排在它下面。预测报告本身的交互没有任何现成脚本走过。静态比对，未核实运行结果。
- **整段旅程：桌面端的同一断言。** 运行 `pnpm twh drive --script verify-desktop`。Mac 客户端，走真实 IPC。它证明了 `/predict-self` 在桌面端加载完成，以及同样的侧边栏位置关系。静态比对，未核实运行结果。
- **留证。** 运行 `pnpm twh go /predict-self`、`pnpm twh evidence screenshot predict-self` 和 `pnpm twh evidence aria predict-self`。两份证据里都能看到情景树、所选未来的详情和四个维度。

## Gotchas

- 页面有三种样子，取决于这个知识库的状态：有报告（演示库）、了解度够了但没有报告、了解度不够。本文件的步骤按「有报告」写；换知识库后标题和按钮都会变，不要套用。未核实：新建的知识库在服务端是否确实处于「还没扫描」状态；如果不是，最后一步的标题会对不上。
- 情景多于三个时情景树可以横向滚动，节点不会都在视口里。演示库是五种。
- 切换未来后四个维度会重置为默认展开第一个。
- Mac 客户端的菜单「显示 → 看见未来」只负责跳到 `/predict-self`，没有快捷键。菜单本身没法只靠 `page` 和 `expect` 去点，未核实。
- 预测完成的系统通知只在 Mac 客户端、且应用不在前台时出现，需要真实模型跑完一次预测，没有现成脚本覆盖。未核实。
- 「重新预测」「保存想法，更新预测」「开始扫描」在浏览器实例里没有可用模型时的实际提示文案未核实，本文件不断言。
- 英文界面下页面的中文按钮名都会变。本文件的名称都按中文写。
