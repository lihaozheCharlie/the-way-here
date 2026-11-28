# 此刻：随手记

此刻是打开应用后的第一屏。用户在「此刻的记录」里写下或说出刚发生的事，再决定怎么留下它：整理成日记、只存原文、暂存以后再写，或先拿去和 Agent 聊。在 Mac 客户端里还可以从系统照片库挑照片，做成一段照片记忆。写下的话会自动暂存，刷新或出错都不会丢。

## Sub-features

- `capture-write` 写一段话：文字自动暂存，刷新后还在；每个知识库有自己的草稿。
- `capture-organize` 整理成日记：把这段文字交给当前模型写成一篇日记，存到所选目录；失败时原话保留。
- `capture-original` 只存原文、稍后再整理：原话原样写成一篇生活记录，不调用模型。
- `capture-talk` 先聊聊这段：带着还没保存的草稿打开右侧 Agent 对话，不自动发送。
- `capture-history` 历史记录：查看、搜索、恢复续写、继续补充、删除草稿或已保存的日记。
- `capture-destination` 保存位置：选目录、新建文件夹、设为之后新记录的默认目录。
- `capture-voice` 说一段：录音时先出临时文字，完成后校准。仅 Mac 客户端可用，浏览器里只给出提示。
- `capture-photo` 找照片：按时间、地点、相册搜系统照片库，选照片整理成照片记忆。仅 Mac 客户端可用。
- `capture-quick` 随手记小窗：`/capture` 的独立窗口，和此刻共用同一个草稿。

## How to get to it (user POV)

- 侧边栏第一项「此刻」，路由 `/`。应用启动就落在这里。
- 快捷键 ⌘N / Ctrl+N 打开「随手记」小窗，路由 `/capture`。桌面端对应菜单「文件 → 随手记」和托盘菜单里的「随手记」；浏览器里在当前窗口跳到 `/capture`。
- 标题栏「搜索与命令」面板里的「新建随手记」。
- 直接打开 `/` 或 `/capture`。
- 输入框里有了文字，下面才出现这些按钮：「先聊聊这段」（只在 `/` 有）、「暂存」、「只存原文、稍后再整理」、「整理成日记」。输入框里按 ⌘Enter / Ctrl+Enter 等于「整理成日记」。
- 「历史记录」打开历史记录弹窗；「保存到 生活记录 / 某目录」打开保存位置弹窗。
- Mac 客户端里输入框上方有「说或写」「找照片」两个页签。左侧的麦克风按钮显示「说一段」，有了文字后变成「接着说」。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。「选保存位置并新建文件夹」「只存原文、稍后再整理」两步会真的新建文件夹和记录，「在历史记录里删除一条」会删掉一条历史记录。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 配置目录是全新的：第一次打开 `/` 会弹出模型配置引导，照「关掉首次启动的模型引导」那一步的顺序把它关掉。
- 「整理成日记」需要可用的模型。没有模型时它失败并保留原话，下文只验证这条失败路径。有模型时它会真的调用模型、写日记并可能更新 Wiki，结果不确定，不要用它做确定性验证。
- 语音输入和「找照片」只在 Mac 客户端里有，也就是「确认基线」一步返回的 `desktop` 为 `true`。

