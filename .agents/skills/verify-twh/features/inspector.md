# 右侧检查器、浮动面板、命令面板、分离窗口与菜单

右侧的 Agent 对话是全应用共用的一个对话面板：用户从标题栏的对话按钮或页面里的入口打开它，带着这页的上下文聊，可以翻「聊过的事」，调宽，收起后再打开草稿还在。标题栏的「搜索与命令」能找栏目、找内容、执行两条常用命令。Mac 客户端另外有原生菜单、一组快捷键，以及只读的独立阅读窗口和「深入聊聊」独立窗口。标记 `"desktopOnly": true`：本功能以 Mac 客户端为准，浏览器里只能验证面板、命令面板和带 `?detached=true` 的只读页面。

## Sub-features

- `inspector-toggle` 标题栏的对话按钮打开与收起；默认收起。
- `inspector-overlay` 面板浮在正文上面，不改变正文的宽度。
- `inspector-draft` 收起不清草稿；Esc 收起并把焦点还给按钮。换到别的页面才会清草稿。
- `inspector-per-menu` 开合按左侧栏目分别记住，回到原来的栏目会重新打开。
- `inspector-context` 从页面入口打开时带上这页的上下文，输入框的占位文字会变。
- `inspector-default-mode` 每个页面有自己的默认模式（只读或写入），面板下方写着这一模式的边界。
- `inspector-mode` 对话模式下拉可切：自动、聊天、Wiki 只读、Wiki 写入。
- `inspector-offline` 没有可用模型时提示去偏好设置，发送按钮禁用。
- `inspector-history` 「聊过的事」列出这个知识库里的对话；可以开始新话题、删除对话。
- `inspector-run` 回答进行中显示进度，可停止；需要时出现确认请求；结束后可继续聊、重新生成、复制。
- `inspector-build` 「整理成日记并构建 Wiki」把对话整理成日记并更新有依据的页面。
- `inspector-settings` 输入框旁的模型按钮打开 AI 设置小窗，Esc 只关小窗。
- `inspector-width` 拖动或用左右方向键调宽度，双击分隔条恢复默认，宽度会记住。
- `command-palette` 标题栏「搜索与命令」：去栏目、找内容、「新建随手记」「打开偏好设置」、查看全部搜索结果。
- `command-shortcuts` Mac 客户端的菜单和快捷键。
- `detached-reader` 独立阅读窗口只读，没有标题栏按钮和对话面板。仅 Mac 客户端。
- `conversation-window` 「深入聊聊」独立窗口，接着当前话题聊。仅 Mac 客户端。

## How to get to it (user POV)

- 标题栏的对话按钮（火花图标）。Mac 客户端对应菜单「显示 → AI 协作面板」（⌘⌥I）。Esc 或面板右上角的关闭按钮收起。
- 页面里的入口：「已有理解」的「一起核对」、「理解自己」的「一起核对」、「值得聊聊」的「聊聊这个」、回信页的视角按钮、梦里的「以此聊聊」。
- 面板右上角的「聊过的事」；输入框下方的模式选择和模型按钮。
- 面板左缘的分隔条。
- 标题栏的搜索按钮。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- Mac 客户端菜单：「The Way Here → 偏好设置…、隐私与数据使用」；「文件 → 随手记（⌘N）、导入生活记录…（⌘O）、在独立窗口打开（⌘↩）、深入聊聊（⌘⇧F）」；「显示 → 看见未来、返回（⌘[）、前进（⌘]）」；「知识库 → 打开知识库 1 到 9」；「窗口 → 主窗口」；菜单栏托盘的「随手记」「打开 The Way Here」。
- Mac 客户端里，带 `detached` 的地址在独立窗口里打开；`/conversation` 是深入聊聊窗口。

## Driving it with twh

Preconditions:

- `"desktopOnly": true`。Web 端只能验证到：面板的开合与草稿、模式切换、历史空状态、AI 设置小窗、命令面板、宽度调整、`?detached=true` 的只读页面。原生菜单、快捷键在桌面宿主里的触发、独立的新窗口，只用 `page` 和 `expect` 走不到，见 Gotchas。
- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 实例里还没有任何对话，页面上没有绑定过对话。
- 配置目录是全新的，第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 这几步不发送消息。真的发送会调用模型并可能改写知识库。

