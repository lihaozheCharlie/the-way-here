# 导入资料

导入资料把聊天记录、支付宝账单和照片带进生活记录。用户选材料类型，挑文件或文件夹，确认保存位置，导入完成后记录就出现在生活记录里，之后可以在那里继续整理或构建。要读的如果是日记或笔记，不用导入，直接打开文件夹。

## Sub-features

- `imports-open` 打开导入弹窗「带一段记录进来」，分两步：选类型加材料、确认位置。
- `imports-chat` 聊天记录：选平台（ChatGPT、Claude、Gemini、DeepSeek、豆包、其他 AI），支持 ZIP、JSON、HTML、TXT、Markdown 文件或文件夹。
- `imports-bill` 消费账单：支付宝导出的 CSV，一次一份。
- `imports-photos` 照片：JPG、PNG、WebP，每批最多 50 张；给这段记忆起个名字，导入后进入认人物。
- `imports-destination` 确认位置：在保存位置树里选文件夹或新建文件夹，右侧有这批材料的摘要。
- `imports-complete` 导入完成：弹窗关闭，生活记录跳到保存位置并出现新记录。
- `imports-cancel` 取消与返回：取消关闭弹窗，上一步回到第一步且已选的文件还在。
- `imports-folder-nudge` 「要读日记或笔记？不用导入」：一键转去「打开文件夹…」。

## How to get to it (user POV)

- 生活记录页工具栏的「导入资料」按钮。
- 快捷键 ⌘O / Ctrl+O。浏览器里由页面处理；桌面端对应菜单「文件 → 导入生活记录…」。它落到 `/sources?import=true` 并自动打开弹窗。
- 直接打开 `/sources?import=true`。
- 此刻「找照片」里选好照片后点「整理成照片记忆」，直接进入第二步，照片已经带上。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。导入会真的在生活记录里新建文件夹和文件。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 首次启动的模型引导已经处理过，见 `capture.md`。
- 准备三个样例文件，放在同一个临时目录里，下文把它的绝对路径记作 `<样例目录>`。内容照 `scripts/verify-web.mjs` 第 313 到 332 行：
  - `chat.json`：`{"title": "匿名浏览器对话", "messages": [{"role": "user", "content": "今天试着记录一件小事。"}, {"role": "assistant", "content": "这是一条虚构的验收回复。"}]}`
  - `bill.csv`：三行，行尾用 CRLF。第一行 `支付宝交易记录明细查询`；第二行 `交易号,商家订单号,交易创建时间,付款时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态`；第三行 `0000000000000000000000000001,anonymous-order,2026-01-01 12:00:00,2026-01-01 12:00:00,2026-01-01 12:00:00,其他,即时到账交易,匿名便利店,测试消费,5.00,支出,交易成功,0.00,0.00,,已支出`
  - `photo.png`：任意一张 PNG，脚本用的是 32 乘 32 的白色方块。
- 导入本身不需要模型。导入之后的「构建这份记录」「开始聊聊」会调用模型，这里不做。
- 弹窗会记住上次用的类型和平台。全新状态停在「聊天记录」和「ChatGPT」；下面的步骤每次都显式点一遍类型。

