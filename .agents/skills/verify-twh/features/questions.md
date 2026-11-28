# 值得聊聊

值得聊聊把还没说清的东西收成一面话题墙：已有理解里留下的问题、反复出现的状态、账单里带出的线索，或者没有材料时从一件小事开始的问法。用户挑一个话题，右侧 Agent 就带着这条话题的背景打开对话；也可以看依据、换一批、按自己给的方向要几个新问题、关掉不感兴趣的话题，并在往期话题里找回来。

## Sub-features

- `questions-wall` 话题墙：每批最多四张话题卡，标出话题类型和「N 条相关记录」。
- `questions-filter` 按类型筛选：全部、已有理解、状态线索、账单线索、随口话头，只列出当前有的类型。
- `questions-talk` 聊聊这个：带着话题背景打开右侧 Agent 对话，不自动发送。聊过的话题显示「继续聊」或「回看对话」。
- `questions-evidence` 查看依据：把证据页放在只读弹窗里打开，或者跳到对应的记录和线索页。
- `questions-shuffle` 换一批：轮换下一批话题。连换三批后出现「按你的方向找话题」。
- `questions-generate` 生成新话题：给一个方向，得到四个开放式问题。「开始聊」会直接发送。
- `questions-dismiss` 关闭这个话题：从话题墙拿掉，可以用「撤销」或在往期话题里恢复。
- `questions-history` 往期话题：按全部、已构建 Wiki、聊到一半、已关闭查看并继续。
- `questions-open-chat` 直接开聊：不挑话题，打开一个空白的对话输入框。

## How to get to it (user POV)

- 侧边栏「值得聊聊」，路由 `/questions`。
- 直接打开 `/questions`。
- 话题卡下方「聊聊这个」「继续聊」或「回看对话」打开这条话题的对话；卡上另有「看看依据」「查看依据」「看看它从哪里来」「看看相关记录」这类依据入口，具体是哪个取决于话题类型。
- 话题墙右上角的「往期话题」打开往期话题弹窗，「换一批」换下一批。
- 页面最下方「还有别的想聊的？直接跟我说」打开空白对话。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动。当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 首次启动的模型引导已经处理过。它只在 `/` 自动弹出，处理办法见 `capture.md`。
- 话题墙的内容取决于知识库里的数据。演示库目前可能只有一张「账单线索」话题卡，下面的步骤按「至少一张卡」写，不断言卡的数量。
- 打开对话不需要模型。本页的步骤都不往对话里发消息。