- **打开对话面板。** 点标题栏的对话按钮。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "const panel = page.locator('.floating-agent-panel'); await expect(panel).toBeHidden(); const main = page.locator('.main-area'); const before = await main.evaluate(node => node.getBoundingClientRect().width); await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(panel).toBeVisible(); await expect(page.getByRole('button', { name: '收起Agent对话', exact: true })).toHaveAttribute('aria-expanded', 'true'); await expect(page.locator('.context-agent-panel')).toHaveAttribute('data-run-id', ''); const after = await main.evaluate(node => node.getBoundingClientRect().width); await expect(after).toBe(before); return { title: await page.locator('#context-agent-title').innerText(), widthBefore: before, widthAfter: after };"`。面板默认是收起的；打开后标题是「一起往下想」，没有选中任何对话；正文区域的宽度前后相等。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，下面的步骤都停在发送之前。
- **Esc 收起，草稿还在。** 在输入框里写一句，按 Esc，再点对话按钮。运行 `pnpm twh drive --eval "const panel = page.locator('.floating-agent-panel'); const input = panel.getByRole('textbox'); await input.fill('匿名验收草稿'); await page.keyboard.press('Escape'); await expect(panel).toBeHidden(); await expect(page.getByRole('button', { name: '打开Agent对话', exact: true })).toBeFocused(); await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(input).toHaveValue('匿名验收草稿'); return { panelHiddenThenReopened: true, draft: await input.inputValue() };"`。Esc 后面板收起，焦点回到对话按钮；再打开，输入框里还是那句话。
- **这个页面默认只读。** 看模式下拉和它下面的边界提示。运行 `pnpm twh drive --eval "await expect(page.locator('.agent-mode-picker summary')).toContainText('自动模式'); await expect(page.locator('.context-agent-boundary')).toHaveCount(0); const placeholder = await page.locator('.context-agent-composer textarea').getAttribute('placeholder'); return placeholder;"`。下拉默认「自动模式」，普通页面的对话面板没有边界提示行（见 Gotchas），占位文字是「想从哪里开始？」。
- **切换对话模式。** 点模式下拉，选「Wiki 写入模式」。运行 `pnpm twh drive --eval "const picker = page.locator('.agent-mode-picker'); await picker.locator('summary').click(); const menu = picker.getByRole('group', { name: '选择对话模式' }); await menu.getByRole('button', { name: 'Wiki 写入模式', exact: true }).click(); await expect(picker.locator('summary')).toContainText('Wiki 写入模式'); await expect(picker.locator('summary')).toHaveAttribute('aria-label', '对话模式：Wiki 写入模式'); return '已切到写入模式';"`。下拉的文字变成「Wiki 写入模式」。边界提示写的是这个页面自己的默认模式，不跟着下拉变。
- **没有模型时的提示。** 运行 `pnpm twh drive --eval "if ((await page.locator('.context-agent-offline').count()) === 0) return '这个实例有可用模型，跳过这一步'; await expect(page.locator('.context-agent-offline')).toContainText('请在偏好设置中连接 AI 助手'); await expect(page.locator('.context-agent-send')).toBeDisabled(); return await page.locator('.context-agent-offline').innerText();"`。没有可用模型时输入框下方写着「暂时无法开始对话；请在偏好设置中连接 AI 助手。」，发送按钮是禁用的。
- **聊过的事：还没有对话。** 点面板右上角的「聊过的事」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: /^聊过的事，/ }).click(); await expect(page.locator('#context-agent-title')).toHaveText('聊过的事'); await expect(page.locator('.context-history-empty')).toContainText('我们还没有聊过'); await expect(page.getByRole('button', { name: '开始新话题', exact: true })).toBeVisible(); await page.getByRole('button', { name: '开始聊聊', exact: true }).click(); await expect(page.locator('#context-agent-title')).toHaveText('一起往下想'); return await page.locator('.context-history-scope').count();"`。历史页标题是「聊过的事」，显示「我们还没有聊过」；点「开始聊聊」回到输入状态，返回 0。
- **AI 设置小窗。** 点输入框旁的模型按钮，按 Esc。运行 `pnpm twh drive --eval "const panel = page.locator('.floating-agent-panel'); await panel.getByRole('button', { name: 'AI 设置', exact: true }).click(); await expect(page.locator('.agent-settings-dialog')).toBeVisible(); await expect(page.locator('.agent-settings-dialog').getByRole('heading', { name: 'AI 设置', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('.agent-settings-dialog')).not.toBeVisible(); await expect(panel).toBeVisible(); return '只关掉了小窗';"`。小窗打开后按 Esc，只有小窗关闭，对话面板还在。
- **从页面入口打开：带着这页的话题。** 在「值得聊聊」点一张话题卡的「聊聊这个」。运行 `pnpm twh go /questions` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '聊聊这个', exact: false }).first().click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.agent-mode-picker summary')).toContainText('自动模式'); await expect(page.locator('.context-agent-composer textarea')).toHaveAttribute('placeholder', /已经带上了这页的上下文/); return await page.locator('.agent-topic-strip span').innerText();"`。面板自动打开，模式是「自动模式」，占位文字写着已经带上了这页的上下文；返回值是带上的话题标题。
- **从页面入口打开：不带话题。** 在「已有理解」点「一起核对」。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '一起核对', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.agent-new-topic')).toContainText('想从哪里开始？'); return await page.locator('.context-agent-composer textarea').getAttribute('placeholder');"`。面板打开，显示「想从哪里开始？」的起手提示，占位文字也是「想从哪里开始？」。
- **开合按栏目记住，换页面会清草稿。** 在输入框里写一句，点侧边栏「生活记录」，再点「总览」。运行 `pnpm twh drive --eval "const panel = page.locator('.floating-agent-panel'); const nav = page.getByRole('navigation', { name: '主要导航' }); await panel.getByRole('textbox').fill('匿名验收草稿'); await nav.getByRole('link', { name: '生活记录', exact: true }).click(); await expect(page).toHaveURL(origin + '/sources'); await expect(panel).toBeHidden(); await nav.getByRole('link', { name: '总览', exact: true }).click(); await expect(page).toHaveURL(origin + '/knowledge'); await expect(panel).toBeVisible(); await expect(panel.getByRole('textbox')).toHaveValue(''); return '生活记录下收起，回到总览重新打开，草稿已清空';"`。到「生活记录」时面板是收起的；回到「总览」又打开，但输入框是空的。
- **命令面板：去栏目。** 点标题栏的搜索按钮，输入一个栏目名。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await expect(page.getByRole('dialog', { name: '搜索与命令' })).toBeVisible(); await expect(palette.locator('input')).toBeFocused(); await palette.locator('input').fill('人生轨迹'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/timeline'); await expect(palette).toHaveCount(0); return page.url();"`。面板打开时焦点在输入框；选「前往栏目」后落在人生轨迹页，面板关闭。
- **命令面板：找内容。** 运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('个人操作系统'); const option = palette.getByRole('option').filter({ hasText: '已有理解' }).first(); await expect(option).toBeVisible(); const picked = await option.innerText(); await option.click(); return { picked, url: page.url() };"`。结果里出现一条属于「已有理解」的内容，点开后地址在 `/page/…` 下。
- **命令面板：Esc 关闭。** 运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '搜索与命令' })).toHaveCount(0); return '面板已关闭';"`。Esc 直接关闭命令面板。
- **命令面板：打开偏好设置。** 运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('偏好'); await palette.getByRole('option').filter({ hasText: '打开偏好设置' }).click(); if (await page.evaluate(() => Boolean(window.desktop))) return '桌面宿主：打开了独立的设置窗口'; await expect(page).toHaveURL(origin + '/preferences'); return page.url();"`。浏览器里落到偏好设置；Mac 客户端里打开独立的设置窗口。
- **命令面板：新建随手记。** 运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('随手记'); await palette.getByRole('option').filter({ hasText: '新建随手记' }).click(); if (await page.evaluate(() => Boolean(window.desktop))) return '桌面宿主：打开了随手记窗口'; await expect(page).toHaveURL(origin + '/capture'); return page.url();"`。浏览器里落到随手记页；Mac 客户端里打开随手记窗口。
- **调整宽度。** 点一下面板左缘的分隔条，按右方向键，再按左方向键。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); const panel = page.locator('.floating-agent-panel'); const handle = page.getByRole('separator', { name: '调整 Agent 对话宽度' }); const width = () => panel.evaluate(node => Math.round(node.getBoundingClientRect().width)); const before = await width(); await handle.press('ArrowRight'); await expect.poll(width).toBe(before - 16); await handle.press('ArrowLeft'); await expect.poll(width).toBe(before); return { before, after: await width() };"`。右方向键让面板窄 16 像素，左方向键让它回到原来的宽度。
- **浏览器里用 ⌘K 打开命令面板。** 运行 `pnpm twh drive --eval "if (await page.evaluate(() => Boolean(window.desktop))) return '桌面宿主：⌘K 由原生菜单处理，跳过这一步'; await page.locator('#main-content').focus(); await page.keyboard.press('Meta+k'); await expect(page.getByRole('dialog', { name: '搜索与命令' })).toBeVisible(); await page.keyboard.press('Escape'); return '浏览器里 ⌘K 打开了命令面板';"`。浏览器里快捷键直接打开命令面板；Mac 客户端里由原生菜单负责，这一步跳过。
- **分离阅读是只读的。** 打开带 `detached` 的地址，点一下正文。运行 `pnpm twh go "/letters?detached=true"` 和 `pnpm twh drive --eval "await expect(page.locator('.source-preview .editable-document-body')).toBeVisible(); await expect(page.locator('.source-preview .editable-document-activate')).toHaveCount(0); await page.locator('.source-preview .editable-document-body').click(); await expect(page.locator('[data-document-editor]')).toHaveCount(0); await expect(page.locator('.agent-toggle')).toHaveCount(0); await expect(page.locator('.floating-agent-panel')).toHaveCount(0); return page.url();"`。正文可读，但没有可编辑区域，点它也不会进入编辑；窗口里没有对话按钮和对话面板。Mac 客户端里用 ⌘↩ 新开的独立阅读窗口看到的就是这个样子。
- **深入聊聊窗口的页面。** 运行 `pnpm twh go "/conversation?detached=true&title=匿名话题"` 和 `pnpm twh drive --eval "await expect(page.locator('.conversation-window .context-agent-panel')).toBeVisible(); await expect(page.locator('#context-agent-title')).toHaveText('一起往下想'); await expect(page.locator('.agent-toggle')).toHaveCount(0); await expect(page.locator('.floating-agent-panel')).toHaveCount(0); return page.url();"`。只有对话面板，没有标题栏的对话按钮，也没有浮动面板。Mac 客户端里用 ⌘⇧F 新开的窗口加载的就是这个地址。
- **整段旅程：进行中的任务不怕换页。** 运行 `pnpm twh drive --script verify-background-navigation`。浏览器加真实本地服务，任务接口被拦截，不调用模型。它证明了历史里有一个话题、打开一个进行中的任务后出现「停止任务」、换到别的栏目任务还在跑且可以找回、只有显式点「停止任务」才中断。静态比对与当前源码一致，未核实运行结果。
- **整段旅程：命令面板找内容。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它证明了标题栏按钮打开命令面板、输入关键词、从结果打开一条已索引的内容。同一脚本里「聊聊这个」带着话题打开面板的断言排在已经过时的随手记段落之后（见 `capture.md` 的 Gotchas），按静态比对走不到。未核实运行结果。
- **整段旅程：浮在正文上的面板。** 运行 `pnpm twh drive --script verify-floating-agent`。Mac 客户端。它前半段证明了打开面板不改变正文宽度、拖动分隔条加宽 180 像素、右方向键窄 16 像素、收起再打开宽度不变、刷新后宽度还在。后半段期待的 776 和 960 取自旧的宽度上限（提交 9e2b327 把上限从 960 改成 760），按静态比对会失败。未核实运行结果。
- **整段旅程：一层只关一层。** 运行 `pnpm twh drive --script verify-dismiss-layers`。Mac 客户端。它前半段证明了 Esc 收起对话并把焦点还给按钮、草稿还在、AI 设置小窗和命令面板各自关闭而对话面板保留。从第 53 行起它去找已不再渲染的 `.source-connections-popover`，按静态比对会失败。未核实运行结果。
- **整段旅程：宽度被记住。** 运行 `pnpm twh drive --script verify-preferences`。Mac 客户端。它在重启后读回了对话面板宽度的偏好值，证明这个宽度跨重启保留。未核实运行结果。
- **留证。** 运行 `pnpm twh go /knowledge`、`pnpm twh drive --eval "await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); return await page.locator('#context-agent-title').innerText();"`、`pnpm twh evidence screenshot inspector-open` 和 `pnpm twh evidence aria inspector-open`。两份证据里都能看到右侧打开的对话面板。

