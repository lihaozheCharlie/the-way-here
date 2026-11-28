# 梦境：从分岔点重梦一次

「梦境」让用户回到人生里的一个分岔时刻，选另一条路推演下去，再用后来的真实记录核对。用户可以从人生阶段里挑入梦点、自己描述一个、把不值得梦的忽略掉；入梦前确认时间、实际的选择和想梦见的假如；梦醒后读总结、人生路径图、每个节点的核对依据，收藏梦、把带回的句子收藏为洞察。浏览器和 Mac 客户端行为一致；只有「醒来通知」是 Mac 客户端独有的系统通知。

## Sub-features

- `dream-entry` 入口页：描述一个入梦点直接入梦，或从人生阶段里挑，下面是「我的梦境」。
- `dream-filter` 梦境列表按全部、做梦中、已醒来、已收藏筛选。
- `dream-points` 入梦点按人生阶段分组，每条带日期和「人生记录 / 梦过 N 次 / 你的自述」。
- `dream-discover` 「重新发现」找新的入梦点，并提示新发现几个。
- `dream-point-preference` 入梦点可以收藏、取消收藏；不是分岔的可以忽略、再恢复。
- `dream-point-tabs` 入梦点来源：按人生阶段、我描述的、已收藏、已忽略。
- `dream-describe` 「描述一个入梦点」：回到哪个时刻、大概什么时候、实际选了什么、后来发生了什么。
- `dream-prepare` 「入梦准备」：确认入梦时间、实际选择、想梦见的假如（最多三条）、梦多远、补充记得的事。
- `dream-prepare-suggest` 「推荐几个假如」让模型给备选，也可以自己加。需要可用模型。
- `dream-start` 「入梦」开始推演；可以离开，醒来了通知。
- `dream-progress` 做梦中显示阶段进度，可停止，可继续核对。
- `dream-report` 醒来后读总结、人生路径图、路径对比、原始推演设定、资料缺口。
- `dream-node` 点路径节点看那时的处境和核对结果，跳到依据原文，以这个节点再梦一次，或补充纠正。
- `dream-favorite` 梦可以收藏；带回的句子可以「收藏为洞察」。
- `dream-insights` 「从梦境带回的洞察」汇总已收藏的句子，也出现在已有理解总览。
- `dream-delete` 删除梦境要先确认；已收藏为洞察的内容会留下。
- `dream-ask` 这个页面的右侧 Agent 对话默认是只读。

## How to get to it (user POV)

- 侧边栏「看见未来」下面的「梦境」，路由 `/dreams`。
- 入口页的输入框加「描述并入梦」；输入框下面的建议入口；「全部入梦点 · 重新发现」（`/dreams/points`）。
- 入梦点页的「＋ 描述我的入梦点」（`/dreams/describe`）；每个入梦点展开后的「从这里入梦」（`/dreams/prepare`）、「查看原始依据」。
- 梦境卡（`/dreams/<梦的 id>`，做梦中的是 `/dreams/<梦的 id>/progress`）；要已有梦才点得到。
- 入口页的「查看已收藏的洞察 →」和已有理解总览的「查看已收藏的洞察」（`/dreams/insights`）；要有已收藏的洞察才出现。
- 每页左上角的面包屑「梦境」。
- 标题栏「搜索与命令」，输入「梦境」后选带「前往栏目」的那一项。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- Mac 客户端里，梦醒来时的系统通知，点开就是那个梦。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。「入口页的建议入口」「重新发现」「忽略与恢复」以及「描述并入梦」到「已收藏的入梦点」这几步会往实例里写入入梦点和收藏。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。
- 实例是全新的，还没有任何梦，也没有收藏过入梦点；演示库里已经有从人生记录里找出的入梦点，所以入口页有建议入口，「忽略与恢复」「查看原始依据」都有东西可点。
- 配置目录是全新的，没有绑定在这些页面上的对话。第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 「入梦」「推荐几个假如」「继续核对」需要可用模型。下面只走到入梦准备，不点「入梦」；做梦的全过程用整段旅程。

