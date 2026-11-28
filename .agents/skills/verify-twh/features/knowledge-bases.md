# 知识库：切换、新建、删除

每个知识库是一个独立的空间，有自己的记录、理解和对话。用户点侧边栏顶部的空间切换器，在菜单里换一个库、新建一个，或删除自己建的库（演示库不能删）。新建的空间是空白的，演示内容不会被复制；换库后草稿、回信这些内容互不串。删除要先确认，删掉的是本机上的这个库。浏览器和 Mac 客户端行为一致；只有数字快捷键 ⌘1 到 ⌘9 和多窗口同步是 Mac 客户端的方式。

## Sub-features

- `kb-switcher` 侧边栏顶部的切换器显示当前知识库的名字，点开是「切换知识库」菜单。
- `kb-switch` 菜单里每个库一项，当前库带选中标记；演示库带「演示」字样。
- `kb-switch-stay` 换库后留在原来的栏目页面（地址只保留路径）；阅读页回到它所属的栏目，话题页回到值得聊聊，梦的详情页回到梦境。
- `kb-create` 「新建一个知识库」：起名、「创建并开始」，落在空白的新空间。
- `kb-create-blank` 新空间没有记录、回信和演示内容。
- `kb-isolation` 草稿、对话、梦都按知识库隔离，换回去还在。
- `kb-delete` 删除自己建的知识库要先确认；可以取消。
- `kb-delete-current` 删的是当前打开的库时，自动打开另一个保留的空间。
- `kb-demo-notice` 在演示库里，页面上方有一条提示：还没有自己的空间时按钮是「开始我的空间」，打开新建窗口；有了之后是「回到我的空间」，直接切过去。
- `kb-shortcuts` Mac 客户端菜单「知识库 → 打开知识库 1 到 9」，快捷键 ⌘1 到 ⌘9。
- `kb-multiwindow` Mac 客户端里一个窗口换库后，其他窗口刷新；旧窗口的写入会被库的编号校验拦下。

## How to get to it (user POV)

- 侧边栏顶部的知识库名字（带下拉箭头）。
- 菜单最下方的「新建一个知识库」；每个非演示库右侧的删除按钮。
- 演示库提示条上的「开始我的空间」或「回到我的空间」。
- Mac 客户端菜单「知识库 → 打开知识库 N」（⌘N），N 是 1 到 9。
- 地址栏直接访问不换库；换库只有上面这些入口。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。下面会新建一个知识库、往演示库写一条随手记草稿，最后把新建的库删掉。
- 界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 实例里只有演示库一个知识库（id 为 `demo`）。所以演示库提示条上的按钮是「开始我的空间」。
- 配置目录是全新的，第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。