## Gotchas
- 边界提示行（.context-agent-boundary）只在锁定模式的入口渲染（来源页和回信页的构建入口，全部 autoSubmit，面板随即切到运行视图，抓不到稳定状态）；普通页面的对话面板没有这一行。模式选择器改的是提交时生效的对话模式，不影响这行提示。

- 面板默认收起。开合按左侧栏目分别记住：在这个栏目打开过，换到别的栏目是收起的，回来才重新打开。只有「生活记录」例外，它的开合会写进偏好，重新加载也记得；所以上面的步骤都放在「已有理解」下做。
- 草稿只在收起和展开之间保留。换了页面（栏目或页面上下文变了）草稿就清空，这是预期行为。
- `verify-agent-routes.mjs` 期待面板在九个栏目之间一直可见、去找 `.context-agent-attached-context`、并要求输入区为空。提交 2ee3d90 之后开合改为按栏目记忆，提交 09313cb 之后这个类名不存在，输入区现在有「想从哪里开始？」的起手提示。这个脚本不能当作本功能的证据。未核实运行结果。
- `PRODUCT.md` 写的「当前 / 历史两个页签和 48px 折叠栏」在当前源码里不存在。现在是一个浮动的对话面板，历史用「聊过的事」按钮进入。
- 有绑定在这页上的对话时，面板打开直接进那段对话，而不是输入状态。上面「默认只读」「没有模型时的提示」两步要求没有绑定过的对话。
- 对话面板在工具窗口里没有：偏好设置和随手记两页不渲染它，也没有标题栏的对话按钮。
- 命令面板的结果分三种：栏目（写着「前往栏目」）、两条命令（「新建随手记」「打开偏好设置」）、搜索到的内容（写着「生活记录」或「已有理解」）。搜索结果有短暂延迟，按文字去筛时等它出现。
- 浏览器里页面自己处理 ⌘K、⌘,、⌘N、⌘O、⌘⌥I、⌘↩、⌘⇧F、⌘1 到 ⌘9；Mac 客户端里这些由原生菜单处理，用 `page.keyboard` 合成的按键不一定触发菜单。除 ⌘K 外的快捷键在两种宿主下都没有验证过，未核实。
- 原生菜单本身没法只靠 `page` 和 `expect` 去点。`verify-desktop.mjs` 是在主进程里直接调用菜单项的，那超出了 `--eval` 的作用域，未核实怎么在 twh 里做。
- 独立阅读窗口（⌘↩）和深入聊聊窗口（⌘⇧F）会新开窗口。在浏览器里对应的是新标签页。用 `page.context()` 去接新页面的做法没有现成脚本走过，未核实；上面只验证了它们的页面内容。
- `/conversation` 的页面没有任何现成脚本走过。定位来自 `ConversationWindow.tsx` 和 `AppShell.tsx`，运行结果未核实。
- 页面入口里，回信页的视角按钮在 `letters.md` 里走。梦里的「以此聊聊」要先有一个醒来的梦，没有匿名的路径走到，未核实。
- 英文界面下按钮名都会变。本文件的名称都按中文写。