- **从侧边栏进入。** 在「看见未来」页点下面的「梦境」。运行 `pnpm twh go /predict-self` 和 `pnpm twh drive --eval "const rows = page.locator('.desktop-navigation > .desktop-nav-row'); const future = rows.getByRole('link', { name: '看见未来', exact: true }); const dreams = rows.getByRole('link', { name: '梦境', exact: true }); await expect(future).toHaveClass(/active/); await expect(dreams.locator('svg')).toBeVisible(); await dreams.click(); await expect(dreams).toHaveAttribute('aria-current', 'page'); await expect(future).not.toHaveClass(/active/); await expect(page.getByRole('heading', { name: '今晚，在哪里入梦？' })).toBeVisible(); return { url: page.url(), title: await page.locator('.desktop-window-title').innerText() };"`。激活项从「看见未来」换成「梦境」，出现入口页；窗口标题是 `梦境 · <知识库名>`。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型。
- **入口页与筛选。** 点「已收藏」，再点「全部」。运行 `pnpm twh drive --eval "await expect(page.getByRole('textbox', { name: '描述入梦点' })).toBeVisible(); await expect(page.getByRole('button', { name: '描述并入梦', exact: true })).toBeDisabled(); await expect(page.getByRole('link', { name: '全部入梦点 · 重新发现', exact: true })).toBeVisible(); const filters = page.locator('.dream-segment').getByRole('button'); await expect(filters).toHaveCount(4); await filters.filter({ hasText: '已收藏' }).click(); await expect(filters.filter({ hasText: '已收藏' })).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.dream-empty')).toContainText('还没有收藏的梦'); await filters.filter({ hasText: '全部' }).click(); await expect(page.locator('.dream-empty')).toContainText('还没有梦'); return await page.locator('.dream-library-head').innerText();"`。输入框空着时「描述并入梦」是禁用的；四个筛选各能选中；全新实例在「已收藏」下显示「还没有收藏的梦」，在「全部」下显示「还没有梦」，返回「我的梦境 0 个梦」。
- **入口页的建议入口。** 点输入框下方第一个建议的入梦点，再点「取消」。运行 `pnpm twh go /dreams` 和 `pnpm twh drive --eval "const chips = page.locator('.dream-chips > button'); await expect(chips.first()).toBeAttached(); const label = await chips.first().innerText(); await chips.first().click(); await expect(page).toHaveURL(origin + '/dreams/prepare'); await expect(page.getByRole('heading', { name: '入梦准备' })).toBeVisible(); await page.getByRole('link', { name: '取消', exact: true }).click(); await expect(page).toHaveURL(origin + '/dreams'); return { suggestion: label, url: page.url() };"`。从建议直接进入 `/dreams/prepare` 的「入梦准备」；点「取消」回到入口页，没有开始做梦。
- **描述并入梦。** 在输入框里写一句，点「描述并入梦」。运行 `pnpm twh drive --eval "await page.getByRole('textbox', { name: '描述入梦点' }).fill('如果当时去另一座城市'); await expect(page.getByRole('button', { name: '描述并入梦', exact: true })).toBeEnabled(); await page.getByRole('button', { name: '描述并入梦', exact: true }).click(); await expect(page.getByRole('heading', { name: '描述一个入梦点' })).toBeVisible(); await expect(page.getByLabel(/你想回到哪个时刻/)).toHaveValue('如果当时去另一座城市'); return page.url();"`。进入 `/dreams/describe`，第一栏已经填着刚才那句。
- **保存为入梦点。** 填时间、当时的选择和后来的事，点「保存为入梦点」。运行 `pnpm twh drive --eval "await page.getByLabel(/大概是什么时候/).fill('2020-06-01'); await page.getByLabel(/当时实际选了什么/).fill('留在原城市'); await page.getByLabel(/之后发生了哪些大事/).fill('同年完成项目。'); await page.getByRole('button', { name: '保存为入梦点', exact: true }).click(); await expect(page.getByRole('button', { name: '我描述的 1', exact: true })).toHaveAttribute('aria-pressed', 'true'); return page.url();"`。回到入梦点页，「我描述的 1」被选中，地址是 `/dreams/points?tab=mine`。
- **收藏入梦点并进入入梦准备。** 展开刚描述的入梦点，点「收藏入梦点」，再点「从这里入梦」。运行 `pnpm twh drive --eval "const point = page.locator('details.dream-point').filter({ hasText: '如果当时去另一座城市' }); await point.locator('summary').click(); await point.getByRole('button', { name: '收藏入梦点', exact: true }).click(); await expect(point.getByRole('button', { name: '取消收藏入梦点', exact: true })).toBeVisible(); await point.getByRole('button', { name: '从这里入梦', exact: true }).click(); await expect(page.getByRole('heading', { name: '入梦准备' })).toBeVisible(); await page.getByRole('button', { name: '我记得不太一样，修改', exact: true }).click(); await expect(page.getByLabel('开始日期')).toHaveValue('2020-06-01'); return page.url();"`。收藏后按钮变成「取消收藏入梦点」；进入 `/dreams/prepare`，点「我记得不太一样，修改」后开始日期就是刚才填的那天。
- **自己加一个假如，然后取消。** 在「自己加一个假如」里写一句，点「添加」，再点「取消」。运行 `pnpm twh drive --eval "const add = page.getByRole('textbox', { name: '自己加一个假如' }); await add.fill('先做短期项目'); await page.getByRole('button', { name: '添加', exact: true }).click(); await expect(page.getByRole('checkbox', { name: /先做短期项目/ })).toBeVisible(); await page.getByRole('button', { name: '到 T 之后 3 年', exact: true }).click(); await expect(page.getByRole('button', { name: '到 T 之后 3 年', exact: true })).toHaveAttribute('aria-pressed', 'true'); await page.getByRole('link', { name: '取消', exact: true }).click(); await expect(page).toHaveURL(origin + '/dreams'); return '已回到入口页';"`。新假如出现在勾选列表里；「梦多远」能切到「到 T 之后 3 年」；点「取消」回到 `/dreams`，没有开始做梦。
- **已收藏的入梦点。** 打开入梦点页，点「已收藏」。运行 `pnpm twh go /dreams/points` 和 `pnpm twh drive --eval "const sources = page.locator('.dream-segment').getByRole('button'); await sources.filter({ hasText: '已收藏' }).click(); await expect(sources.filter({ hasText: '已收藏' })).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('details.dream-point').filter({ hasText: '如果当时去另一座城市' })).toBeVisible(); return await page.locator('details.dream-point').count();"`。「已收藏」下只有刚收藏的那一个，返回 1。
- **忽略与恢复。** 展开第一个入梦点，点「这不是分岔，忽略」，到「已忽略」里展开它，点「恢复入梦点」。运行 `pnpm twh go /dreams/points` 和 `pnpm twh drive --eval "await page.locator('.dream-segment').getByRole('button').filter({ hasText: '按人生阶段' }).click(); await page.locator('details.dream-point summary').first().click(); await page.getByRole('button', { name: '这不是分岔，忽略', exact: true }).click(); const sources = page.locator('.dream-segment').getByRole('button'); await sources.filter({ hasText: '已忽略' }).click(); await expect(sources.filter({ hasText: '已忽略' })).toHaveAttribute('aria-pressed', 'true'); await page.locator('details.dream-point summary').first().click(); await page.getByRole('button', { name: '恢复入梦点', exact: true }).click(); await expect(page.getByText('还没有忽略的入梦点')).toBeVisible(); return '已恢复';"`。忽略后它从「按人生阶段」消失、出现在「已忽略」；恢复后「已忽略」显示「还没有忽略的入梦点」。
- **从入口页进到入梦点页，再重新发现。** 点「全部入梦点 · 重新发现」，再点「重新发现」。运行 `pnpm twh go /dreams` 和 `pnpm twh drive --eval "await page.getByRole('link', { name: '全部入梦点 · 重新发现', exact: true }).click(); await expect(page).toHaveURL(origin + '/dreams/points'); await expect(page.getByRole('heading', { name: '入梦点', exact: true })).toBeVisible(); await page.getByRole('button', { name: '重新发现', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: /新发现|没有找到/ })).toBeVisible(); return await page.locator('.dream-note[role=status]').last().innerText();"`。先落在入梦点页；点「重新发现」后出现「新发现 N 个入梦点」或「这次没有找到新的入梦点。」。
- **查看原始依据。** 展开第一个入梦点，点「查看原始依据」，再点返回。运行 `pnpm twh go /dreams/points` 和 `pnpm twh drive --eval "await page.locator('details.dream-point summary').first().click(); const link = page.locator('details.dream-point').first().getByRole('link', { name: '查看原始依据', exact: true }); await expect(link).toBeAttached(); await link.click(); const back = page.locator('.reader .context-back'); await expect(back).toContainText('返回入梦点'); const opened = page.url(); await back.click(); await expect(page).toHaveURL(origin + '/dreams/points'); return opened;"`。进入这条入梦点对应的 `/page/…` 页面，返回按钮写着「返回入梦点」，点它回到入梦点页。
- **从入梦点页描述一个入梦点。** 点「＋ 描述我的入梦点」。运行 `pnpm twh go /dreams/points` 和 `pnpm twh drive --eval "await page.getByRole('link', { name: '＋ 描述我的入梦点' }).click(); await expect(page).toHaveURL(origin + '/dreams/describe'); await expect(page.getByRole('heading', { name: '描述一个入梦点' })).toBeVisible(); await expect(page.getByLabel(/你想回到哪个时刻/)).toHaveValue(''); return page.url();"`。进入 `/dreams/describe`，表单是空的。
- **直接打开入梦准备。** 运行 `pnpm twh go /dreams/prepare` 和 `pnpm twh drive --eval "await expect(page.locator('.dream-empty')).toContainText('先选择一个入梦点'); await page.getByRole('link', { name: '浏览入梦点', exact: true }).click(); await expect(page).toHaveURL(origin + '/dreams/points'); return page.url();"`。没有先选入梦点时看到「先选择一个入梦点」，「浏览入梦点」回到入梦点页。
- **洞察页的空状态。** 运行 `pnpm twh go /dreams/insights` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { name: '从梦境带回的洞察' })).toBeVisible(); await expect(page.getByText('还没有收藏的洞察')).toBeVisible(); await page.getByRole('link', { name: '返回梦境', exact: true }).click(); await expect(page).toHaveURL(origin + '/dreams'); return page.url();"`。全新实例显示「还没有收藏的洞察」，「返回梦境」回到入口页。
- **面包屑。** 运行 `pnpm twh go /dreams/points` 和 `pnpm twh drive --eval "await expect(page.getByRole('navigation', { name: '梦境导航' })).toContainText('入梦点'); await page.getByRole('navigation', { name: '梦境导航' }).getByRole('link', { name: '梦境', exact: true }).click(); await expect(page).toHaveURL(origin + '/dreams'); return page.url();"`。面包屑是「梦境 / 入梦点」，点「梦境」回到入口页。
- **搜索与命令直达。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('梦境'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/dreams'); return page.url();"`。面板关闭，落在梦境入口页。
- **打开右侧对话。** 点标题栏的对话按钮。运行 `pnpm twh go /dreams` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.agent-mode-picker summary')).toContainText('自动模式'); await expect(page.locator('.context-agent-boundary')).toHaveCount(0); return await page.locator('#context-agent-title').innerText();"`。右侧对话打开，标题「一起往下想」，模式下拉默认「自动模式」，没有边界提示行（见 Gotchas）。没有模型时发送按钮是禁用的，不要点发送。
- **整段旅程：做梦的全过程。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务；它只拦截了「开始入梦」和「推荐几个假如」两个接口，其余走真实服务。它的梦境段落证明了：入梦点按人生阶段分组且标题对得上、「重新发现」的提示、忽略与恢复、描述并入梦、保存后出现在「我描述的 1」、收藏入梦点、入梦准备里回填日期、推荐并勾选假如、梦多远、入梦进度停在「推演各条路径」、「离开去做别的，醒了通知我」后能在「做梦中」找回、醒来后的总结与人生路径图、节点核对依据与原文跳转、以节点再梦一次、补充纠正、年份切换、与上一版的差别、收藏与收藏为洞察、洞察出现在洞察页和已有理解总览、未核对的梦、删除梦境的取消与确认、来源梦境删除后的提示。这一段排在脚本已经过时的随手记段落之前。静态比对与当前源码一致，未核实运行结果。
- **整段旅程：桌面端的侧边栏与分组。** 运行 `pnpm twh drive --script verify-desktop`。Mac 客户端，走真实 IPC。它证明了在 `/predict-self` 上「看见未来」是激活项、「梦境」在它下面，点过去后入梦点按人生阶段分组。静态比对，未核实运行结果。
- **留证。** 运行 `pnpm twh go /dreams/points`、`pnpm twh evidence screenshot dreams-points` 和 `pnpm twh evidence aria dreams-points`。两份证据里都能看到「入梦点」标题、来源页签和按阶段分组的入梦点。

## Gotchas

- `/dreams/prepare` 里选了哪个入梦点只记在页面内存里。直接打开这个地址看不到准备页，只有「先选择一个入梦点」。
- 自己描述的入梦点在界面上删不掉，只能取消收藏。所以「描述并入梦」到「已收藏的入梦点」这几步只能在一次性的实例里做。
- 做梦、推荐假如、继续核对都要可用模型。没有模型时点「入梦」的实际报错文案未核实；有的时刻会被判断成「更适合聊聊」，页面会提示并给出「聊聊这段」。
- 梦醒的系统通知只在 Mac 客户端、且应用不在前台时出现；浏览器里没有。页内的梦境提示条也没有现成脚本走过，未核实。
- 梦和入梦点都按知识库隔离。带着别的知识库的梦的地址打开时，页面会显示「梦境在另一个知识库」并提供切换按钮，未核实。
- 梦境页面的文案没有走翻译，英文界面下正文仍是中文；但侧边栏的「梦境」会变成「Dreams」。本文件的名称都按中文写。
- 入梦点页的「已忽略」里，自己描述的入梦点不能被忽略（没有「这不是分岔，忽略」按钮），这是设计如此。
