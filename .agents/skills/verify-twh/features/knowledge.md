# 已有理解总览、知识卡片与思维模型

「已有理解」把模型目前对用户的判断集中在一处。总览页给出四类理解的入口、数量和最新一条，并能展开摘要；个人主线、反复循环、现实系统三页以「左侧列表 + 右侧正文」逐条阅读、查找和直接修改；思维模型页只读展示每个判断工具，并能跳到完整页面。浏览器和 Mac 客户端行为一致，没有桌面专属部分。

## Sub-features

- `knowledge-overview` 总览页列出四张分类入口卡，每张显示数量和最新一条理解。
- `knowledge-entry-card` 点入口卡进入对应分类，窗口标题随之变化。
- `knowledge-digest` 展开「自我理解摘要与校准」后显示四类摘要，思维模型卡片可在摘要与校准之间切换。
- `knowledge-ask` 总览页「一起核对」直接打开右侧 Agent 对话，默认只读。
- `knowledge-dream-insights` 有已收藏的梦境洞察时，总览底部出现「从梦境带回的洞察」入口。
- `knowledge-cards` 个人主线、反复循环、现实系统共用「内容列表 + 正文」浏览页。
- `knowledge-card-switch` 点列表项或「上一条 / 下一条」切换卡片，地址带 `item=`。
- `knowledge-card-search` 「在当前分类中查找」过滤列表，无匹配时显示空态。
- `knowledge-card-edit` 正文按 Enter 或单击进入编辑，Esc 退出并自动保存。
- `knowledge-shelf` 列表栏可收成细栏再展开，正文始终留在视口里。
- `knowledge-mental-models` 思维模型页只读展示模型，切换后地址带 `model=`。
- `knowledge-model-full` 「阅读完整模型」打开完整页面，返回按钮回到思维模型。

## How to get to it (user POV)

- 侧边栏「已有理解」和它的子项「总览」，路由 `/knowledge`。「已有理解」右侧的箭头收起或展开五个子项。
- 侧边栏「已有理解 → 理解自己」（`/insights`），再点各分区的「查看全部 N 条」「打开完整主线」「查看完整循环」「打开完整系统」。
- 四个分类页面（个人主线、反复循环、现实系统、思维模型）顶部的分类页签，路由 `/cards/personal-lines`、`/cards/cycles`、`/cards/systems`、`/mental-models`。
- 总览页的四张入口卡：理解自己、人生轨迹、近况回信、人与世界。
- 标题栏「搜索与命令」，输入栏目名后选带「前往栏目」的那一项。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- 旧地址 `/wiki`、`/understanding`、`/understanding/overview` 自动跳到 `/knowledge`。
- 直接打开带参数的地址：`/cards/personal-lines?item=<页面 id>` 或 `/mental-models?model=<模型>`，一进来就选中那一项。下面用思维模型走一次。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 演示库里个人主线、反复循环、现实系统各有两条卡片，所以「切换卡片」这几步要求列表至少两项。
- 配置目录是全新的，没有绑定在这些页面上的对话。第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 视口宽度至少 1024。列表栏 304px 和 40px 的数值取自 1440 与 1024 两档。