- **打开此刻。** 运行 `pnpm twh doctor` 和 `pnpm twh go /`。前者以退出码 0 结束；页面上出现「此刻的记录」输入框。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。返回的对象里 `knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型；`desktop` 为 `false` 表示浏览器宿主，没有语音和找照片。
- **关掉首次启动的模型引导。** 依次点「稍后配置」、勾选「不再提醒我」、再点「稍后配置」。运行 `pnpm twh drive --eval "await expect(page.locator('.model-onboarding-dialog')).toBeVisible(); await page.getByRole('button', { name: '稍后配置', exact: true }).click(); await expect(page.getByRole('heading', { name: '稍后再配置 AI 模型？' })).toBeVisible(); await page.getByRole('checkbox', { name: '不再提醒我', exact: true }).check(); await page.getByRole('button', { name: '稍后配置', exact: true }).click(); await expect(page.locator('.model-onboarding-dialog')).toHaveCount(0); await expect(page.getByRole('heading', { name: '有什么，都可以聊聊', exact: true })).toBeVisible(); return await page.getByRole('textbox', { name: '此刻的记录', exact: true }).inputValue();"`。引导消失，大标题「有什么，都可以聊聊」可见；返回值是输入框当前内容，全新状态是空字符串。
- **写一段话。** 在「此刻的记录」里输入。运行 `pnpm twh drive --eval "const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await box.fill('匿名验收草稿，不调用真实模型。'); await expect(page.getByText('草稿已暂存', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '先聊聊这段', exact: true })).toBeVisible(); return await page.evaluate(async () => (await (await fetch('/api/capture/history?knowledgeBaseId=demo')).json()).entries.map(entry => ({ text: entry.text, status: entry.status })));"`。状态提示变成「草稿已暂存」，「先聊聊这段」按钮出现；返回的历史里有一项的 `text` 就是刚写的这句话。
- **刷新后草稿还在。** 运行 `pnpm twh drive --eval "await page.reload(); const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await expect(box).toHaveValue('匿名验收草稿，不调用真实模型。'); await expect(page.getByText('草稿已恢复，可编辑或接着说', { exact: true })).toBeVisible(); return await box.inputValue();"`。刷新后输入框里还是刚写的那句话，状态提示是「草稿已恢复，可编辑或接着说」并保持不变。
- **先聊聊这段。** 点输入框下方的「先聊聊这段」。运行 `pnpm twh drive --eval "const runs = () => page.evaluate(async () => (await (await fetch('/api/runs')).json()).length); const before = await runs(); await page.getByRole('button', { name: '先聊聊这段', exact: true }).click(); await expect(page.locator('.context-agent-panel')).toBeVisible(); const input = page.locator('.context-agent-composer textarea'); await expect(input).toHaveValue('匿名验收草稿，不调用真实模型。'); await expect(page.locator('.agent-mode-picker summary')).toContainText('Wiki 只读模式'); return { draft: await input.inputValue(), runsBefore: before, runsAfter: await runs() };"`。右侧 Agent 对话打开，输入框里已经填好这段草稿，模式显示「Wiki 只读模式」；`runsBefore` 和 `runsAfter` 相等，说明没有自动发送。
- **收起对话，草稿还在。** 点一下对话输入框，再按 Esc。运行 `pnpm twh drive --eval "await page.locator('.context-agent-composer textarea').click(); await page.keyboard.press('Escape'); await expect(page.locator('.floating-agent-panel')).toBeHidden(); const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await expect(box).toHaveValue('匿名验收草稿，不调用真实模型。'); return { panelHidden: await page.locator('.floating-agent-panel').isHidden(), capture: await box.inputValue() };"`。对话面板收起（`panelHidden` 为 `true`），此刻的输入框里还是那句话。
- **暂存。** 点「暂存」。运行 `pnpm twh drive --eval "const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await page.getByRole('button', { name: '暂存', exact: true }).click(); await expect(box).toHaveValue(''); return await box.inputValue();"`。输入框清空，返回空字符串。
- **在历史记录里找到它。** 点「历史记录」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: /历史记录/ }).click(); const dialog = page.getByRole('dialog', { name: '历史记录', exact: true }); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: '恢复续写', exact: true })).toBeVisible(); return await dialog.locator('.capture-history-list button').allTextContents();"`。弹窗「历史记录」打开；返回的列表里有一项以刚才那句话开头。
- **恢复续写。** 点弹窗里的「恢复续写」。运行 `pnpm twh drive --eval "const dialog = page.getByRole('dialog', { name: '历史记录', exact: true }); await dialog.getByRole('button', { name: '恢复续写', exact: true }).click(); const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await expect(dialog).toHaveCount(0); await expect(box).toHaveValue('匿名验收草稿，不调用真实模型。'); return await box.inputValue();"`。弹窗关闭，输入框回到那句话。
- **选保存位置并新建文件夹。** 点「保存到 生活记录 / …」，在弹窗里新建一个文件夹并确定。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: /保存到/ }).click(); const dialog = page.getByRole('dialog', { name: '保存位置', exact: true }); await expect(dialog).toBeVisible(); await dialog.getByRole('textbox', { name: '新文件夹名称', exact: true }).fill('验收草稿目录'); await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click(); await expect(dialog.getByRole('radio', { name: /验收草稿目录/ })).toBeChecked(); await dialog.getByRole('button', { name: '确定', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.locator('.capture-destination strong')).toHaveText('验收草稿目录'); return await page.locator('.capture-destination strong').innerText();"`。弹窗关闭，「保存到」后面显示并返回 `验收草稿目录`。
- **只存原文、稍后再整理。** 点「只存原文、稍后再整理」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '只存原文、稍后再整理', exact: true }).click(); const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await expect(box).toHaveValue(''); const saved = page.locator('.capture-saved'); await expect(saved).toBeVisible(); const link = saved.getByRole('link', { name: '查看记录' }); return { status: await saved.innerText(), href: await link.getAttribute('href'), entries: await page.evaluate(async () => (await (await fetch('/api/capture/history?knowledgeBaseId=demo')).json()).entries.map(entry => ({ status: entry.status, text: entry.text }))) };"`。输入框清空，出现状态「原文已留在本机，没有发给模型。」和链接「查看记录」（`href` 以 `/page/` 开头）；返回的历史里这句话那一项的 `status` 是 `saved`。
- **从「查看记录」再读一遍。** 点状态里的「查看记录」。运行 `pnpm twh drive --eval "await page.locator('.capture-saved').getByRole('link', { name: '查看记录' }).click(); await page.waitForURL(url => url.pathname.startsWith('/page/')); const body = page.locator('.editable-document-body'); await expect(body).toContainText('匿名验收草稿，不调用真实模型。'); return { path: new URL(page.url()).pathname, text: await body.innerText() };"`。地址跳到 `/page/…` 下的记录页，正文里有刚才那句原话。
- **整理成日记：没有模型时原话保留。** 回到此刻，写一句话，点「整理成日记」。运行 `pnpm twh go /` 和 `pnpm twh drive --eval "const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await box.fill('没有模型时也要留下的原话。'); await page.getByRole('button', { name: '整理成日记', exact: true }).click(); await expect(page.locator('.capture-error')).toBeVisible(); await expect(box).toHaveValue('没有模型时也要留下的原话。'); await expect(page.getByRole('button', { name: '整理成日记', exact: true })).toBeEnabled(); return { alert: await page.locator('.capture-error').innerText(), draft: await box.inputValue() };"`。仅当基线里 `agentAvailable` 为 `false` 时做这一步。输入框下方出现错误提示（`alert` 是它的文字，具体文案随运行时而定），输入框里的话还在，「整理成日记」恢复可点。
- **在历史记录里删除一条。** 运行 `pnpm twh drive --eval "await page.getByRole('button', { name: /历史记录/ }).click(); const dialog = page.getByRole('dialog', { name: '历史记录', exact: true }); await expect(dialog).toBeVisible(); const list = dialog.locator('.capture-history-list button'); const before = await list.count(); await dialog.getByRole('button', { name: '删除', exact: true }).click(); await expect(dialog.getByText(/删除这条草稿？|从历史记录中删除？/)).toBeVisible(); await dialog.getByRole('button', { name: '确认删除', exact: true }).click(); await expect(list).toHaveCount(before - 1); await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await expect(dialog).toHaveCount(0); return { before, after: before - 1 };"`。点「删除」后出现「删除这条草稿？」或「从历史记录中删除？已保存的日记文件会保留。」的确认；确认后列表少一条（`after` 比 `before` 小 1），弹窗关闭。
- **浏览器里点语音按钮会得到提示。** 运行 `pnpm twh drive --eval "if (await page.evaluate(() => Boolean(window.desktop))) return '桌面宿主，跳过这一步'; await page.getByRole('button', { name: '语音说一段', exact: true }).click(); const alert = page.getByRole('alert').filter({ hasText: '请在 Mac 客户端中使用麦克风' }); await expect(alert).toBeVisible(); return await alert.innerText();"`。浏览器里返回提示「请在 Mac 客户端中使用麦克风；这里可以继续输入文字。」；Mac 客户端里返回「桌面宿主，跳过这一步」，不会开始录音。
- **Mac 客户端：切到「找照片」。** 运行 `pnpm twh drive --eval "const tab = page.getByRole('tab', { name: '找照片' }); if (await tab.count() === 0) return { photoTab: false }; await tab.click(); await page.locator('#photo-library-search button').first().waitFor(); const visible = name => page.getByRole('button', { name, exact: true }).isVisible(); const state = { photoTab: true, allow: await visible('允许访问照片库'), settings: await visible('打开系统设置'), search: await visible('搜索照片') }; await page.getByRole('tab', { name: '说或写', exact: true }).click(); return state;"`。浏览器里 `photoTab` 为 `false`。Mac 客户端里切到「找照片」，`allow`、`settings`、`search` 三项里恰有一项为 `true`（还没授权、已被拒绝、已授权），最后切回「说或写」。
- **随手记小窗。** 运行 `pnpm twh go /capture` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { name: '随手记', exact: true, level: 1 })).toBeVisible(); const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await expect(box).toBeVisible(); return { searchButton: await page.getByRole('button', { name: '搜索与命令', exact: true }).count(), value: await box.inputValue() };"`。一级标题是「随手记」，输入框可见；小窗没有标题栏按钮，`searchButton` 是 0。
- **整段旅程：草稿、历史记录和保存位置。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它证明了草稿自动暂存到历史接口、「暂存」清空输入框、历史记录恢复续写、保存位置里新建文件夹；也覆盖搜索、打开文件夹、导入和删除。它用的语音按钮名和照片库提示文案已经过时（见 Gotchas），很可能在那一组失败。
- **整段旅程：随手记的交互。** 运行 `pnpm twh drive --script verify-capture-ux`。只挂载随手记组件，接口全部拦截，语音桥是假的，不需要麦克风。它证明了临时转写、暂停、继续、完成录音、暂存与恢复、保存位置的取消和默认目录、保存后同一条记录继续补充、删除草稿、刷新后草稿还在。它用的按钮名「整理并保存」已经过时。
- **整段旅程：找照片的全流程。** 运行 `pnpm twh drive --script verify-capture-sources`。浏览器加真实服务，照片桥是伪造的，不读取真实照片库。它证明了授权、筛选、iCloud 照片下载预览、一条记录最多选 50 张、放大预览、照片记忆的保存目录、「整理成照片记忆」的确认、认人物和故事、从历史记录恢复。它用的语音按钮名已经过时。
- **整段旅程：整理成日记的运行状态。** 运行 `pnpm twh drive --script verify-today`。桌面客户端，`/api/runs` 被拦截，不调用真实模型。它证明了草稿刷新后还在、请求带上知识库和原话、整理进行中输入框禁用、刷新后找回进行中的任务、完成后出现「查看记录」、失败时原话保留；也检查 `/capture` 的窄窗布局。它用的按钮名「整理并保存」已经过时。
- **留证。** 运行 `pnpm twh evidence screenshot capture-draft` 和 `pnpm twh evidence aria capture-draft`。两份证据里都能看到「此刻的记录」输入框和它下面的操作按钮。

