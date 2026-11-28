# 近况回信：阅读与版本历史

「近况回信」把过去的记录写成回到此刻的信。用户按时间或沿主题读回信，看它写于何时、依据哪段材料、涉及哪些主题；可以请 Agent 从某个人物视角重读，新写的一封成为这封信的新版本，原信保留，随时能在「历史版本」里切换；也可以「主动写一封」。浏览器和 Mac 客户端行为一致，没有桌面专属部分。

## Sub-features

- `letters-list` 左侧回信列表，点哪封读哪封，地址带 `letter=`。
- `letters-read` 右侧读信；原始回信可以直接编辑，Esc 退出。
- `letters-shelf` 回信列表可收起、再展开，阅读区随之变宽变窄。
- `letters-filter` 「按时间阅读」按写信年份筛选，「沿主题追踪」按主题筛选；当前范围没有回信时显示空态。
- `letters-provenance` 正文上方的来历条：写于哪天、依据哪段材料、相关主题。
- `letters-compose` 「主动写一封」打开写信窗口，有填空引导和自由描述两种方式。
- `letters-lens` 「默认视角 / 某人视角」打开视角面板，选一个视角会把重读请求带进右侧对话。
- `letters-lens-tooltip` 视角项悬停或键盘聚焦时显示这个人物的说明。
- `letters-history` 有生成版本时出现「历史版本」菜单，列出原始回信和每个版本的时间。
- `letters-history-banner` 看历史版本时正文上方有提示，「回到最新版本」一键回去。
- `letters-generated-link` 读生成版本时下方有「查看生成对话」。
- `letters-file-menu` 每封回信右侧的「更多文件操作」：重命名、打开原始目录、删除。
- `letters-ask` 这个页面的右侧 Agent 对话默认是写入模式。

## How to get to it (user POV)

- 侧边栏「已有理解 → 近况回信」，路由 `/letters`。
- 总览页（`/knowledge`）的「近况回信」入口卡。
- 直接打开 `/letters?letter=<回信页面 id>`（看历史版本时再多一个 `version=`），一进来就读那一封。
- 标题栏「搜索与命令」，输入「近况回信」后选带「前往栏目」的那一项。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- 进来之后，页面里的这些控件属于这一页：回信列表里的某一封、列表栏右上角的收起按钮、阅读方式旁的年份或主题下拉框、「主动写一封」、正文标题旁的「历史版本」和视角按钮。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 演示库有三封回信，所以「切换回信」要求列表至少两封。
- 当前知识库能取到人物视角，正文标题旁才有视角按钮。全新实例里它没有生成过任何回信版本，所以看不到「历史版本」按钮，这是正确行为；版本历史的驱动在下面用整段旅程。
- 配置目录是全新的，没有绑定在这个页面上的对话。第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 这几步只读。回信右侧的「更多文件操作」和正文编辑都会真的改文件，不要碰。