- **打开切换菜单。** 点侧边栏顶部的知识库名字。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "const trigger = page.locator('.global-kb-trigger'); const current = await trigger.innerText(); await trigger.click(); const menu = page.getByRole('menu', { name: '切换知识库' }); await expect(menu).toBeVisible(); await expect(trigger).toHaveAttribute('aria-expanded', 'true'); const options = await menu.getByRole('menuitemradio').allTextContents(); const deleteItems = await menu.getByRole('menuitem', { name: /删除知识库「/ }).count(); await expect(menu.getByRole('menuitem', { name: '新建一个知识库', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused(); return { current, options, deleteItems };"`。菜单打开时切换器带 `aria-expanded="true"`；菜单里是各个库（演示库带「演示」）和「新建一个知识库」；只有演示库时没有删除项，`deleteItems` 是 0；Esc 关闭并把焦点还给切换器。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { active: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop), bases: vault.knowledgeBases.map(base => base.id) }; });"`。`active` 是 `demo`，`lang` 是 `zh-CN`，`bases` 只有 `demo`。
- **演示库提示条上的「开始我的空间」。** 点页面上方提示条的按钮，再点关闭。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "const notice = page.locator('.demo-kb-notice'); await expect(notice).toContainText('先看看我会怎样记住一段生活'); await notice.getByRole('button', { name: '开始我的空间', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '新建知识库' }); await expect(dialog).toBeVisible(); await expect(page.getByRole('textbox', { name: '空间名称', exact: true })).toHaveValue('我的 The Way Here'); await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await expect(dialog).toHaveCount(0); return await page.getByRole('textbox', { name: '空间名称', exact: true }).count();"`。弹出「新建知识库」窗口，名字栏预填「我的 The Way Here」；关闭后窗口消失，返回 0。
- **在演示库留一条草稿。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await box.fill('匿名验收草稿，留在演示库。'); await expect(page.getByText('草稿已暂存', { exact: true })).toBeVisible(); return await box.inputValue();"`。返回刚写的那句话。后面用它验证草稿不串库。
- **新建知识库。** 在切换器菜单里点「新建一个知识库」，起名，点「创建并开始」。运行 `pnpm twh drive --eval "await page.locator('.global-kb-trigger').click(); await page.getByRole('menuitem', { name: '新建一个知识库', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '新建知识库' }); await expect(dialog).toBeVisible(); await page.getByRole('textbox', { name: '空间名称', exact: true }).fill('匿名验收空间'); await page.getByRole('button', { name: '创建并开始', exact: true }).click(); await expect(page.locator('.global-kb-trigger')).toContainText('匿名验收空间'); await expect(page.locator('.knowledge-base-transition')).toHaveCount(0); return { url: page.url(), notice: await page.locator('.demo-kb-notice').count() };"`。切换器显示「匿名验收空间」，落在首页 `/`，没有演示库提示条。
- **新空间是空的，草稿不串库。** 运行 `pnpm twh drive --eval "const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await expect(box).toHaveValue(''); return await box.inputValue();"`，再运行 `pnpm twh go /letters` 和 `pnpm twh drive --eval "await expect(page.getByText('当前范围暂无回信，可以切换筛选查看。', { exact: true })).toBeVisible(); return page.url();"`。新空间里此刻的输入框是空的，不是演示库那条草稿；近况回信显示「当前范围暂无回信，可以切换筛选查看。」。
- **切回演示库。** 在切换器菜单里点带「演示」的那一项。运行 `pnpm twh drive --eval "await page.locator('.global-kb-trigger').click(); await page.getByRole('menuitemradio').filter({ hasText: '演示' }).click(); await expect(page.locator('.global-kb-trigger')).not.toContainText('匿名验收空间'); await expect(page.locator('.demo-kb-notice')).toBeVisible(); return { current: await page.locator('.global-kb-trigger').innerText(), url: page.url() };"`。切换器不再显示「匿名验收空间」，演示库提示条回来，仍留在近况回信页。
- **草稿还在。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "const box = page.getByRole('textbox', { name: '此刻的记录', exact: true }); await expect(box).toHaveValue('匿名验收草稿，留在演示库。'); return await box.inputValue();"`。输入框里还是那条草稿。
- **演示库提示条上的「回到我的空间」。** 有了自己的空间后，演示库里提示条的按钮变成「回到我的空间」。点它。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "const notice = page.locator('.demo-kb-notice'); await notice.getByRole('button', { name: '回到我的空间', exact: true }).click(); await expect(page.locator('.global-kb-trigger')).toContainText('匿名验收空间'); await expect(notice).toHaveCount(0); return { url: page.url(), current: await page.locator('.global-kb-trigger').innerText() };"`。切换器显示「匿名验收空间」，仍留在已有理解页，演示库提示条消失。
- **删除当前的知识库：先取消。** 在切换器菜单里点「匿名验收空间」右侧的删除按钮，再点「取消」。运行 `pnpm twh drive --eval "await page.locator('.global-kb-trigger').click(); await page.getByRole('menuitem', { name: '删除知识库「匿名验收空间」', exact: true }).click(); const dialog = page.getByRole('alertdialog', { name: '删除这个知识库？' }); await expect(dialog).toBeVisible(); await expect(dialog).toContainText('这是当前打开的知识库。删除后会自动打开另一个保留的空间'); await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.locator('.global-kb-trigger')).toContainText('匿名验收空间'); return '取消后仍在匿名验收空间';"`。确认框写明这是当前打开的知识库；取消后什么都没变。
- **删除当前的知识库：确认。** 再点一次删除按钮，点「删除知识库」。运行 `pnpm twh drive --eval "await page.locator('.global-kb-trigger').click(); await page.getByRole('menuitem', { name: '删除知识库「匿名验收空间」', exact: true }).click(); const dialog = page.getByRole('alertdialog', { name: '删除这个知识库？' }); await dialog.getByRole('button', { name: '删除知识库', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.locator('.global-kb-trigger')).not.toContainText('匿名验收空间'); return await page.evaluate(async () => (await (await fetch('/api/vault')).json()).knowledgeBases.map(base => base.id));"`。确认框消失，切换器换成演示库的名字；从知识库接口读回只剩 `demo`。
- **整段旅程：新建、空状态、切换、隔离、删除。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它对这一功能的断言是：从菜单新建并打开一个新库、新库里此刻的输入框是空的、近况回信显示空状态、切回演示库后能读到回信、草稿仍在、删除一个非当前的库后接口里只剩一个库。但这一段排在已经过时的随手记段落之后（见 `capture.md` 的 Gotchas），按静态比对走不到。未核实运行结果。
- **整段旅程：桌面端切换。** 运行 `pnpm twh drive --script verify-photo-library`。Mac 客户端，照片接口是伪造的。它的最后几步证明了在桌面端用菜单切到另一个库后切换器显示新库名、首页找照片的结果被清空。它要求先编好原生照片组件。静态比对与当前源码一致，未核实运行结果。
- **留证。** 运行 `pnpm twh go /knowledge`、`pnpm twh drive --eval "await page.locator('.global-kb-trigger').click(); await expect(page.getByRole('menu', { name: '切换知识库' })).toBeVisible(); return '菜单已打开';"`、`pnpm twh evidence screenshot knowledge-base-switcher` 和 `pnpm twh evidence aria knowledge-base-switcher`。两份证据里都能看到打开的「切换知识库」菜单。

## Gotchas

- 换库后页面会整页重新加载，并留在原来的栏目页面（地址只留路径，查询参数会丢）。例外：阅读页回到它所属的栏目，话题页回到值得聊聊，梦的详情页回到梦境。只有新建和删除之后才落在首页。
- 知识库在别处被换掉（不是从这个菜单换的）时，页面会退回首页，随手记和偏好设置两页留在原页。
- 换库过程中切换器是禁用的，页面上有一条「正在打开「某库」…」的状态。等它消失再做下一步。
- 演示库不能删除：菜单里没有它的删除项，只剩一个库时也没有任何删除项。
- 新建的知识库会写进实例的配置，删除后不会留副本。验证完把新建的库删掉；删不掉时用 `pnpm twh cleanup` 整体清理。
- 演示库提示条只在演示库里出现，而且偏好设置和随手记这两个工具窗口里没有。
- 数字快捷键 ⌘1 到 ⌘9 在浏览器里由页面自己处理，在 Mac 客户端里由原生菜单处理；焦点在输入框里时不触发。两种宿主下用 `page.keyboard` 能不能触发都没有现成脚本走过，未核实。
- 多窗口同步只在 Mac 客户端里有，没有匿名验证路径，未核实。
- 英文界面下演示库在菜单里显示为英文名，但「演示」字样的标记会变成英文，按「演示」文字去找会匹配不到。本文件的名称都按中文写。
