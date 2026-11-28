# 人与世界：人物与关系图谱

「人与世界」把出现在用户记录里的人按关系角色归类。用户可以在关系图上点角色或人物，在右侧列表里搜索、排序、按角色筛选，点开一张人物卡看别名、关联的阶段、系统和完整页面，或把关系图放大查看。浏览器和 Mac 客户端行为一致，没有桌面专属部分。

## Sub-features

- `people-graph` 关系图以「我」为中心，连到关系角色和高关联人物。
- `people-graph-role` 点图上的角色节点，等于按这个角色筛选列表。
- `people-graph-person` 点图上的人物节点，直接展开这个人的详情。
- `people-graph-center` 点图中心的「我」回到全部。
- `people-search` 搜索姓名、别名或人物线索，无匹配时显示说明。
- `people-sort` 按最近影响、关联最多或姓名排序。
- `people-role-filter` 列表上方的角色筛选，带每个角色的人数。
- `people-detail` 点人物卡在原位展开详情：别名、关联的阶段、角色、系统，以及完整的人物页面；再点一次或点关闭收起。
- `people-photos` 有人物影像时详情里显示照片，可回到照片与讲述。
- `people-more` 人物多于 50 个时先显示一部分，点「继续显示 N 人」。
- `people-tooltip` 摘要被截断时，悬停或键盘聚焦显示完整摘要的提示。
- `people-graph-zoom` 关系图可缩小、放大、适应画布、放大查看。
- `people-file-menu` 人物卡右侧的「更多文件操作」：重命名、打开原始目录、删除。
- `people-roles-only` 有关系角色但还没有人物页面时，这一页换成角色列表。
- `people-ask` 这个页面的右侧 Agent 对话默认是写入模式。

## How to get to it (user POV)

- 侧边栏「已有理解 → 人与世界」，路由 `/relationships`。
- 总览页（`/knowledge`）的「人与世界」入口卡。
- 关系图里的角色节点、人物节点和中心的「我」。
- 人物列表上方的搜索框、「最近影响 / 关联最多 / 按姓名」和角色筛选按钮。
- 人物卡；展开后地址形如 `/relationships?person=<人物页面 id>`，直接打开这个地址也会展开这个人。
- 关系图右上角的「缩小图谱、放大图谱、适应画布、放大查看」。
- 标题栏「搜索与命令」，输入「人与世界」后选带「前往栏目」的那一项。Mac 客户端对应菜单「显示 → 搜索与命令」（⌘K）。
- 旧地址 `/understanding/people` 自动跳到 `/relationships`。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 演示库已有人物页面和六个关系角色（其中有「组织信号源」），且关系图里至少有一个人物节点，所以下面每一步都有东西可点。
- 配置目录是全新的，没有绑定在这个页面上的对话。第一次打开 `/` 会弹出模型引导，照 `preferences.md` 的「推迟模型引导」关掉。
- 这几步只读。人物卡右侧的「更多文件操作」会真的重命名或删除人物页面，不要碰。