- **打开导入弹窗。** 运行 `pnpm twh doctor`、`pnpm twh go /sources` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '导入资料', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await expect(dialog).toBeVisible(); await expect(dialog.locator('.import-type-grid > button')).toHaveCount(3); await expect(dialog.getByRole('button', { name: '下一步', exact: true })).toBeDisabled(); return { types: await dialog.locator('.import-type-grid > button').allTextContents(), pressed: await dialog.locator('.import-type-grid > button[aria-pressed=true]').allTextContents() };"`。`doctor` 以退出码 0 结束；弹窗「带一段记录进来」打开；三种类型是「聊天记录、消费账单、照片」；没选文件时「下一步」禁用；`pressed` 是上次用的类型，全新状态是「聊天记录」那一项。
- **选聊天记录并挑文件。** 点「聊天记录」，再喂入样例文件。运行 `pnpm twh drive --eval "const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await dialog.locator('.import-type-grid > button').filter({ hasText: '聊天记录' }).click(); await dialog.locator('[name=import-files]').setInputFiles('<样例目录>/chat.json'); await expect(dialog.locator('.import-selection-list')).toContainText('chat.json'); return { providers: await dialog.locator('.import-provider-list button[aria-pressed=true]').allTextContents(), selected: await dialog.locator('.import-selection-list header').innerText(), next: await dialog.getByRole('button', { name: '下一步', exact: true }).isEnabled() };"`。平台一栏有一个被选中（全新状态是「ChatGPT」）；已选清单里出现 `chat.json`，标题是「已选 1 个文件 · …」；「下一步」可以点了。用户看到的是「选择文件」「选择文件夹」按钮，自动化直接把文件交给隐藏的文件输入框。
- **下一步，在保存位置里新建文件夹。** 点「下一步」，再点「新建文件夹」并输入名字回车。运行 `pnpm twh drive --eval "const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await dialog.getByRole('button', { name: '下一步', exact: true }).click({ timeout: 30000 }); const picker = dialog.getByRole('tree', { name: '保存位置' }); await expect(picker).toBeVisible(); await expect(picker.locator('[data-folder^=外部来源]')).toHaveCount(0); await dialog.getByRole('button', { name: '新建文件夹', exact: true }).click(); const input = dialog.getByRole('textbox', { name: '新文件夹名称', exact: true }); await input.fill('验收导入目录'); await input.press('Enter'); const chosen = await dialog.locator('.import-selected-path').innerText(); await expect(picker.getByRole('treeitem').filter({ hasText: '验收导入目录' })).toHaveAttribute('aria-selected', 'true'); await expect(dialog.locator('.import-summary')).toContainText('聊天记录'); return { chosen, summary: await dialog.locator('.import-summary').innerText() };"`。第二步出现「保存位置」树，树里不列外部来源；新建的文件夹被选中，`chosen` 是「已选：」加它的路径；摘要里的类型是「聊天记录」。
- **导入并用接口再看一遍。** 点「导入 1 个文件」。运行 `pnpm twh drive --eval "const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await dialog.getByRole('button', { name: '导入 1 个文件', exact: true }).click({ timeout: 30000 }); await expect(dialog).toHaveCount(0, { timeout: 30000 }); return await page.evaluate(async () => (await (await fetch('/api/imports')).json()).map(batch => ({ channel: batch.channel, files: batch.files.length, folder: batch.targetFolder })));"`。导入后弹窗关闭；从接口看，返回的批次里有一项 `channel` 是 `chatgpt`，`files` 是 1，`folder` 是刚选的目录。
- **导入消费账单。** 点「导入资料」，选「消费账单」，喂入 CSV，下一步后导入。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '导入资料', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await dialog.locator('.import-type-grid > button').filter({ hasText: '消费账单' }).click(); await dialog.locator('[name=import-files]').setInputFiles('<样例目录>/bill.csv'); await expect(dialog.locator('.import-selection-list')).toContainText('bill.csv'); await dialog.getByRole('button', { name: '下一步', exact: true }).click({ timeout: 30000 }); await expect(dialog.locator('.import-summary')).toContainText('消费账单'); await dialog.getByRole('button', { name: '导入 1 个文件', exact: true }).click({ timeout: 30000 }); await expect(dialog).toHaveCount(0, { timeout: 30000 }); return await page.evaluate(async () => (await (await fetch('/api/imports')).json()).map(batch => ({ channel: batch.channel, files: batch.files.length, folder: batch.targetFolder })));"`。摘要里的类型是「消费账单」；导入后弹窗关闭；返回的批次里多了一项 `channel` 是 `alipay`。
- **导入照片。** 点「导入资料」，选「照片」，喂入 PNG，下一步后给这段记忆起名，再点「开始认人物」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '导入资料', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await dialog.locator('.import-type-grid > button').filter({ hasText: '照片' }).click(); await expect(dialog.getByRole('button', { name: '选择照片', exact: true })).toBeVisible(); await dialog.locator('[name=import-files]').setInputFiles('<样例目录>/photo.png'); await dialog.getByRole('button', { name: '下一步', exact: true }).click(); await dialog.getByRole('textbox', { name: '这段记忆叫什么', exact: true }).fill('匿名照片验收'); await expect(dialog.locator('.import-summary')).toContainText('照片'); await dialog.getByRole('button', { name: '开始认人物', exact: true }).click({ timeout: 30000 }); await expect(dialog).toHaveCount(0, { timeout: 30000 }); const memory = page.getByRole('dialog', { name: '照片记忆', exact: true }); const opened = await memory.isVisible(); if (opened) await memory.getByRole('button', { name: '关闭照片记忆', exact: true }).click(); return { opened, batches: await page.evaluate(async () => (await (await fetch('/api/imports')).json()).map(batch => ({ channel: batch.channel, files: batch.files.length, folder: batch.targetFolder }))) };"`。选文件的按钮是「选择照片」；第二步多了一个「这段记忆叫什么」输入框，摘要里的类型是「照片」；最后一步的按钮是「开始认人物」。导入后弹窗关闭，返回的批次里多了一项 `channel` 是 `photos`。生活记录如果接着打开了「照片记忆」弹窗（`opened` 为 `true`），那就是认人物的一步，这里先把它关掉。
- **上一步和取消。** 运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '导入资料', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await dialog.locator('.import-type-grid > button').filter({ hasText: '聊天记录' }).click(); await dialog.locator('[name=import-files]').setInputFiles('<样例目录>/chat.json'); await dialog.getByRole('button', { name: '下一步', exact: true }).click(); await expect(dialog.getByRole('tree', { name: '保存位置' })).toBeVisible(); await dialog.getByRole('button', { name: '上一步', exact: true }).click(); await expect(dialog.locator('.import-selection-list')).toContainText('chat.json'); await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(dialog).toHaveCount(0); return await dialog.count();"`。点「上一步」回到第一步，已选的 `chat.json` 还在；点「取消」后弹窗关闭，返回 0，什么都没有导入。
- **选错类型会有提示。** 在「消费账单」里选一个 JSON 文件。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '导入资料', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await dialog.locator('.import-type-grid > button').filter({ hasText: '消费账单' }).click(); await dialog.locator('[name=import-files]').setInputFiles('<样例目录>/chat.json'); await expect(dialog.getByRole('alert')).toContainText('请选择支付宝导出的 CSV 账单。'); await expect(dialog.getByRole('button', { name: '下一步', exact: true })).toBeDisabled(); await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(dialog).toHaveCount(0); return await dialog.count();"`。弹窗底部出现提示「请选择支付宝导出的 CSV 账单。」，「下一步」保持禁用；「取消」关闭弹窗。
- **用 ⌘O 打开导入（浏览器宿主）。** 运行 `pnpm twh drive --eval "if (await page.evaluate(() => Boolean(window.desktop))) return '桌面宿主，跳过这一步'; let prompts = 0; const reject = async dialog => { prompts += 1; await dialog.dismiss(); }; page.on('dialog', reject); await page.keyboard.press('ControlOrMeta+o'); const dialog = page.getByRole('dialog', { name: '带一段记录进来', exact: true }); await expect(dialog).toBeVisible(); page.off('dialog', reject); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); return { prompts, search: new URL(page.url()).search };"`。浏览器里导入弹窗打开，期间没有冒出路径输入框（`prompts` 是 0）；Esc 关闭弹窗；地址栏里已经不带 `import=true`。桌面客户端里返回「桌面宿主，跳过这一步」，那里 ⌘O 属于原生菜单。
- **整段旅程：三种导入走真实接口。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务，不调用模型。它证明了聊天 JSON、支付宝 CSV 和照片都能从「导入资料」按钮一路导入完成，`/api/imports` 里出现 chatgpt、alipay、photos 三种批次；也证明了 ⌘O 和 Ctrl+O 在每个路由上都打开同一个导入弹窗，且不弹文件夹提示。它的此刻那一组有过时的定位，见 `capture.md`。
- **整段旅程：导入弹窗的两步。** 运行 `pnpm twh drive --script verify-source-tree-and-outline`。组件级环境，接口拦截。它证明了三种类型、类型偏好、第二步的保存位置树不列外部来源、在保存位置里展开到嵌套目录并新建文件夹，以及导入请求带上了选定的目标文件夹。
- **整段旅程：三种导入入口。** 运行 `pnpm twh drive --script verify-life-record-ux`。组件级环境，接口拦截。它证明了三种类型下弹窗的布局、弹窗里转去「打开文件夹…」的入口、关闭按钮和 Esc 关闭。
- **整段旅程：从找照片进入。** 运行 `pnpm twh drive --script verify-capture-sources`。浏览器加真实服务，照片桥是伪造的。它证明了从「找照片」带着照片进入第二步、给记忆起名、确认导入、认人物、讲故事和收进理解的整条流程。它用的语音按钮名已经过时。
- **整段旅程：原生菜单打开导入。** 运行 `pnpm twh drive --script verify-desktop`。桌面客户端。它证明了原生菜单「导入生活记录…」打开同一个弹窗，弹窗里有三种类型。
- **留证。** 运行 `pnpm twh evidence screenshot imports-dialog` 和 `pnpm twh evidence aria imports-dialog`。在弹窗打开时取证，两份证据里都能看到三种类型和「下一步」按钮。

