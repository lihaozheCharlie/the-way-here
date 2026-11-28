# 人生轨迹：时间线与人生阶段

「人生轨迹」按时间从现在往回列出每个人生阶段，标出转折和并行的生命线。用户点一个阶段，下方就展开它的关系图（相关的人、地点、生活系统）和关键事件；点图上的节点、事件或阶段标题会在只读弹窗里预览对应页面，地址不变；关系图可以缩放和放大查看。浏览器和 Mac 客户端行为一致，没有桌面专属部分。

## Sub-features

- `timeline-list` 时间线从「现在」往回列出阶段，带时间段、标题、摘要，以及「人生主线 / 并行人生线 · N 个转折」。
- `timeline-select` 点一个阶段选中它，地址带 `stage=`，下方切换到这个阶段。
- `timeline-stage-header` 阶段标题区显示时间段、标题和这一阶段的焦点，点标题打开只读预览。
- `timeline-network` 关系图以阶段为根，连到相关的人、地点、生活系统三类分组。
- `timeline-network-fold` 点分组标题可折叠或展开这一类的连线。
- `timeline-preview` 点根节点、叶子节点或关键事件，在只读弹窗里预览页面，Esc 关闭，地址不变。
- `timeline-events` 「关键事件」区列出这个阶段的事件和日期；事件多时可滚动，事件少时带摘要。
- `timeline-zoom` 关系图可缩小、放大、适应画布、放大查看。
- `timeline-letters` 阶段关联的近况回信列在关系图下方，点开是只读预览。
- `timeline-file-menu` 每个阶段右侧的「更多文件操作」：重命名、打开原始目录、删除。
- `timeline-ask` 这个页面的右侧 Agent 对话默认是写入模式。

## How to get to it (user POV)

- 侧边栏「已有理解 → 人生轨迹」，路由 `/timeline`。
- 总览页（`/knowledge`）的「人生轨迹」入口卡。
- 直接打开 `/timeline?stage=<阶段页面 id>`，一进来就选中那个阶段。
- 标题栏「搜索与命令」，输入「人生轨迹」后选带「前往栏目」的那一项。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- 旧地址 `/understanding/life` 自动跳到 `/timeline`。
- 进来之后，页面里的这些控件都通向只读预览：阶段标题区的大标题、关系图里的根节点和叶子节点、「关键事件」里的事件、关系图下方的近况回信。关系图右上角是缩放和放大查看。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 演示库至少有两个阶段，且至少有一个阶段带关键事件和关联的人、地点或系统，所以「选第二个阶段」「关键事件预览」「叶子预览」都有东西可点。
- 配置目录是全新的，没有绑定在这个页面上的对话。第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 这几步只读。阶段右侧的「更多文件操作」会真的重命名或删除阶段页面，不要碰。