- **确认基线并打开值得聊聊。** 运行 `pnpm twh doctor`、`pnpm twh go /questions` 和 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang }; });"`。`doctor` 以退出码 0 结束；返回的对象里 `knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，这不影响本页的步骤。
- **看话题墙。** 运行 `pnpm twh drive --eval "await expect(page.getByRole('heading', { name: '这段时间你说的话，我都还记得。', exact: true })).toBeVisible(); await expect(page.locator('.questions-topic-card').first()).toBeVisible(); return { cards: await page.locator('.questions-topic-card').count(), filters: await page.locator('.questions-filters button').allTextContents(), kinds: await page.locator('.questions-topic-kind').allTextContents(), actions: await page.locator('.questions-wall-actions button').allTextContents() };"`。大标题「这段时间你说的话，我都还记得。」可见；`cards` 在 1 到 4 之间；`filters` 第一项是「全部」；`kinds` 是各卡的话题类型；`actions` 是「往期话题」和「换一批」两个按钮。
- **挑一个话题聊聊。** 点第一张话题卡下方的「聊聊这个」。运行 `pnpm twh drive --eval "const runs = () => page.evaluate(async () => (await (await fetch('/api/runs')).json()).length); const before = await runs(); await page.evaluate(() => { window.addEventListener('open-context-agent', event => { window.twhTopic = event.detail; }, { once: true }); }); const card = page.locator('.questions-topic-card').first(); const question = await card.locator('h3').innerText(); await card.getByRole('button', { name: /聊聊这个|继续聊|回看对话/ }).click(); await expect(page.locator('.context-agent-panel')).toBeVisible(); await expect(page.locator('.agent-topic-opener')).toBeVisible(); return { question, opener: await page.locator('.agent-topic-opener b').innerText(), placeholder: await page.locator('.context-agent-composer textarea').getAttribute('placeholder'), mode: await page.locator('.agent-mode-picker summary').innerText(), request: await page.evaluate(() => ({ topicId: window.twhTopic && window.twhTopic.attachedContext && window.twhTopic.attachedContext.topicId, mode: window.twhTopic && window.twhTopic.mode })), runsBefore: before, runsAfter: await runs() };"`。右侧 Agent 对话打开，`opener` 就是卡片上的问题 `question`；输入框提示「我已经带上了这页的上下文…」；模式显示「自动模式」；`request` 里 `topicId` 有值、`mode` 是 `auto`；`runsBefore` 和 `runsAfter` 相等，说明没有自动发送。
- **收起对话。** 点一下对话输入框，再按 Esc。运行 `pnpm twh drive --eval "await page.locator('.context-agent-composer textarea').click(); await page.keyboard.press('Escape'); await expect(page.locator('.floating-agent-panel')).toBeHidden(); return await page.locator('.floating-agent-panel').isHidden();"`。对话面板收起，返回 `true`。
- **看依据。** 点话题卡上的依据入口。运行 `pnpm twh drive --eval "const button = page.locator('.questions-topic-card .questions-evidence-button').first(); if (await button.count()) { const label = await button.innerText(); await button.click(); const dialog = page.getByRole('dialog', { name: '文件预览', exact: true }); await expect(dialog).toBeVisible(); const title = await dialog.locator('.document-readonly-title').innerText(); await dialog.getByRole('button', { name: '关闭文件预览', exact: true }).click(); await expect(dialog).toHaveCount(0); return { kind: 'preview', label, title }; } const link = page.locator('.questions-topic-card').getByRole('link').first(); if (await link.count()) return { kind: 'link', label: await link.innerText(), href: await link.getAttribute('href') }; return { kind: 'none' };"`。`kind` 为 `preview` 时，依据页在只读弹窗「文件预览」里打开，标题是 `title`，点「关闭文件预览」后弹窗消失。`kind` 为 `link` 时，这张卡的依据是个跳转链接，`href` 是 `/sources` 或 `/focus/…`，点了会离开本页。`kind` 为 `none` 时，当前这批卡没有依据入口。
- **按类型筛选。** 运行 `pnpm twh drive --eval "const filters = page.locator('.questions-filters button'); const labels = await filters.allTextContents(); const total = await page.locator('.questions-topic-card').count(); await filters.last().click(); await expect(filters.last()).toHaveAttribute('aria-pressed', 'true'); const picked = await filters.last().innerText(); const shown = await page.locator('.questions-topic-card').count(); const empty = await page.getByText('这一类还没有话题', { exact: true }).isVisible(); await filters.first().click(); await expect(filters.first()).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.questions-topic-card')).toHaveCount(total); return { labels, picked, shown, empty };"`。点最后一个筛选项后它带 `aria-pressed="true"`，`shown` 是这一类的卡数（可能是 0，此时 `empty` 为 `true`）；点回「全部」后卡数回到 `total`。
- **连换三批，出现方向引导。** 点「换一批」三次。运行 `pnpm twh drive --eval "const shuffle = page.getByRole('button', { name: '换一批', exact: true }); for (let i = 0; i < 3; i += 1) { await shuffle.click(); } const card = page.locator('.questions-direction-card'); await expect(card).toBeVisible(); return { heading: await card.getByRole('heading').innerText(), cards: await page.locator('.questions-topic-card').count() };"`。出现「按你的方向找话题」卡片，标题是「已经换了好几批，都不是想聊的？」；话题卡数量仍在 1 到 4 之间。
- **按方向生成新话题。** 在方向卡片里输入一个方向，点「生成新话题」。运行 `pnpm twh drive --eval "const card = page.locator('.questions-direction-card'); await card.getByRole('textbox', { name: '想聊的方向', exact: true }).fill('工作里的取舍'); await card.getByRole('button', { name: '生成新话题', exact: true }).click(); const generated = page.locator('.questions-topic-card.is-generated'); await expect(generated).toHaveCount(4); return await generated.locator('h3').allTextContents();"`。话题墙换成四张「新生成」卡，返回的四个问题都含「工作里的取舍」。
- **关闭一个话题再撤销。** 先点「全部」，再点某张卡右上角的「关闭这个话题」。运行 `pnpm twh drive --eval "await page.locator('.questions-filters button').first().click(); const cards = page.locator('.questions-topic-card:not(.is-generated)'); const before = await cards.count(); const question = await cards.first().locator('h3').innerText(); await cards.first().getByRole('button', { name: '关闭这个话题', exact: true }).click(); const toast = page.locator('.questions-close-toast'); await expect(toast).toBeVisible(); await toast.getByRole('button', { name: '撤销', exact: true }).click(); await expect(cards.locator('h3').filter({ hasText: question })).toHaveCount(1); await expect(toast).toHaveCount(0); return { question, before, after: await cards.count() };"`。点「关闭这个话题」后出现提示「已关闭话题 可以在往期话题里找回」和「撤销」按钮；点「撤销」后这张卡回来，`after` 等于 `before`，提示消失。
- **往期话题。** 点「往期话题」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: /往期话题/ }).click(); const dialog = page.getByRole('dialog', { name: '往期话题', exact: true }); await expect(dialog).toBeVisible(); const tabs = await dialog.getByRole('navigation', { name: '筛选话题' }).getByRole('button').allTextContents(); const empty = await dialog.getByText('这里暂时没有话题', { exact: true }).isVisible(); await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click(); await expect(dialog).toHaveCount(0); return { tabs, empty };"`。弹窗「往期话题」打开，`tabs` 是「全部、已构建 Wiki、聊到一半、已关闭」四项各带数量；从来没聊过也没关过话题时列表是空的，显示「这里暂时没有话题」（`empty` 为 `true`）；点「关闭弹窗」后弹窗消失。
- **不挑话题，直接开聊。** 点页面最下方的「还有别的想聊的？直接跟我说」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: /还有别的想聊的/ }).click(); await expect(page.locator('.context-agent-panel')).toBeVisible(); const input = page.locator('.context-agent-composer textarea'); await expect(input).toHaveValue(''); const state = { placeholder: await input.getAttribute('placeholder'), opener: await page.locator('.agent-new-topic h3').innerText(), mode: await page.locator('.agent-mode-picker summary').innerText(), offline: await page.locator('.context-agent-offline').isVisible() }; await input.click(); await page.keyboard.press('Escape'); await expect(page.locator('.floating-agent-panel')).toBeHidden(); return state;"`。右侧 Agent 对话打开，输入框是空的，提示「想从哪里开始？」，模式是「自动模式」。没有可用模型时 `offline` 为 `true`，面板里写着「暂时无法开始对话；请在偏好设置中连接 AI 助手。」。最后点一下输入框再按 Esc 收起。
- **整段旅程：带着话题打开对话。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它证明了在 `/questions` 点「聊聊这个」后对话面板可见，发出的请求带着话题的 `topicId`，模式是 `auto`，模式选择器显示「自动模式」，输入框提示已经带上这页的上下文。同一个脚本还覆盖此刻、来源、导入和搜索，其中此刻那一组有过时的定位（见 `capture.md`）。
- **整段旅程：侧边栏往返。** 运行 `pnpm twh drive --script verify-agent-routes`。桌面客户端。它证明了从「此刻」到「值得聊聊」等九个侧边栏目的地之间往返，地址和窗口标题跟着变，Agent 面板保持打开。它断言的 `.context-agent-attached-context` 在源码里只剩样式，未核实运行结果。
- **整段旅程：筛选不丢草稿。** 运行 `pnpm twh drive --script verify-redesign`。桌面客户端。它证明了值得聊聊在两种窗口宽度下不出横向滚动条，对话里写了草稿后收起再展开草稿还在，切换话题类型也不丢。它点的「话题卡第一个按钮」现在是关闭按钮，还用了已经不存在的面板按钮名和页签，未核实运行结果。
- **整段旅程：Esc 收起对话。** 运行 `pnpm twh drive --script verify-dismiss-layers`。桌面客户端。它的前半段证明了在对话输入框里按 Esc 会收起面板，焦点回到「打开Agent对话」，再打开时草稿还在。后半段用了已经不存在的来源连接弹窗，未核实运行结果。
- **留证。** 运行 `pnpm twh evidence screenshot questions-wall` 和 `pnpm twh evidence aria questions-wall`。两份证据里都能看到话题墙上的话题卡和它们的类型。

