# 理解自己：洞察总览

「理解自己」把个人主线、反复循环、现实系统和思维模型放在同一张判断地图里：先看结论，再决定要不要展开。用户可以按分类快速跳转，读聚焦的那条判断，展开主线卡的核心判断、循环卡的触发与代价、系统的关键要点，切换模型的摘要与校准，并一路点到完整页面；觉得不像自己，可以从这里带着一句提问去核对。浏览器和 Mac 客户端行为一致，没有桌面专属部分。

## Sub-features

- `insights-hub` 页面汇总四类判断，右上角显示总条数。
- `insights-quick-jump` 顶部的四个锚点跳到对应分区。
- `insights-spotlight` 聚焦最近更新的一条判断，「查看完整推理」进入它的卡片。
- `insights-line-cards` 个人主线卡可展开核心判断，「打开完整主线」进入完整页面。
- `insights-cycle-flow` 以第一条循环为例，显示触发、惯性反应、代价、有效中断四段。
- `insights-cycle-cards` 循环卡可展开四段详情，「查看完整循环」进入完整页面。
- `insights-system-picker` 点一个现实系统显示关键要点，再点一次收起。
- `insights-model-cards` 思维模型卡可在摘要与校准之间切换。
- `insights-open-full` 每个分区的「查看全部 N 条」进入对应分类的完整列表。
- `insights-ask` 「一起核对」带着一句提问打开右侧 Agent 对话，默认只读。
- `insights-empty` 某一类还没有内容时，分区里显示一句说明。

## How to get to it (user POV)

- 侧边栏「已有理解 → 理解自己」，路由 `/insights`。
- 总览页（`/knowledge`）的「理解自己」入口卡。
- 分区标题旁的「查看全部 N 条」，进入个人主线、反复循环、现实系统或思维模型的完整列表。
- 聚焦卡的「查看完整推理」，展开后的「打开完整主线」「查看完整循环」「打开完整系统」，以及思维模型卡的标题。
- 标题栏「搜索与命令」，输入「理解自己」后选带「前往栏目」的那一项。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- 旧地址 `/understanding/self` 自动跳到 `/insights`。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 演示库的四类判断都已有内容，所以每个分区都有卡片或条目。
- 配置目录是全新的，没有绑定在这个页面上的对话。第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 这几步只读。卡片右上角的「更多文件操作」会真的重命名或删除页面，不要碰。