- **打开人生轨迹。** 点侧边栏「已有理解 → 人生轨迹」。运行 `pnpm twh go /timeline` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '人生轨迹' })).toBeVisible(); const stages = page.locator('button.understanding-timeline-item'); await expect(stages.first()).toBeAttached(); await expect(page.locator('button.understanding-timeline-item.is-selected')).toHaveCount(1); return { title: await page.locator('.desktop-window-title').innerText(), count: await stages.count(), banner: await page.locator('.understanding-banner-count').innerText(), url: page.url() };"`。窗口标题是 `人生轨迹 · <知识库名>`；恰好有一个阶段处于选中；返回的阶段数就是时间线上可点的阶段数，标题右侧的数字是阶段数与转折数之和。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，「打开右侧对话」只能走到输入框出现。
- **从总览的入口卡进入。** 点总览页的「人生轨迹」入口卡。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.locator('.understanding-entry').filter({ hasText: '人生轨迹' }).click(); await expect(page).toHaveURL(origin + '/timeline'); await expect(page.getByRole('heading', { level: 1, name: '人生轨迹' })).toBeVisible(); return page.url();"`。地址变成 `/timeline`。
- **选择阶段。** 点时间线第二个阶段，再点第一个。运行 `pnpm twh go /timeline` 和 `pnpm twh drive --eval "const stages = page.locator('button.understanding-timeline-item'); const second = await stages.nth(1).locator('b').innerText(); await stages.nth(1).click(); await expect(stages.nth(1)).toHaveClass(/is-selected/); await expect(page.locator('.stage-network-header h2')).toContainText(second); await expect(page).toHaveURL(/stage=/); const afterSecond = page.url(); const first = await stages.first().locator('b').innerText(); await stages.first().click(); await expect(stages.first()).toHaveClass(/is-selected/); await expect(stages.nth(1)).not.toHaveClass(/is-selected/); await expect(page.locator('.stage-network-header h2')).toContainText(first); return { second, afterSecond, first, afterFirst: page.url() };"`。选中的阶段带 `is-selected`，阶段标题区的大标题就是它，地址带 `stage=`；换一个阶段后三样一起变。
- **带 stage 的地址可以直接打开。** 把上一步返回的 `afterSecond` 原样再打开一次。运行 `pnpm twh go "<上一步返回的 afterSecond>"` 和 `pnpm twh drive --eval "const stages = page.locator('button.understanding-timeline-item'); await expect(stages.nth(1)).toHaveClass(/is-selected/); return { stage: await page.locator('.stage-network-header h2').innerText(), url: page.url() };"`。一打开第二个阶段就是选中的，标题区显示它。这条命令里的地址要照上一步的返回值填，不是固定文字。
- **预览阶段。** 点关系图里的根节点，按 Esc。运行 `pnpm twh drive --eval "const root = page.getByRole('button', { name: /预览阶段：/ }); await root.click(); const dialog = page.getByRole('dialog', { name: '文件预览' }); await expect(dialog).toBeVisible(); await expect(dialog.locator('textarea')).toHaveCount(0); await expect(dialog.locator('[data-document-editor]')).toHaveCount(0); const url = page.url(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); return { sameUrl: url === page.url() };"`。弹出只读的「文件预览」，里面没有编辑器；Esc 后弹窗消失，地址没有变。
- **点阶段标题也能预览。** 点阶段标题区的大标题。运行 `pnpm twh drive --eval "await page.locator('.stage-network-header h2 button').click(); await expect(page.getByRole('dialog', { name: '文件预览' })).toBeVisible(); await page.getByRole('button', { name: '关闭文件预览', exact: true }).click(); await expect(page.getByRole('dialog', { name: '文件预览' })).toHaveCount(0); return '已关闭';"`。同样打开「文件预览」，点右上角关闭按钮后消失。
- **关系分组折叠。** 点关系图里第一个分组（相关的人）的标题，再点一次。运行 `pnpm twh drive --eval "const graph = page.locator('.stage-focus-network .graph-viewport'); const leaves = graph.locator('.stage-network-leaf'); const before = await leaves.count(); const category = graph.locator('.stage-tree-category').first(); await category.click(); await expect(category).toHaveAttribute('aria-expanded', 'false'); const after = await leaves.count(); await category.click(); await expect(category).toHaveAttribute('aria-expanded', 'true'); return { before, after, restored: await leaves.count() };"`。分组的 `aria-expanded` 先变 `false` 再变 `true`，叶子数量相应减少又恢复。
- **叶子节点预览。** 点关系图里第一个叶子节点，再点关闭按钮。运行 `pnpm twh drive --eval "const leaf = page.locator('.stage-focus-network .stage-network-leaf').first(); await leaf.click(); const dialog = page.getByRole('dialog', { name: '文件预览' }); await expect(dialog).toBeVisible(); const heading = await dialog.locator('h1').innerText(); await page.getByRole('button', { name: '关闭文件预览', exact: true }).click(); await expect(dialog).toHaveCount(0); return heading;"`。弹窗里的大标题就是预览的页面，关闭后消失。
- **关键事件预览。** 点「关键事件」里的第一件事，再点关闭按钮。运行 `pnpm twh drive --eval "const stages = page.locator('button.understanding-timeline-item'); const events = page.locator('.stage-focus-network .stage-event'); let name = ''; for (let i = 0; i < await stages.count(); i += 1) { name = await stages.nth(i).locator('b').innerText(); await stages.nth(i).click(); await expect(page.locator('.stage-network-header h2')).toContainText(name); if (await events.count() > 0) break; } await expect(events.first()).toBeAttached(); await events.first().click(); const dialog = page.getByRole('dialog', { name: '文件预览' }); await expect(dialog).toBeVisible(); const heading = await dialog.locator('h1').innerText(); await page.getByRole('button', { name: '关闭文件预览', exact: true }).click(); await expect(dialog).toHaveCount(0); return { stage: name, preview: heading };"`。它会依次选阶段，停在第一个带关键事件的阶段，点开后弹窗里是那件事的页面。没有任何阶段带关键事件时这一步会失败，那是前置条件没满足。
- **缩放与放大查看。** 点「放大图谱」「适应画布」「放大查看」，再按 Esc。运行 `pnpm twh drive --eval "const graph = page.locator('.stage-focus-network .graph-viewport'); await graph.getByRole('button', { name: '放大图谱', exact: true }).click(); await expect(graph.locator('output')).toHaveText('125%'); await graph.getByRole('button', { name: '适应画布', exact: true }).click(); await expect(graph.locator('output')).toHaveText('100%'); await graph.getByRole('button', { name: '放大查看', exact: true }).click(); const expanded = page.getByRole('dialog', { name: '阶段关系图谱放大查看' }); await expect(expanded).toBeVisible(); await page.keyboard.press('Escape'); await expect(expanded).toHaveCount(0); return '缩放和放大查看可用';"`。缩放比例先到 `125%` 再回到 `100%`；「放大查看」打开一个大图弹窗，Esc 关闭。
- **旧地址跳转。** 运行 `pnpm twh go /understanding/life` 和 `pnpm twh drive --eval "await expect(page).toHaveURL(origin + '/timeline'); return page.url();"`。地址被替换成 `/timeline`。
- **搜索与命令直达。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('人生轨迹'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/timeline'); return page.url();"`。面板关闭，落在人生轨迹页。
- **打开右侧对话。** 点标题栏的对话按钮。运行 `pnpm twh go /timeline` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.agent-mode-picker summary')).toContainText('自动模式'); await expect(page.locator('.context-agent-boundary')).toHaveCount(0); return await page.locator('#context-agent-title').innerText();"`。右侧对话打开，标题「一起往下想」，模式下拉默认「自动模式」，没有边界提示行（见 Gotchas）。没有模型时发送按钮是禁用的，不要点发送。
- **整段旅程：桌面端路由。** 运行 `pnpm twh drive --script verify-desktop`。Mac 客户端，走真实 IPC。它证明了 `/timeline` 在桌面端加载完成且侧边栏有激活项。静态比对，未核实运行结果。
- **整段旅程：选阶段与预览。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它对时间线的断言是：选第二个阶段后出现阶段标题、「预览阶段」打开只读弹窗。但这几行排在已经过时的随手记段落之后（见 `capture.md` 的 Gotchas），按静态比对走不到。未核实运行结果。
- **留证。** 运行 `pnpm twh go /timeline`、`pnpm twh evidence screenshot timeline-stage` 和 `pnpm twh evidence aria timeline-stage`。两份证据里都能看到时间线、选中的阶段和它的关系图。

## Gotchas

- 新进入页面时默认选中「当前」的那个阶段，地址里没有 `stage=`；点过一次阶段后才有。
- 时间线的顺序是从现在往回，和接口返回的顺序不同。不要按位置去对应某个固定阶段，用按钮里的标题去对。
- 只读弹窗的名字是「文件预览」。`verify-stage-focus.mjs` 找的是「只读文件预览」（提交 1a6107f 改的名），所以它的时间线与人物关系图放大查看段落都会卡在第一处弹窗。未核实运行结果。
- `verify-file-menus.mjs` 会到 `/timeline` 点阶段的文件菜单，但它更早的在 `/cards/personal-lines` 用了已不存在的 `.collection-list`，走不到这里。阶段文件菜单的菜单项是「重命名、打开原始目录、删除」，点「重命名」会真的改阶段页面的文件名。
- 英文界面下演示库的标题会被英文覆盖层替换，窗口标题也会变。本文件的名称都按中文写。
- 未核实：演示库里哪几个阶段带关键事件、哪个分组有叶子。「关键事件预览」会自己找第一个带事件的阶段；如果所有阶段都没有事件，那是前置条件没满足。关系图下方的近况回信按钮取决于这个阶段有没有关联的回信，演示库里是否有未核实，上面没有单独走。