- **打开总览。** 点侧边栏「已有理解 → 总览」。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '已有理解' })).toBeVisible(); await expect(page.locator('main .loading')).toHaveCount(0); return { title: await page.locator('.desktop-window-title').innerText(), lede: await page.locator('.understanding-overview-lede > span').innerText() };"`。窗口标题是 `总览 · <知识库名>`，标题下方一行形如「N 条理解 · 来自 M 份生活记录」。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，「一起核对」那一步只验证到对话面板打开，不要发送。
- **从入口卡进入分类。** 点「近况回信」入口卡。运行 `pnpm twh drive --eval "const cards = page.locator('.understanding-entry'); await expect(cards).toHaveCount(4); const names = await cards.locator('h2').allTextContents(); await cards.filter({ hasText: '近况回信' }).click(); await expect(page).toHaveURL(origin + '/letters'); await expect(page.locator('.desktop-window-title')).toContainText('近况回信'); return { names, url: page.url() };"`。四张卡依次是「理解自己、人生轨迹、近况回信、人与世界」，地址变成 `/letters`。
- **从「理解自己」的查看全部进入。** 在理解自己页点个人主线分区的「查看全部 N 条」。运行 `pnpm twh go /insights` 和 `pnpm twh drive --eval "await page.locator('#insights-lines').getByRole('link', { name: /查看全部/ }).click(); await expect(page).toHaveURL(origin + '/cards/personal-lines'); await expect(page.locator('.source-file-shell')).toBeVisible(); return page.url();"`。进入个人主线的卡片页，左侧出现列表栏。
- **展开摘要。** 回到总览，点「展开自我理解摘要与校准」。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "const digest = page.locator('.understanding-digest'); await expect(digest).toBeHidden(); await page.locator('.understanding-detail-disclosure > summary').click(); await expect(digest).toBeVisible(); return await digest.locator('h2').allTextContents();"`。折叠时摘要不可见，点开后可见；返回的四个小标题是「个人主线、反复循环、现实系统、思维模型」。
- **旧地址跳转。** 运行 `pnpm twh go /wiki` 和 `pnpm twh drive --eval "await expect(page).toHaveURL(origin + '/knowledge'); await expect(page.getByRole('heading', { level: 1, name: '已有理解' })).toBeVisible(); return page.url();"`，再运行 `pnpm twh go /understanding` 和同一条 `pnpm twh drive --eval`，最后运行 `pnpm twh go /understanding/overview` 和同一条 `pnpm twh drive --eval`。三个旧地址都被替换成 `/knowledge`，看到的是总览页。
- **一起核对。** 点总览底部的「一起核对」。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '一起核对', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('#context-agent-title')).toHaveText('一起往下想'); await expect(page.locator('.context-agent-boundary')).toHaveText('严格只读，不会改动任何文件'); return await page.locator('.context-agent-composer textarea').getAttribute('placeholder');"`。右侧对话打开，标题「一起往下想」，边界提示是只读；返回输入框占位文字「想从哪里开始？」。没有模型时发送按钮是禁用的，不要点发送。
- **搜索与命令直达。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('总览'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/knowledge'); return page.url();"`。面板关闭，落在总览页。
- **打开知识卡片页。** 运行 `pnpm twh go /cards/personal-lines` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '个人主线' }).first()).toBeVisible(); const shell = page.locator('.source-file-shell'); await expect(shell).toHaveCSS('width', '304px'); await expect(page.locator('.source-preview .record-document-scroll .editable-document-body')).toBeVisible(); return { count: await page.locator('.pane-shelf-count').innerText(), titles: await page.locator('.source-file-select').allTextContents() };"`。左侧列表栏宽 304px，右侧正文可见；`count` 形如 `2 / 2`，`titles` 是两条个人主线的标题。
- **切换卡片。** 点列表第二项。运行 `pnpm twh drive --eval "const items = page.locator('.source-file-select'); const title = await items.nth(1).locator('b').innerText(); await items.nth(1).click(); await expect(items.nth(1)).toHaveAttribute('aria-current', 'true'); await expect(page.locator('.source-preview .editable-document-body')).toBeVisible(); return { selected: title, url: page.url() };"`。第二项带 `aria-current="true"`，地址带上 `item=`。
- **上一条 / 下一条。** 点正文下方的「上一条」，再点「下一条」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '上一条', exact: true }).click(); await expect(page.locator('.source-file-select').first()).toHaveAttribute('aria-current', 'true'); const first = await page.locator('.collection-pager span').innerText(); await page.getByRole('button', { name: '下一条', exact: true }).click(); await expect(page.locator('.source-file-select').nth(1)).toHaveAttribute('aria-current', 'true'); return { afterPrevious: first, afterNext: await page.locator('.collection-pager span').innerText() };"`。翻页条先显示 `1 / 2`，再显示 `2 / 2`。
- **收起再展开列表栏。** 点列表栏右上角的收起按钮，再点一次。运行 `pnpm twh drive --eval "const shell = page.locator('.source-file-shell'); const toggle = shell.locator('.pane-shelf-toggle'); await toggle.click(); await expect(shell).toHaveCSS('width', '40px'); await expect(page.locator('.source-preview .record-document-scroll .editable-document-body')).toBeInViewport(); const collapsed = await toggle.getAttribute('aria-expanded'); await toggle.click(); await expect(shell).toHaveCSS('width', '304px'); return { collapsedAriaExpanded: collapsed, expandedAriaExpanded: await toggle.getAttribute('aria-expanded') };"`。列表栏收成 40px 时正文仍在视口里；按钮的 `aria-expanded` 先是 `false`，展开后是 `true`。
- **分类内查找。** 在「在当前分类中查找」里输入一串不会命中的词，再清空。运行 `pnpm twh drive --eval "const search = page.getByRole('textbox', { name: '在当前分类中查找' }); await search.fill('没有匹配的验收搜索词 83729'); await expect(page.locator('.source-preview-empty')).toBeInViewport(); const empty = await page.locator('.source-preview-empty').innerText(); await search.fill(''); await expect(page.locator('.source-preview .editable-document-body')).toBeVisible(); return { empty, count: await page.locator('.pane-shelf-count').innerText() };"`。无匹配时右侧显示「没有匹配内容」；清空后正文回来，计数回到 `2 / 2`。
- **进入编辑再退出。** 在正文上按 Enter，再按 Esc。运行 `pnpm twh drive --eval "const body = page.locator('.source-preview .editable-document-activate'); await body.press('Enter'); await expect(page.locator('[data-document-editor]')).toBeFocused(); await page.keyboard.press('Escape'); await expect(body).toBeVisible(); return await page.locator('[data-document-editor]').count();"`。按 Enter 后编辑器获得焦点；Esc 后回到阅读状态，返回的编辑器数量是 0。不要在这一步输入内容。
- **分类页签。** 点页面上方的「反复循环」，再点「现实系统」，再点「思维模型」。运行 `pnpm twh drive --eval "const tabs = page.getByRole('navigation', { name: '页面分类' }); await tabs.getByRole('link', { name: '反复循环', exact: true }).click(); await expect(page).toHaveURL(origin + '/cards/cycles'); await expect(page.getByRole('heading', { level: 1, name: '反复循环' }).first()).toBeVisible(); await tabs.getByRole('link', { name: '现实系统', exact: true }).click(); await expect(page).toHaveURL(origin + '/cards/systems'); await expect(page.getByRole('heading', { level: 1, name: '现实系统' }).first()).toBeVisible(); await expect(page.locator('.source-file-select').nth(1)).toBeAttached(); return { titles: await page.locator('.source-file-select').allTextContents(), url: page.url() };"`，再运行 `pnpm twh drive --eval "await page.getByRole('navigation', { name: '页面分类' }).getByRole('link', { name: '思维模型', exact: true }).click(); await expect(page).toHaveURL(origin + '/mental-models'); return page.url();"`。地址依次变成 `/cards/cycles`、`/cards/systems`、`/mental-models`；到现实系统时列表里是两条现实系统。
- **思维模型页。** 点列表第二项。运行 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '思维模型' }).first()).toBeVisible(); await expect(page.locator('.document-readonly-title')).toBeVisible(); await expect(page.locator('.source-preview .editable-document-activate')).toHaveCount(0); const items = page.locator('.source-file-select'); const count = await items.count(); const first = await page.locator('.document-readonly-title').innerText(); await items.nth(1).click(); await expect(items.nth(1)).toHaveAttribute('aria-current', 'true'); return { count, first, second: await page.locator('.document-readonly-title').innerText(), url: page.url() };"`。预览是只读的（没有可编辑正文）；点第二项后预览标题变成第二个模型，地址带上 `model=`。
- **带参数的地址可以直接打开。** 把上一步返回的 `url` 原样再打开一次。运行 `pnpm twh go "<上一步返回的 url>"` 和 `pnpm twh drive --eval "await expect(page.locator('.document-readonly-title')).toHaveText('<上一步返回的 second>'); return page.url();"`。一打开就是刚才那个模型。这条命令里的地址和标题要照上一步的返回值填，不是固定文字。
- **阅读完整模型。** 点「阅读完整模型」，再点返回按钮。运行 `pnpm twh drive --eval "await page.getByRole('link', { name: /阅读完整模型/ }).click(); const back = page.locator('.reader .context-back'); await expect(back).toContainText('返回思维模型'); await expect(page.locator('.reader')).toBeVisible(); const opened = page.url(); await back.click(); await expect(page).toHaveURL(origin + '/mental-models'); return { opened, back: page.url() };"`。进入 `/page/…` 的完整页面，返回按钮写着「返回思维模型」，点它回到 `/mental-models`。
- **收起已有理解的子项。** 点「已有理解」右侧的箭头，再点一次。运行 `pnpm twh drive --eval "const nav = page.getByRole('navigation', { name: '主要导航' }); await nav.getByRole('button', { name: '收起已有理解', exact: true }).click(); await expect(nav.getByRole('link', { name: '总览', exact: true })).toHaveCount(0); await nav.getByRole('button', { name: '展开已有理解', exact: true }).click(); await expect(nav.getByRole('link', { name: '总览', exact: true })).toBeVisible(); return '子导航已恢复';"`。收起后侧边栏没有「总览」，展开后回来。
- **整段旅程：路由与卡片浏览。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它证明了十个主路由（含 `/knowledge`、`/insights`）在 1440 和 1024 两档宽度加载、四类卡片页与思维模型页的列表宽度（304px 与 40px）、点第二项后的 `aria-current`、个人主线共享文档的目录卡、Enter 进入编辑、分类内查找的空态。这些段落排在脚本的随手记段落之前；随手记段落用的按钮名已经过时（见 `capture.md` 的 Gotchas），静态比对，未核实运行结果。
- **整段旅程：桌面端同一路由。** 运行 `pnpm twh drive --script verify-desktop`。Mac 客户端，走真实 IPC。它证明了 `/knowledge` 和 `/insights` 在桌面端加载完成且侧边栏有激活项。静态比对，未核实运行结果。
- **留证。** 运行 `pnpm twh go /cards/personal-lines`、`pnpm twh evidence screenshot knowledge-cards` 和 `pnpm twh evidence aria knowledge-cards`。两份证据里都能看到左侧「个人主线」列表和右侧正文。