- **打开人与世界。** 点侧边栏「已有理解 → 人与世界」。运行 `pnpm twh go /relationships` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '人与世界' })).toBeVisible(); await expect(page.locator('.relationships-page-head p')).toHaveText('这里记录了出现在你世界里的人。模型已根据已有记录为他们分类，你可以随时调整。'); await expect(page.locator('.relationships-graph-card .graph-viewport')).toBeVisible(); await expect(page.locator('.relationships-person-card').first()).toBeVisible(); return { title: await page.locator('.desktop-window-title').innerText(), stat: await page.locator('.relationships-head-stat').innerText(), people: await page.locator('.relationships-toolbar [aria-live=polite]').innerText(), roles: await page.locator('.relationships-role-filters button').allTextContents() };"`。窗口标题是 `人与世界 · <知识库名>`；左边关系图、右边人物卡都可见；`people` 形如「N 人」；`roles` 是「全部 N」加每个角色和它的人数。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`knowledgeBaseId` 是 `demo`，`lang` 是 `zh-CN`。`agentAvailable` 为 `false` 表示没有可用模型，「打开右侧对话」只能走到输入框出现。
- **从总览的入口卡进入。** 点总览页的「人与世界」入口卡。运行 `pnpm twh go /knowledge` 和 `pnpm twh drive --eval "await page.locator('.understanding-entry').filter({ hasText: '人与世界' }).click(); await expect(page).toHaveURL(origin + '/relationships'); return page.url();"`。地址变成 `/relationships`。
- **搜索人物。** 在搜索框里输入一串不会命中的词，再清空。运行 `pnpm twh drive --eval "const search = page.getByRole('textbox', { name: '搜索人物' }); const all = await page.locator('.relationships-person-card').count(); await search.fill('没有匹配的验收人名 83729'); await expect(page.locator('.relationships-person-card')).toHaveCount(0); await expect(page.getByText('没有匹配的人物。可以换一个关键词，或清除当前角色筛选。')).toBeVisible(); await search.fill(''); await expect(page.locator('.relationships-person-card')).toHaveCount(all); return { before: all, after: await page.locator('.relationships-person-card').count() };"`。无匹配时人物卡清空并出现一句说明；清空后人物卡数量回到原值。
- **排序。** 点「按姓名」，再点回「最近影响」。运行 `pnpm twh drive --eval "const sort = page.getByRole('group', { name: '人物排序' }); const names = page.locator('.relationships-person-title b'); const recent = await names.allTextContents(); await sort.getByRole('button', { name: '按姓名', exact: true }).click(); await expect(sort.getByRole('button', { name: '按姓名', exact: true })).toHaveAttribute('aria-pressed', 'true'); const sorted = await names.allTextContents(); await sort.getByRole('button', { name: '最近影响', exact: true }).click(); await expect(sort.getByRole('button', { name: '最近影响', exact: true })).toHaveAttribute('aria-pressed', 'true'); return { recent, sorted };"`。被点的排序带 `aria-pressed="true"`；返回值是两种排序下的名字顺序。
- **按角色筛选。** 点列表上方第一个角色，再点「全部」。运行 `pnpm twh drive --eval "const filters = page.locator('.relationships-role-filters'); const roles = filters.locator('button').filter({ hasNotText: '全部' }); await expect(roles.first()).toBeAttached(); const label = await roles.first().innerText(); await roles.first().click(); await expect(roles.first()).toHaveAttribute('aria-pressed', 'true'); const pressed = await filters.locator('button[aria-pressed=true]').allTextContents(); const shown = await page.locator('.relationships-person-card').count(); await filters.locator('button').filter({ hasText: '全部' }).click(); await expect(filters.locator('button').filter({ hasText: '全部' })).toHaveAttribute('aria-pressed', 'true'); return { role: label, pressed, cardsWhileFiltered: shown };"`。筛选时只有这一个按钮带 `aria-pressed="true"`；点「全部」后恢复。
- **图上的角色节点和中心。** 点关系图里的「组织信号源」节点，再点图中心的「我」。运行 `pnpm twh drive --eval "const node = page.getByRole('button', { name: '筛选关系角色：组织信号源', exact: true }); await node.click(); await expect(node).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.relationships-role-filters button[aria-pressed=true]')).toContainText('组织信号源'); await page.locator('.relationships-center').click(); await expect(page.locator('.relationships-role-filters button[aria-pressed=true]')).toContainText('全部'); return '图上的角色和列表的筛选是同一个状态';"`。点图上的角色后，列表上方同一个角色也被选中；点「我」回到全部。
- **展开与收起人物详情。** 点第一张人物卡，再点详情右上角的关闭。运行 `pnpm twh drive --eval "const card = page.locator('.relationships-person-card').first(); const name = await card.locator('.relationships-person-title b').innerText(); await card.click(); const detail = page.locator('.relationships-person-detail'); await expect(detail).toBeVisible(); await expect(detail.locator('h2').first()).toHaveText(name); await expect(page).toHaveURL(/person=/); const urlWhileOpen = page.url(); const alias = await detail.locator('header p').innerText(); await page.getByRole('button', { name: '收起 ' + name, exact: true }).click(); await expect(detail).toHaveCount(0); return { person: name, alias, urlWhileOpen, urlAfterClose: page.url() };"`。人物卡原位展开详情，大标题就是这个人的名字，地址带 `person=`；关闭后详情消失，地址里的 `person=` 也去掉。
- **带 person 的地址可以直接打开。** 把上一步返回的 `urlWhileOpen` 原样再打开一次。运行 `pnpm twh go "<上一步返回的 urlWhileOpen>"` 和 `pnpm twh drive --eval "const detail = page.locator('.relationships-person-detail'); await expect(detail).toBeVisible(); return { person: await detail.locator('h2').innerText(), url: page.url() };"`。一打开这个人的详情就是展开的，返回的 `person` 和上一步一样。这条命令里的地址要照上一步的返回值填，不是固定文字。
- **图上的人物节点。** 点关系图里第一个人物节点。运行 `pnpm twh drive --eval "const node = page.locator('.relationships-person-node').first(); const label = await node.getAttribute('aria-label'); await node.click(); await expect(node).toHaveAttribute('aria-expanded', 'true'); await expect(page.locator('.relationships-person-detail')).toBeVisible(); return label;"`。节点带 `aria-expanded="true"`，右侧出现这个人的详情；返回值是这个节点的名字，形如「查看 某人，某角色」。
- **放大查看。** 点关系图右上角的「放大查看」，在大图里点「放大图谱」，再按 Esc。运行 `pnpm twh drive --eval "const graph = page.locator('.relationships-graph-card .graph-viewport'); await graph.getByRole('button', { name: '放大查看', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '人物与关系角色网络放大查看' }); await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: '放大图谱', exact: true }).click(); await expect(dialog.locator('output')).toHaveText('125%'); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); return '放大查看可用';"`。大图弹窗打开，缩放比例到 `125%`，Esc 关闭。
- **人物卡的文件菜单。** 点第一张人物卡右侧的「更多文件操作」，按 Esc。运行 `pnpm twh drive --eval "await page.locator('.file-menu-trigger').first().click(); await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toBeVisible(); await expect(page.getByRole('menuitem', { name: '打开原始目录', exact: true })).toBeVisible(); await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toHaveCount(0); return '三个文件操作';"`。菜单里是「重命名、打开原始目录、删除」，Esc 关闭。不要点任何一项。
- **旧地址跳转。** 运行 `pnpm twh go /understanding/people` 和 `pnpm twh drive --eval "await expect(page).toHaveURL(origin + '/relationships'); return page.url();"`。地址被替换成 `/relationships`。
- **搜索与命令直达。** 运行 `pnpm twh go /` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.locator('.command-palette'); await palette.locator('input').fill('人与世界'); await palette.getByRole('option').filter({ hasText: '前往栏目' }).first().click(); await expect(page).toHaveURL(origin + '/relationships'); return page.url();"`。面板关闭，落在人与世界页。
- **打开右侧对话。** 点标题栏的对话按钮。运行 `pnpm twh go /relationships` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '打开Agent对话', exact: true }).click(); await expect(page.locator('.floating-agent-panel')).toBeVisible(); await expect(page.locator('.agent-mode-picker summary')).toContainText('自动模式'); await expect(page.locator('.context-agent-boundary')).toHaveCount(0); return await page.locator('#context-agent-title').innerText();"`。右侧对话打开，标题「一起往下想」，模式下拉默认「自动模式」，没有边界提示行（见 Gotchas）。没有模型时发送按钮是禁用的，不要点发送。
- **整段旅程：筛选与悬浮提示。** 运行 `pnpm twh drive --script verify-tooltips`。Mac 客户端，人物关系接口被拦截成两个长摘要的人物。它证明了页头说明文字、关系图下没有多余的脚注，以及悬浮提示的来去：点角色筛选不弹提示、鼠标移开后半秒内收起、按 Esc 收起、键盘 Tab 到第一张人物卡会显示提示、换筛选会收起提示、锚点被移除后不再留提示。静态比对与当前源码一致，未核实运行结果。
- **整段旅程：桌面端路由。** 运行 `pnpm twh drive --script verify-desktop`。Mac 客户端，走真实 IPC。它证明了 `/relationships` 在桌面端加载完成且侧边栏有激活项。静态比对，未核实运行结果。
- **整段旅程：关系图放大查看。** 运行 `pnpm twh drive --script verify-stage-focus`。Mac 客户端，人生阶段接口被拦截。它对人物关系图的断言是放大查看、放大到 `125%`、在大图里点角色节点。但脚本更早的时间线段落找的是已改名的「只读文件预览」弹窗（见 `timeline.md`），按静态比对走不到这里。未核实运行结果。
- **留证。** 运行 `pnpm twh go /relationships`、`pnpm twh evidence screenshot relationships` 和 `pnpm twh evidence aria relationships`。两份证据里都能看到关系图、人物列表和角色筛选。

## Gotchas

- 搜索、排序、换角色筛选都会收起当前展开的人物详情，并清掉地址里的 `person=`。要验证详情，最后再做筛选以外的操作。
- 点人物卡时，角色筛选会自动换成这个人的主要角色，列表因此变短，这是预期行为。
- 悬浮提示只在摘要长到被截断时出现。演示库的人物摘要是否够长未核实，所以这里用整段旅程来验，不在真实数据上断言。
- 人物多于 50 个时先显示 50 个，底部有「继续显示 N 人」。演示库人数少，看不到这个按钮属正常。
- 只有关系角色、还没有人物页面时，这一页没有关系图和搜索，换成「人物还没有形成页面」的角色列表。演示库不是这种情况，未核实。
- 英文界面下演示库的人名会被英文覆盖层替换，窗口标题也会变。本文件的名称都按中文写。
- `verify-file-menus.mjs` 会到 `/relationships` 点人物卡的文件菜单，但它更早的在 `/cards/personal-lines` 用了已不存在的 `.collection-list`，走不到这里。未核实运行结果。