## Gotchas

- 导入是真实写入：会在生活记录里新建文件夹和文件，账单和照片还会生成各自的记忆记录。只在一次性数据目录里做。
- 弹窗记住上次的类型和平台（偏好 `the-way-here.import-route` 和 `the-way-here.import-provider`）。复用配置目录时不一定停在「聊天记录」，所以每一步都显式点类型。
- 文件输入框是隐藏的。自动化用 `setInputFiles` 把文件直接交给 `[name=import-files]`，不要去点系统文件选择框。聊天记录和照片另有 `[name=import-folder]` 接收整个文件夹。
- 账单一次只取第一份 CSV。单批材料上限 100 MB；照片每批最多 50 张、单张 100 MB，超过 20 MB 会在本地压缩，HEIC 要先导出成 JPG。这些上限的提示文案未核实。
- 样例格式照的是 `verify-web` 里那三份。其他平台导出文件的解析结果未核实。
- 从「找照片」进入时没有第一步，返回按钮是「返回选照片」，不是「上一步」。
- 第二步的保存位置树只列知识库内的文件夹，不列外部来源。新建的文件夹是真的。
- ⌘O 在浏览器里由页面处理，在桌面客户端里由原生菜单处理。用 `page.keyboard` 能不能触发原生菜单，未核实；拿不准就点「导入资料」按钮。
- 导入后的「构建这份记录」「开始聊聊」会调用模型并可能更新 Wiki，不属于这里的确定性验证。
- `verify-redesign` 里的「新建一个文件夹」按钮和 `input[name="new-import-folder"]` 已经不存在，现在是「新建文件夹」和「新文件夹名称」输入框。静态比对，未核实运行结果。
- 界面语言是英文时，所有中文按钮名都会变。
