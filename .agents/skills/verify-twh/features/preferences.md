# 偏好设置：通用与 AI 助手

「偏好设置」让用户按自己的习惯调整应用：通用页签里有界面语言、Agent 任务完成提醒、快捷键一览、存储位置（和应用更新）；AI 助手页签里选运行方式（本机 Codex 或第三方模型）、模型、思考深度、API 密钥，以及允许 AI 使用哪些资料。改动会自动保存，重启后仍在。Mac 客户端里它是独立的设置窗口；浏览器里是同一个窗口里的一个页面，没有「在 Finder 中显示」「移动内容位置…」和应用更新。

## Sub-features

- `prefs-tabs` 「通用」和「AI 助手」两个页签；地址 `/preferences?tab=ai` 直接打开后者。
- `prefs-language` 界面语言可在中文和 English 之间切换，演示库的标题跟着变，自己的内容不翻译。
- `prefs-notifications` 「Agent 任务完成提醒」开关，关掉后应用在后台时不再弹系统通知。
- `prefs-shortcuts` 常用快捷键一览。
- `prefs-storage` 存储位置：这个知识库的内容、应用状态、缓存各在哪里、多大。
- `prefs-storage-finder` 「在 Finder 中显示」打开对应目录。仅 Mac 客户端。
- `prefs-storage-move` 「移动内容位置…」把知识库内容整体移到别的文件夹。仅 Mac 客户端。
- `prefs-updates` 应用更新：显示当前版本、检查更新、下载后自动重启安装。仅打包后的 Mac 客户端。
- `prefs-ai-runtime` 运行方式：Codex 或第三方模型，各带就绪状态。
- `prefs-ai-model` 模型和思考深度，改动自动保存并对所有对话生效。
- `prefs-ai-key` 第三方模型的 API Key：添加、更换、移除，只保存在本机。
- `prefs-ai-consent` 「允许 AI 使用哪些资料」的共享许可，默认关闭，换了运行方式要重新同意。
- `prefs-ai-codex-connect` 商店版里「连接已登录的 Codex…」。仅 Mac App Store 版本。
- `prefs-onboarding` 第一次启动时的模型引导，可以稍后配置、不再提醒，页面上留一条「去配置」。
- `prefs-privacy-link` 通用页签底部和 AI 页签里都有隐私说明的链接。

## How to get to it (user POV)

- 侧边栏左下角的「偏好设置」。Mac 客户端打开独立的设置窗口；浏览器跳到 `/preferences`。
- Mac 客户端菜单「The Way Here → 偏好设置…」（⌘,）。
- 页面上方「通用 / AI 助手」页签；地址 `/preferences` 和 `/preferences?tab=ai`。
- 旧地址 `/settings` 跳到 `/preferences`，`/models` 跳到 `/preferences?tab=ai`。
- 模型引导条上的「去配置」。
- 右侧 Agent 对话输入框旁的模型按钮打开的是同一套 AI 设置的小窗（见 `inspector.md`）。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。「关掉通知提醒」「切到 English」「改思考深度会自动保存」这几步会改设置再改回来；「推迟模型引导」会写下不再提醒。
- 界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 「Agent 任务完成提醒」开关初始是开着的（默认值）。
- 配置目录是全新的，还没有配置过模型，也没有推迟过模型引导；「推迟模型引导」那一步照 `verify-web` 的顺序把它关掉。已经处理过的实例跳过那一步。
- 这几步不碰第三方 API Key，不点「移动内容位置…」，不点「检查更新」。这些要么需要真实密钥，要么会真的移动文件或联网。