- **打开近况回信。** 点侧边栏「已有理解 → 近况回信」。运行 `pnpm twh go /letters` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '近况回信' })).toBeVisible(); await expect(page.locator('.source-file-pane')).toHaveAttribute('aria-label', '回信列表'); await expect(page.locator('.source-preview .editable-document-body')).toBeVisible(); const selected = page.locator('.source-file-select[aria-current=true]'); await expect(selected).toHaveCount(1); return { title: await page.locator('.desktop-window-title').innerText(), count: await page.locator('.letters-page-count').innerText(), selected: await selected.locator('b').innerText() };"`。窗口标题是 `近况回信 · <知识库名>`；列表里恰好一封处于选中，右侧能读到它的正文；`count` 是「N」加「封回信」。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，「换视角重读」只能走到请求被带进输入框。
- **从总览的入口卡进入。** 点总览页的「近况回信」入口卡。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.locator('.understanding-entry').filter({ hasText: '近况回信' }).click(); await expect(page).toHaveURL(origin + '/letters'); return page.url();"`。地址变成 `/letters`。
- **切换回信。** 点列表第二封。运行 `pnpm twh drive --eval "const items = page.locator('.source-file-row .source-file-select'); const title = await items.nth(1).locator('b').innerText(); await items.nth(1).click(); await expect(items.nth(1)).toHaveAttribute('aria-current', 'true'); await expect(page.locator('.source-preview .editable-document-body')).toBeVisible(); return { selected: title, url: page.url() };"`。第二封带 `aria-current="true"`，地址带上 `letter=`。
- **带 letter 的地址可以直接打开。** 把上一步返回的 `url` 原样再打开一次。运行 `pnpm twh go "<上一步返回的 url>"` 和 `pnpm twh drive --eval "const selected = page.locator('.source-file-select[aria-current=true]'); await expect(selected).toHaveCount(1); return { selected: await selected.locator('b').innerText(), url: page.url() };"`。一打开选中的就是刚才那一封，返回的 `selected` 和上一步一样。这条命令里的地址要照上一步的返回值填，不是固定文字。
- **收起再展开回信列表。** 点列表栏右上角的收起按钮，再点一次。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '收起回信列表', exact: true }).click(); await expect(page.locator('.source-file-contents')).toBeHidden(); await page.getByRole('button', { name: '展开回信列表', exact: true }).click(); await expect(page.locator('.source-file-contents')).toBeVisible(); return '列表已恢复';"`。收起后列表内容不可见，展开后回来。
- **阅读方式与筛选。** 点「沿主题追踪」，再点「按时间阅读」。运行 `pnpm twh drive --eval "const modes = page.getByRole('group', { name: '回信阅读方式' }); await modes.getByRole('button', { name: '沿主题追踪', exact: true }).click(); await expect(modes.getByRole('button', { name: '沿主题追踪', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('combobox', { name: '按回信主题筛选' })).toBeVisible(); await modes.getByRole('button', { name: '按时间阅读', exact: true }).click(); await expect(modes.getByRole('button', { name: '按时间阅读', exact: true })).toHaveAttribute('aria-pressed', 'true'); return await page.getByRole('combobox', { name: '按写信年份筛选' }).locator('option').allTextContents();"`。切到主题时下拉框变成「按回信主题筛选」；切回时间后返回的选项是「全部年份 · N」和每年一项。
- **来历条。** 看正文上方的来历。运行 `pnpm twh drive --eval "const provenance = page.locator('.letter-provenance'); await expect(provenance).toBeVisible(); await expect(provenance.locator('time').first()).toHaveAttribute('datetime', /^[0-9]{4}-[0-9]{2}-[0-9]{2}/); await expect(page.locator('.source-preview .document-meta-row')).toHaveCount(0); return await provenance.innerText();"`。来历条里有「写于」和一个日期；这页不显示普通的文件属性行。
- **编辑原始回信。** 在正文上按 Enter，再按 Esc。运行 `pnpm twh drive --eval "const body = page.locator('.source-preview .editable-document-activate'); await body.press('Enter'); await expect(page.locator('[data-document-editor]')).toBeFocused(); await page.keyboard.press('Escape'); await expect(body).toBeVisible(); return await page.locator('[data-document-editor]').count();"`。按 Enter 后编辑器获得焦点；Esc 后回到阅读状态，返回的编辑器数量是 0。不要在这一步输入内容。
- **主动写一封。** 点「主动写一封」，在窗口里点「自由描述」，再点关闭。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '主动写一封', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '主动写一封回信' }); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: '生成回信', exact: true })).toBeDisabled(); await dialog.getByRole('button', { name: '自由描述', exact: true }).click(); await expect(dialog.getByRole('textbox', { name: '说说你想收到怎样的回信' })).toBeVisible(); await page.getByRole('button', { name: '关闭写信窗口', exact: true }).click(); await expect(dialog).toHaveCount(0); return '写信窗口已关闭';"`。写信窗口打开时「生成回信」是禁用的；切到自由描述后出现描述框；关闭后窗口消失。「生成回信」需要可用模型，不要点。
- **换视角重读。** 点正文标题旁的视角按钮，选第一个可选的视角。运行 `pnpm twh drive --eval "await page.locator('.letter-lens-trigger').click(); const popover = page.locator('.letter-lens-popover'); await expect(popover).toBeVisible(); const choices = popover.locator('.letter-lens-choice'); const count = await choices.count(); await popover.locator('.letter-lens-choice:not([disabled])').first().click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.context-output-target')).toContainText('视角回信'); const prompt = await page.locator('.context-agent-composer textarea').inputValue(); await expect(prompt).toMatch(/独立人物视角版本/); return { lenses: count, notice: await page.locator('.context-output-target').innerText() };"`。右侧对话打开，上方写着「将保留为「某人视角回信」」，输入框里已经带好重读请求。没有模型时发送按钮是禁用的，不要点发送。
- **搜索与命令直达。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('近况回信'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/letters'); return page.url();"`。面板关闭，落在近况回信页。
- **打开右侧对话。** 点标题栏的对话按钮。运行 `pnpm twh go /letters` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.context-agent-boundary')).toHaveText('只更新真正受影响的理解；原始笔记正文保持不变'); return await page.locator('#context-agent-title').innerText();"`。右侧对话打开，标题「一起往下想」，边界提示写着只更新受影响的理解。
- **整段旅程：阅读、版本菜单与重读。** 运行 `pnpm twh drive --script verify-letter-reading`。Mac 客户端，演示库是临时拷贝；它拦截了对话记录和人物视角两个接口，伪造了三个回信版本，不调用模型。它证明了阅读区的几何关系（列表收起与展开时正文宽度、间距）、标题在上来历条在下、有版本时出现「历史版本」、菜单里能选版本并标出「当前查看」、看旧版本时出现「你正在查看历史版本」、「回到最新版本」回到最新、「原始回信」可以进入编辑、九个视角的悬浮提示不出屏、选一个视角后请求里带着「保留为回信版本」的目标。静态比对与当前源码一致，未核实运行结果。
- **整段旅程：历史版本的键盘操作。** 运行 `pnpm twh drive --script verify-letter-history`。Mac 客户端，伪造方式同上。它证明了选版本后正文和提示条跟着变、菜单里时间戳和「当前查看」、按 End 跳到最后一项、Esc 关闭并把焦点还给按钮、再点按钮或点别处会关掉菜单、窗口缩到 1100 宽时菜单不出屏。静态比对与当前源码一致，未核实运行结果。
- **整段旅程：回信列表开合。** 运行 `pnpm twh drive --script verify-shared-file-browser`。Mac 客户端。它证明了生活记录和回信共用同一套列表与正文样式、「收起回信列表 / 展开回信列表」。它在第 43 行等的是 `.source-preview textarea`，而正文编辑器自提交 1a6107f 起是 CodeMirror（`[data-document-editor]`），按静态比对会在那里失败，后面的 1100 宽布局走不到。未核实运行结果。
- **整段旅程：回信的文件菜单。** 运行 `pnpm twh drive --script verify-file-menus`。Mac 客户端。它前半段证明了回信的文件菜单是「重命名、打开原始目录、删除」，「打开原始目录」发出请求，「重命名」改文件名并刷新列表，「删除」先可取消、再确认后消失。它在第 57 行用了已不存在的 `.collection-list`，按静态比对会在回信段落之后失败。未核实运行结果。
- **留证。** 运行 `pnpm twh go /letters`、`pnpm twh evidence screenshot letters-reading` 和 `pnpm twh evidence aria letters-reading`。两份证据里都能看到左侧回信列表、右侧正文和它上方的来历条。

## Gotchas

- 默认读的是当前范围里最新的一封。切换年份或主题会重新选第一封，并清掉 `letter=` 和 `version=`。
- 「历史版本」只在这封信至少有一个生成版本时出现；只有一个版本时没有菜单。全新实例没有生成版本，看不到按钮不是失败。生成版本要靠真实模型，或用上面两个整段旅程的伪造数据。
- 看生成版本时正文是只读的，没有可编辑正文；只有「原始回信」能进入编辑。
- 视角按钮的名字随这封信有没有记录视角而变：没记录时叫「默认视角。点击选择一个视角重读」，记录了叫「某人视角。点击换一个视角重读」。用 `.letter-lens-trigger` 去找，别写死名字。`verify-web` 写死了前一种，换一封有视角的回信就匹配不到。
- 人物视角来自知识引擎的视角目录。配置里没有挂上知识引擎时取不到视角，视角按钮不出现。
- 「生成回信」和「换视角重读」都要可用模型。没有模型时右侧对话会提示「暂时无法开始对话；请在偏好设置中连接 AI 助手。」，发送按钮禁用。
- 英文界面下演示库的标题会被英文覆盖层替换，窗口标题也会变。本文件的名称都按中文写。
- 未核实：演示库里三封回信是否各自带视角记录；这决定「换视角重读」打开面板后是否已有「当前」项。