- **打开理解自己。** 点侧边栏「已有理解 → 理解自己」。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '理解自己' })).toBeVisible(); await expect(page.locator('main .loading')).toHaveCount(0); return { title: await page.locator('.desktop-window-title').innerText(), stat: await page.locator('.insights-head-stat').innerText(), jump: await page.locator('.insights-quick-jump a').allTextContents() };"`。窗口标题是 `理解自己 · <知识库名>`；右上角是一个数字加「条判断与模型」；返回的四个锚点各带着自己分区的条数。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，「一起核对」只能走到输入框出现。
- **从总览的入口卡进入。** 点总览页的「理解自己」入口卡。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.locator('.understanding-entry').filter({ hasText: '理解自己' }).click(); await expect(page).toHaveURL(origin + '/insights'); await expect(page.getByRole('heading', { level: 1, name: '理解自己' })).toBeVisible(); return page.url();"`。地址变成 `/insights`，看到的是理解自己页。
- **快速跳转。** 点顶部锚点里的「现实系统」。运行 `pnpm twh drive --eval "const jump = page.getByRole('navigation', { name: '快速跳转到理解分类' }); await expect(jump.getByRole('link')).toHaveCount(4); await jump.getByRole('link', { name: /现实系统/ }).click(); await expect(page).toHaveURL(/#insights-systems/); return page.url();"`。地址末尾多出 `#insights-systems`。
- **聚焦卡进入完整推理。** 点聚焦卡右侧的「查看完整推理」。运行 `pnpm twh drive --eval "const spotlight = page.locator('.insights-spotlight'); await expect(spotlight).toBeVisible(); const title = await spotlight.locator('h2').innerText(); await spotlight.getByRole('link', { name: /查看完整推理/ }).click(); await expect(page.locator('.source-file-shell')).toBeVisible(); return { spotlight: title, url: page.url() };"`。落到四类分类页之一，左侧出现列表栏，地址带着选中项。
- **个人主线卡展开核心判断，进入完整主线。** 点第一张主线卡的「看核心判断」，再点「打开完整主线」。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "const card = page.locator('.insights-line-card').first(); await card.getByRole('button', { name: '看核心判断', exact: true }).click(); await expect(card.getByRole('button', { name: '收起判断', exact: true })).toHaveAttribute('aria-expanded', 'true'); const title = await card.locator('h3').innerText(); await card.getByRole('link', { name: '打开完整主线', exact: true }).click(); expect(page.url().startsWith(origin + '/cards/personal-lines')).toBe(true); await expect(page.locator('.source-file-shell')).toBeVisible(); return { card: title, url: page.url() };"`。按钮变成「收起判断」，卡片里多出「打开完整主线」；点它进入个人主线的卡片页，地址带着选中的那条。
- **循环卡展开详情，进入完整循环。** 点第一张循环卡的「展开详情」，再点「查看完整循环」。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "const card = page.locator('.insights-loop-card').first(); await card.getByRole('button', { name: '展开详情', exact: true }).click(); await expect(card.getByRole('button', { name: '收起详情', exact: true })).toHaveAttribute('aria-expanded', 'true'); await expect(card.locator('.cycle-stages')).toBeVisible(); const title = await card.locator('h3').innerText(); await card.getByRole('link', { name: '查看完整循环', exact: true }).click(); expect(page.url().startsWith(origin + '/cards/cycles')).toBe(true); return { card: title, url: page.url() };"`。按钮变成「收起详情」，四段循环出现；点「查看完整循环」进入反复循环的卡片页。
- **现实系统选中，进入完整系统。** 点列表里第一个系统，再点「打开完整系统」。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "const first = page.locator('.insights-system-grid button[aria-controls=insights-system-detail]').first(); await first.click(); await expect(first).toHaveAttribute('aria-expanded', 'true'); const detail = page.locator('#insights-system-detail'); await expect(detail).toBeVisible(); const title = await first.locator('b').innerText(); await expect(detail.locator('h3')).toContainText(title); await detail.getByRole('link', { name: /打开完整系统/ }).click(); expect(page.url().startsWith(origin + '/cards/systems')).toBe(true); return { system: title, url: page.url() };"`。选中后下方出现「<系统名> · 关键要点」和「打开完整系统」；点它进入现实系统的卡片页。
- **现实系统再点一次收起。** 点列表里第一个系统，再点一次。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "const first = page.locator('.insights-system-grid button[aria-controls=insights-system-detail]').first(); await first.click(); const detail = page.locator('#insights-system-detail'); await expect(detail).toBeVisible(); await first.click(); await expect(first).toHaveAttribute('aria-expanded', 'false'); await expect(detail).toHaveCount(0); return '要点已收起';"`。再点一次后要点消失。
- **思维模型卡切换摘要与校准。** 回到理解自己，点第一张模型卡的「校准」。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "const card = page.locator('.insights-model-card').first(); const tabs = card.getByRole('tablist'); await expect(tabs.getByRole('tab', { name: '摘要', exact: true })).toHaveAttribute('aria-selected', 'true'); await tabs.getByRole('tab', { name: '校准', exact: true }).click(); await expect(tabs.getByRole('tab', { name: '校准', exact: true })).toHaveAttribute('aria-selected', 'true'); return (await card.locator('.insights-model-panel').innerText()).slice(0, 60);"`。「校准」页签被选中；返回值是校准页的前 60 个字。
- **从模型标题进入思维模型页。** 点第一张模型卡的标题。运行 `pnpm twh drive --eval "const card = page.locator('.insights-model-card').first(); const title = await card.locator('h3').innerText(); await card.locator('h3 a').click(); await expect(page.locator('.document-readonly-title')).toHaveText(title); return page.url();"`。进入思维模型页，预览标题就是刚才点的模型，地址带着 `model=`。
- **查看全部。** 点现实系统分区的「查看全部 N 条」。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "await page.locator('#insights-systems').getByRole('link', { name: /查看全部/ }).click(); expect(page.url().startsWith(origin + '/cards/systems')).toBe(true); await expect(page.getByRole('heading', { level: 1, name: '现实系统' }).first()).toBeVisible(); return page.url();"`。进入现实系统的完整列表页。
- **旧地址跳转。** 运行 `pnpm twh go /understanding/self` 和 `pnpm twh drive --eval "await expect(page).toHaveURL(origin + '/insights'); return page.url();"`。地址被替换成 `/insights`。
- **搜索与命令直达。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('理解自己'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/insights'); return page.url();"`。面板关闭，落在理解自己页。
- **一起核对。** 点页面底部的「一起核对」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '一起核对', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); const prompt = await page.locator('.context-agent-composer textarea').inputValue(); await expect(prompt).toMatch(/我想一起核对这页已有的理解/); await expect(page.locator('.context-agent-boundary')).toHaveCount(0); return prompt.slice(0, 40);"`。右侧对话打开，输入框里已经带好一句提问，模式下拉默认「自动模式」，没有边界提示行（见 Gotchas）。没有模型时发送按钮是禁用的，不要点发送。
- **整段旅程：路由加载。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它证明了 `/insights` 在 1440 和 1024 两档宽度加载完成、侧边栏有激活项；这一页的卡片交互没有任何现成脚本走过。静态比对，未核实运行结果。
- **整段旅程：桌面端同一路由。** 运行 `pnpm twh drive --script verify-desktop`。Mac 客户端，走真实 IPC。它证明了 `/insights` 在桌面端加载完成。静态比对，未核实运行结果。
- **留证。** 运行 `pnpm twh go /insights`、`pnpm twh evidence screenshot insights-hub` 和 `pnpm twh evidence aria insights-hub`。两份证据里都能看到「理解自己」标题、四个分区和顶部锚点。

## Gotchas

- 每个分区只露出前面几条：主线 4 条、循环 3 条、系统 6 条、模型 3 个。完整的要去「查看全部」。
- 聚焦卡选的是最近更新的一条，演示库里是哪一条未核实，所以只断言它能点、落到分类页。
- 模型的「校准」页在正文里没有可单独展示的边界或反例时，会显示一句说明而不是空白，不要断言它的内容。
- 英文界面下演示库的标题会被英文覆盖层替换，窗口标题也会变。本文件的名称都按中文写。
- `verify-file-menus.mjs` 最后一段会到 `/insights` 点卡片的文件菜单，但它更早的在 `/cards/personal-lines` 用了已不存在的 `.collection-list`，走不到这里。未核实运行结果。
- `verify-agent-routes.mjs` 走到 `/insights` 时去找 `.context-agent-attached-context`，这个类名在提交 09313cb 之后已经不存在。见 `inspector.md`。未核实运行结果。