- **打开通用页签。** 点侧边栏左下角的「偏好设置」（浏览器），或直接打开地址。运行 `pnpm twh go /preferences` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '偏好设置' })).toBeVisible(); const tabs = page.getByRole('tablist', { name: '偏好设置分类' }); await expect(tabs.getByRole('tab', { name: '通用', exact: true })).toHaveAttribute('aria-selected', 'true'); const panel = page.getByRole('tabpanel', { name: '通用', exact: true }); await expect(panel.getByRole('heading', { level: 2, name: '语言', exact: true })).toBeVisible(); await expect(panel.getByRole('heading', { level: 2, name: '通知', exact: true })).toBeVisible(); await expect(panel.getByRole('heading', { level: 2, name: '键盘快捷键', exact: true })).toBeVisible(); return { headings: await panel.getByRole('heading', { level: 2 }).allTextContents(), title: await page.locator('.desktop-window-title').innerText(), searchButton: await page.getByRole('button', { name: '搜索与命令', exact: true }).count() };"`。窗口标题是 `偏好设置 · <知识库名>`；`headings` 依次有「语言、通知、键盘快捷键、存储位置」，打包后的 Mac 客户端在存储位置前多一项「应用更新」；设置页没有标题栏的搜索按钮，`searchButton` 是 0。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`lang` 是 `zh-CN`；`desktop` 为 `false` 表示浏览器宿主，下面标了「仅 Mac 客户端」的按钮不会出现。
- **用地址打开 AI 助手页签。** 运行 `pnpm twh go "/preferences?tab=ai"` 和 `pnpm twh drive --eval "const tabs = page.getByRole('tablist', { name: '偏好设置分类' }); await expect(tabs.getByRole('tab', { name: 'AI 助手', exact: true })).toHaveAttribute('aria-selected', 'true'); await expect(page.getByRole('radiogroup', { name: '选择 Agent 运行方式' })).toBeVisible(); await expect(page.locator('.ai-config-save-state')).not.toContainText('正在读取设置…'); return { state: await page.locator('.ai-config-save-state').innerText(), radios: await page.getByRole('radiogroup', { name: '选择 Agent 运行方式' }).getByRole('radio').allTextContents() };"`。「AI 助手」页签被选中；两个单选项是「Codex」和「第三方模型」，各带自己的状态（已就绪、不可用、已配置、待配置之一）。
- **页签之间切换。** 点「AI 助手」，再点「通用」。运行 `pnpm twh go /preferences` 和 `pnpm twh drive --eval "const tabs = page.getByRole('tablist', { name: '偏好设置分类' }); await tabs.getByRole('tab', { name: 'AI 助手', exact: true }).click(); await expect(page.getByRole('tabpanel', { name: 'AI 助手', exact: true })).toBeVisible(); const url = page.url(); await tabs.getByRole('tab', { name: '通用', exact: true }).click(); await expect(page.getByRole('tabpanel', { name: '通用', exact: true })).toBeVisible(); return { urlWhileAi: url };"`。两个面板来回切换；切到 AI 助手时地址仍是 `/preferences`，不带 `tab=ai`。
- **快捷键一览。** 运行 `pnpm twh drive --eval "const list = page.locator('.preferences-shortcuts'); await expect(list).toContainText('搜索与命令'); await expect(list).toContainText('随手记'); await expect(list).toContainText('打开或收起 AI 对话'); await expect(list).toContainText('独立窗口'); return await list.innerText();"`。返回的四行是「搜索与命令 ⌘ K、随手记 ⌘ N、打开或收起 AI 对话 ⌘ ⌥ I、独立窗口 ⌘ ↩」。
- **关掉通知提醒，刷新后读回。** 点「Agent 任务完成提醒」的开关。运行 `pnpm twh drive --eval "const toggle = page.getByRole('switch'); await expect(toggle).toBeChecked(); await toggle.uncheck(); await expect(toggle).not.toBeChecked(); return { after: await toggle.isChecked() };"`，再运行 `pnpm twh go /preferences` 和 `pnpm twh drive --eval "const toggle = page.getByRole('switch'); await expect(toggle).not.toBeChecked(); return await page.evaluate(() => ({ host: Boolean(window.desktop), stored: window.desktop ? window.desktop.readPreference('desktop.notifications') : localStorage.getItem('desktop.notifications') }));"`。关掉后开关是关的；刷新后仍是关的，读回的存储值是字符串 `false`。
- **把通知提醒打开。** 再点一次开关。运行 `pnpm twh drive --eval "const toggle = page.getByRole('switch'); await toggle.check(); await expect(toggle).toBeChecked(); return await page.evaluate(() => window.desktop ? window.desktop.readPreference('desktop.notifications') : localStorage.getItem('desktop.notifications'));"`。开关回到开着，读回的存储值是字符串 `true`。
- **切到 English 再切回中文。** 点语言里的「English」，再点「Chinese」。运行 `pnpm twh drive --eval "await page.getByRole('tab', { name: 'English', exact: true }).click(); await expect(page.getByRole('heading', { level: 1, name: 'Preferences', exact: true })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('lang', 'en'); return await page.getByRole('tablist', { name: 'Language' }).getByRole('tab').allTextContents();"`，再运行 `pnpm twh drive --eval "await page.getByRole('tab', { name: 'Chinese', exact: true }).click(); await expect(page.getByRole('heading', { level: 1, name: '偏好设置', exact: true })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN'); return await page.locator('html').getAttribute('lang');"`。切到英文后标题变成「Preferences」，语言页签变成「Chinese、English」；切回后标题和 `lang` 都回到中文。
- **存储位置。** 运行 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 2, name: '存储位置', exact: true })).toBeVisible(); const rows = page.getByRole('list', { name: '知识库内容' }).getByRole('listitem'); await expect(rows).toHaveCount(1); return { path: await rows.first().locator('code.storage-path').innerText(), size: await rows.first().locator('.storage-size').innerText(), finderButtons: await page.getByRole('button', { name: /在 Finder 中显示/ }).count(), moveButton: await page.getByRole('button', { name: '移动内容位置…', exact: true }).count() };"`。`path` 是当前知识库内容的位置，`size` 是它的大小；浏览器里 `finderButtons` 和 `moveButton` 都是 0，Mac 客户端里各至少有一个。
- **AI 设置：当前运行方式、模型与思考深度。** 运行 `pnpm twh go "/preferences?tab=ai"` 和 `pnpm twh drive --eval "const group = page.getByRole('radiogroup', { name: '选择 Agent 运行方式' }); await expect(group.getByRole('radio')).toHaveCount(2); const selected = await group.locator('[aria-checked=true] b').innerText(); const state = await group.locator('[aria-checked=true] i').innerText(); const model = page.getByRole('combobox', { name: '模型', exact: true }); const effort = page.getByRole('combobox', { name: '思考深度', exact: true }); return { selected, state, model: await model.inputValue(), effort: await effort.inputValue(), effortOptions: await effort.locator('option').allTextContents() };"`。`selected` 是「Codex」或「第三方模型」，`state` 是它的状态；`model` 是当前模型；`effortOptions` 是可选的思考深度。
- **AI 设置：改思考深度会自动保存。** 在「思考深度」里换一个选项，再换回去。运行 `pnpm twh drive --eval "await expect(page.locator('.ai-config-save-state')).not.toContainText('正在读取设置…'); const runtime = await page.getByRole('radiogroup', { name: '选择 Agent 运行方式' }).locator('[aria-checked=true] b').innerText(); const read = () => page.evaluate(async () => { const settings = await (await fetch('/api/agent-settings')).json(); return { codex: settings.codex.effort, thirdParty: settings.thirdParty.effort }; }); const before = await read(); const current = runtime === 'Codex' ? before.codex : before.thirdParty; const effort = page.getByRole('combobox', { name: '思考深度', exact: true }); const options = await effort.locator('option').evaluateAll(nodes => nodes.map(node => node.value)); const next = options.find(value => value !== current); await effort.selectOption(next); await expect(page.locator('.ai-config-save-state')).toHaveText('已保存，所有对话生效'); const saved = await read(); expect((runtime === 'Codex' ? saved.codex : saved.thirdParty)).toBe(next); await effort.selectOption(current); await expect(page.locator('.ai-config-save-state')).toHaveText('已保存，所有对话生效'); const restored = await read(); expect((runtime === 'Codex' ? restored.codex : restored.thirdParty)).toBe(current); return { runtime, before: current, changedTo: next, saved, restored };"`。改完下方出现「已保存，所有对话生效」，从设置接口读回的值就是新选项；换回去后读回原值。前提是思考深度至少有两个选项。
- **AI 设置：共享许可。** 运行 `pnpm twh drive --eval "const consent = page.getByRole('checkbox', { name: '我已了解并允许向上述服务发送任务所需资料，包括我启用的自动更新', exact: true }); await expect(consent).toHaveCount(1); return { checked: await consent.isChecked(), recipient: await page.locator('.ai-data-sharing p').first().innerText() };"`。页面写明接收方是谁；`checked` 是当前是否同意。不要点它，改许可会真的改变能不能发任务。
- **隐私说明的链接。** 运行 `pnpm twh go /preferences` 和 `pnpm twh drive --eval "const link = page.getByRole('link', { name: '隐私与数据使用', exact: true }); await expect(link).toHaveAttribute('href', '/privacy'); await expect(link).toHaveAttribute('target', '_blank'); return await link.getAttribute('href');"`，再运行 `pnpm twh go "/preferences?tab=ai"` 和 `pnpm twh drive --eval "const link = page.getByRole('link', { name: '隐私与数据使用说明', exact: true }); await expect(link).toHaveAttribute('href', '/privacy'); return await link.getAttribute('href');"`。两处链接都指向 `/privacy`，在新标签页或新窗口里打开。打开后的页面见 `privacy.md`。
- **从侧边栏进入。** 点左下角的「偏好设置」。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "if (await page.evaluate(() => Boolean(window.desktop))) { await page.locator('.desktop-settings-row button').click(); return '桌面宿主：打开了独立的设置窗口，主窗口地址不变：' + page.url(); } await page.locator('.desktop-settings-row button').click(); await expect(page).toHaveURL(origin + '/preferences'); return page.url();"`。浏览器里地址变成 `/preferences`；Mac 客户端里弹出独立的设置窗口，返回值会说明这一点。
- **旧地址跳转。** 运行 `pnpm twh go /settings` 和 `pnpm twh drive --eval "await expect(page).toHaveURL(origin + '/preferences'); return page.url();"`，再运行 `pnpm twh go /models` 和 `pnpm twh drive --eval "await expect(page).toHaveURL(origin + '/preferences?tab=ai'); await expect(page.getByRole('tab', { name: 'AI 助手', exact: true })).toHaveAttribute('aria-selected', 'true'); return page.url();"`。`/settings` 落到通用页签，`/models` 落到 AI 助手页签。
- **推迟模型引导。** 第一次打开首页时依次点「稍后配置」、勾选「不再提醒我」、再点「稍后配置」。运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await expect(page.locator('.model-onboarding-dialog')).toBeVisible(); await page.getByRole('button', { name: '稍后配置', exact: true }).click(); await expect(page.getByRole('heading', { name: '稍后再配置 AI 模型？' })).toBeVisible(); await page.getByRole('checkbox', { name: '不再提醒我', exact: true }).check(); await page.getByRole('button', { name: '稍后配置', exact: true }).click(); await expect(page.locator('.model-onboarding-dialog')).toHaveCount(0); await expect(page.locator('.model-onboarding-strip')).toContainText('尚未配置 AI 模型'); return await page.locator('.model-onboarding-strip').innerText();"`。引导消失，页面上方留下一条「尚未配置 AI 模型，部分功能不可用」。已经处理过的实例不会弹，直接跳过这一步。
- **模型引导条上的「去配置」。** 运行 `pnpm twh drive --eval "if ((await page.locator('.model-onboarding-strip').count()) === 0) return '没有引导条，跳过这一步'; if (await page.evaluate(() => Boolean(window.desktop))) { await page.locator('.model-onboarding-strip').getByRole('button', { name: '去配置', exact: true }).click(); return '桌面宿主：打开了独立的设置窗口'; } await page.locator('.model-onboarding-strip').getByRole('button', { name: '去配置', exact: true }).click(); await expect(page).toHaveURL(origin + '/preferences'); return page.url();"`。浏览器里落到 `/preferences`；Mac 客户端里打开独立的设置窗口。
- **整段旅程：重启后设置还在。** 运行 `pnpm twh drive --script verify-preferences`。Mac 客户端（或用参数指定已安装的应用），用隔离的用户资料。它通过真实界面改默认保存目录、关掉提醒、切到 English，清空浏览器存储并重启后逐项读回，还检查了照片目录、导入类型、对话面板宽度和窗口尺寸都保留。偏好页相关的断言（只有一个开关、English 页签、Preferences 标题）与当前源码一致；随手记保存位置那一段属于 `capture.md`，这里未逐行核对。未核实运行结果。
- **整段旅程：两个地址能打开。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它对这一页的断言是 `/preferences` 和 `/preferences?tab=ai` 的一级标题可见、没有接口报错。但这几行排在已经过时的随手记段落之后（见 `capture.md` 的 Gotchas），按静态比对走不到。未核实运行结果。
- **留证。** 运行 `pnpm twh go /preferences`、`pnpm twh evidence screenshot preferences-general` 和 `pnpm twh evidence aria preferences-general`。两份证据里都能看到两个页签和「语言、通知、键盘快捷键」三组设置。