## Gotchas

- 列表栏的开合、子导航的展开、摘要的展开都是页面内存状态。每次 `pnpm twh go` 重新进入都会回到展开，不要跨命令期待它们保持收起。
- 四页里只有思维模型页的预览是只读的，它也没有查找框。对它按 Enter 不会出现编辑器，这是正确行为。
- 卡片正文会自动保存：进入编辑后只要敲字就会改写知识库里的页面。只验证「进入 / 退出」，不要输入内容。
- 英文界面下演示库的标题会被英文覆盖层替换，窗口标题也会变。本文件的名称都按中文写。
- 总览底部的「从梦境带回的洞察」只在已有收藏洞察时出现，全新实例没有属正常。见 `dreams.md`。
- `verify-redesign.mjs` 对 `/knowledge` 的断言（四张入口卡、摘要默认折叠）与当前源码一致，但脚本在更早的 `/questions` 段用了已不存在的「历史记录」页签和「展开AI 协作面板」，走不到这一段。未核实运行结果。
- `verify-file-menus.mjs` 在 `/cards/personal-lines` 用 `.collection-list .file-menu-trigger`，当前源码不再渲染 `.collection-list`（提交 71ac2d1 起卡片列表换了结构）。卡片上的文件菜单位于每个 `.source-file-row` 里的 `.file-menu-trigger`，菜单项是「重命名、打开原始目录、删除」。未核实运行结果。
- `verify-agent-routes.mjs` 走到 `/knowledge` 时去找 `.context-agent-attached-context`，这个类名在提交 09313cb 之后已经不存在。见 `inspector.md`。未核实运行结果。
- 未核实：演示库里思维模型列表的实际条数。不足两条时「思维模型页」这一步点不了第二项，按前置条件不满足上报。