## Gotchas

- 按钮名以源码为准。提交按钮现在叫「整理成日记」，`verify-today` 和 `verify-capture-ux` 仍写「整理并保存」（2026-10-24 的提交 a7df05b 改的名）。这是静态比对，未核实运行结果；跑这两个脚本前先确认。
- 语音按钮在源码里带 `aria-label="语音说一段"`，可访问名称以 aria-label 为准，所以要用「语音说一段」去找。`verify-web`、`verify-capture-ux`、`verify-capture-sources` 用的是可见文字「说一段」「接着说」，按已安装的 Playwright 的名称算法会匹配不到。未核实运行结果。
- `verify-web` 还断言「请在 macOS 桌面应用中连接系统照片库。」，源码里已经没有这句。未核实运行结果。
- `verify-photo-library` 没有列进旅程：它整个围绕 `.photo-library-card`、「收起」按钮和「地点附近范围」下拉框来写，这些在 2026-10-24 的提交 f7e60b8 之后都不存在了，照片入口现在是「找照片」页签。静态比对，未核实运行结果。
- `PRODUCT.md` 提到的「接着聊」按钮在当前源码里不存在。带着草稿开聊的按钮是「先聊聊这段」，只在 `/` 且有文字时出现，`/capture` 里没有。
- 模型引导只在全新配置目录里弹出。已经确认过（偏好 `the-way-here.model-onboarding.confirmed`）就不再弹，等它出现会超时，直接跳过那一步。
- 没有模型时「整理成日记」会失败并保留原话，错误文案随运行时而定，不要断言具体文字。有模型时它会真的调用模型、写日记并可能更新 Wiki，结果不确定，不适合做确定性验证；运行状态用 `verify-today` 的拦截版来验。
- 「先聊聊这段」「只存原文、稍后再整理」和它的「查看记录」第二视角没有任何现成脚本走过。定位来自 `LifeRecordCapture.tsx`、`useCaptureDraft.ts` 和服务端 `capture-routes.ts`，运行结果未核实。
- 「只存原文」成功后这条草稿变成已保存：「只存原文」按钮消失，「保存到」按钮禁用，角标变成「补充中」。再写会新建一条草稿。
- 历史记录弹窗默认选中最上面一条，「删除」删的是选中的那条。删除已保存的条目不会删磁盘上的日记文件。
- 保存位置里新建的文件夹是真的，会出现在生活记录的文件夹树里。勾着「之后的新记录也保存到这里」（默认勾选）时，它同时成为默认目录，之后的新草稿都落在那里。
- 草稿按知识库隔离。切换知识库后输入框是空的，不是丢了数据。
- 「说或写 / 找照片」页签只在桌面桥存在且平台是 `darwin` 时渲染，浏览器里没有。真实的语音识别和真实照片库授权需要系统权限和真人环境，无法确定性验证。
- 界面语言是英文时，所有中文按钮名都会变。先用「确认基线」一步确认 `lang` 是 `zh-CN`。