## Gotchas

- 当前页签只在页面加载时从地址里读一次。页内切换不会改地址，刷新后回到「通用」，除非地址带 `tab=ai`。
- 切到英文后所有中文按钮名都会变，包括切回中文的那个页签（叫「Chinese」）。「切到 English 再切回中文」这一步必须做完。
- 通知开关读回的值是字符串 `true` / `false`，不是布尔值。已保存的 `false` 会被当成真实选择保留，不会被默认值覆盖。
- 设置页是工具窗口：没有标题栏的搜索和对话按钮，不弹模型引导。Mac 客户端里它只开一个，再点「偏好设置」只是把它提到前面。
- 存储位置的「在 Finder 中显示」和「移动内容位置…」只在 Mac 客户端出现；浏览器里只显示位置和大小。「移动内容位置…」会真的复制并迁移文件，不要在验证里点。
- 应用更新只在打包后的 Mac 客户端出现（开发版和商店版不显示）。它要联网，没有现成脚本覆盖，未核实。
- 第三方 API Key 的添加、更换、移除需要真实密钥，没有匿名验证路径，未核实。运行方式、模型厂商、模型的下拉框一改就会自动保存到全局设置，验证时不要随便选。
- 商店版才有「连接已登录的 Codex…」按钮，未核实。
- Mac 客户端的菜单「The Way Here → 偏好设置…」（⌘,）没法只靠 `page` 和 `expect` 去点。「从侧边栏进入」在桌面宿主里只确认点了按钮、主窗口地址不变，新开的设置窗口里有什么未核实。
- 「改思考深度会自动保存」和「存储位置」没有任何现成脚本走过。存储位置的组件和服务端路由在工作树里还是未提交的新文件，运行结果未核实。
- `verify-web` 对这两个地址的断言走不到（见上）。