## Gotchas

- 话题的顺序按日期固定：同一天里刷新不变，隔天可能变；每批最多四张。不要断言具体是哪几张，也不要断言恰好四张。
- 演示库目前没有状态追踪类的页面，`PRODUCT.md` 引用的 `wiki/11 状态追踪/值得聊聊.md` 在仓库里不存在。话题墙可能只有一张「账单线索」卡，筛选栏也只有「全部」和「账单线索」。运行时实际有几张卡，未核实。
- 聊过的话题再点会直接回到那一次对话，不会出现空白输入框。验证「带着话题打开」要用没聊过的话题。
- 「开始聊」在新生成的话题卡上，点了会立刻发送消息，需要模型。没有可用模型时面板里会出现「暂时无法开始对话」的提示，发送按钮禁用。
- 关闭话题会记在本机偏好里（`the-way-here.closed-topics.<知识库>`）。不点「撤销」的话，下次打开它还是关着的，要去往期话题里恢复。
- 新生成的四个问题来自固定问法，不代表已有的记忆线索；话题卡上会写明这一点。
- 除「聊聊这个」和 Esc 收起之外，本页的步骤都没有现成脚本走过。定位来自 `QuestionsHub.tsx`、`talking-questions.ts` 和 `Collaboration.tsx`，运行结果未核实。
- `verify-redesign` 点的是话题卡里的第一个按钮，现在是「关闭这个话题」而不是「聊聊这个」；它还用了已经不存在的「展开AI 协作面板」和「历史记录 / 当前对话」页签。`verify-agent-routes` 断言对话正文为空，而源码里空白对话有「想从哪里开始？」的引导。这些都是静态比对，未核实运行结果。
- Agent 面板每次窗口加载时默认收起。`/questions` 的对话属于当前知识库，换了知识库历史不通用。
- 界面语言是英文时，所有中文按钮名都会变。先用「确认基线」一步确认 `lang` 是 `zh-CN`。
