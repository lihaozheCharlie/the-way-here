# 搜索

搜索帮用户按标题、别名、正文和标签找到已有理解和生活记录。任何页面都能打开「搜索与命令」面板，边输入边出结果，可以直接打开某一条，也可以进入完整的搜索结果页。生活记录页另有一个只搜记录的搜索框。

## Sub-features

- `search-palette` 搜索与命令：标题栏按钮或 ⌘K 打开，焦点在输入框；输入后同时给出栏目、两条固定命令和最多 12 条页面结果。
- `search-open-result` 从面板直接打开一条记录或已有理解。
- `search-page` 完整搜索结果页 `/search?q=`：按「已有理解」和「生活记录」分组，命中的词高亮。
- `search-empty` 没有结果时的完整空状态。
- `search-match` 匹配规则：按空格分词，不分大小写；任何一个词命中标题、别名、正文或标签就算命中，标题命中的排前面。
- `search-sources` 生活记录页内搜索：只过滤生活记录的列表，标题和正文都搜。

## How to get to it (user POV)

- 标题栏的「搜索与命令」按钮。浏览器和桌面客户端都有。
- 快捷键 ⌘K / Ctrl+K。浏览器里由页面处理；桌面端对应菜单「显示 → 搜索与命令」。
- 面板最下面的「查看全部搜索结果」，进入 `/search?q=关键词`。
- 直接打开 `/search?q=关键词`。
- 生活记录页工具栏的搜索框，地址变成 `/sources?q=关键词`。
- 搜索结果页里的「进入已有理解」「查看全部生活记录」；每条结果右侧还有「更多文件操作」菜单。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动。本页的步骤只读，不改任何数据。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都会变，演示库的标题也会变成英文。
- 首次启动的模型引导已经处理过，见 `capture.md`。
- 演示库根目录里有记录 `2026-04-21 搬家后的客厅.md`，正文里出现了「阿宁」这个名字，已有理解里也有一个以它为标题的人物页。下面的步骤用「搬家」和「阿宁」做关键词。
- 路由里带 `?` 时要加引号再交给 `pnpm twh go`，否则 zsh 会把 `?` 当通配符。

- **打开搜索与命令。** 运行 `pnpm twh doctor`、`pnpm twh go /sources` 和 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.getByRole('dialog', { name: '搜索与命令', exact: true }); await expect(palette).toBeVisible(); const input = palette.getByRole('combobox', { name: '搜索记录、理解或命令' }); await expect(input).toBeFocused(); return await palette.getByRole('option').allTextContents();"`。`doctor` 以退出码 0 结束；面板打开，焦点在输入框；没输入时的选项是各个栏目（每项带「前往栏目」）、「新建随手记」和「打开偏好设置」。
- **输入关键词，直接打开一条生活记录。** 输入「搬家」，点那条生活记录结果。运行 `pnpm twh drive --eval "const palette = page.getByRole('dialog', { name: '搜索与命令', exact: true }); await palette.getByRole('combobox', { name: '搜索记录、理解或命令' }).fill('搬家'); const option = palette.getByRole('option', { name: /搬家后的客厅/ }).first(); await expect(option).toBeVisible(); const detail = await option.locator('small').innerText(); await option.click(); await expect(palette).toHaveCount(0); await page.waitForURL(url => url.pathname.startsWith('/page/')); await expect(page.locator('.editable-document-body')).toBeVisible(); await expect(page.locator('.document-file-name input')).toHaveValue('2026-04-21 搬家后的客厅'); return { detail, path: new URL(page.url()).pathname, search: new URL(page.url()).search };"`。选项的说明是「生活记录」；面板关闭；地址跳到 `/page/…` 下的记录页，正文可见，标题框是 `2026-04-21 搬家后的客厅`。
- **没有匹配的面板。** 输入一个不存在的词。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.getByRole('dialog', { name: '搜索与命令', exact: true }); await palette.getByRole('combobox', { name: '搜索记录、理解或命令' }).fill('没有这个词83729'); await expect(palette.getByRole('option')).toHaveCount(1); const only = await palette.getByRole('option').innerText(); await page.keyboard.press('Escape'); await expect(palette).toHaveCount(0); return only;"`。列表里只剩一项「查看全部搜索结果」加上这个词；Esc 关闭面板。
- **从面板进入完整搜索结果页。** 输入「搬家」，点「查看全部搜索结果」。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '搜索与命令', exact: true }).click(); const palette = page.getByRole('dialog', { name: '搜索与命令', exact: true }); await palette.getByRole('combobox', { name: '搜索记录、理解或命令' }).fill('搬家'); await palette.getByRole('option', { name: /查看全部搜索结果/ }).click(); await expect(page).toHaveURL(url => url.pathname === '/search' && url.searchParams.get('q') === '搬家'); await expect(page.getByRole('heading', { name: '“搬家”', exact: true })).toBeVisible(); return { description: await page.locator('.page-header p').innerText(), groups: await page.locator('.search-group h2').allTextContents() };"`。地址是 `/search?q=搬家`；大标题是 `“搬家”`；说明是「找到 N 项结果，已按构建知识与原始材料分组。」；`groups` 里有「生活记录 · N」，已有理解里也有命中时还有「已有理解 · N」。
- **打开一条搜索结果。** 点「生活记录」分组里那条结果。运行 `pnpm twh drive --eval "const link = page.getByRole('link', { name: /生活记录.*搬家后的客厅/ }).first(); await expect(link).toBeVisible(); const highlight = await link.locator('mark').allTextContents(); await link.click(); await page.waitForURL(url => url.pathname.startsWith('/page/')); await expect(page.locator('.editable-document-body')).toBeVisible(); return { highlight, path: new URL(page.url()).pathname };"`。命中的词被高亮（`highlight` 里是「搬家」）；点了结果后跳到 `/page/…` 并显示正文。
- **搜索结果页的空状态。** 运行 `pnpm twh go '/search?q=没有这个词83729'` 和 `pnpm twh drive --eval "await expect(page.getByText('没有找到相关内容。换一个关键词，或者先带进一段新的生活记录。', { exact: true })).toBeVisible(); return { title: await page.locator('.page-header h1').innerText(), groups: await page.locator('.search-group').count(), results: await page.locator('.search-result').count() };"`。大标题是 `“没有这个词83729”`；页面上只有一句「没有找到相关内容。换一个关键词，或者先带进一段新的生活记录。」，`groups` 和 `results` 都是 0。
- **两个分组。** 运行 `pnpm twh go '/search?q=阿宁'` 和 `pnpm twh drive --eval "await expect(page.locator('.search-group h2').filter({ hasText: '已有理解' })).toBeVisible(); await expect(page.locator('.search-group h2').filter({ hasText: '生活记录' })).toBeVisible(); await expect(page.getByRole('link', { name: '进入已有理解', exact: true })).toHaveAttribute('href', '/knowledge'); await expect(page.getByRole('link', { name: '查看全部生活记录', exact: true })).toHaveAttribute('href', '/sources'); return { groups: await page.locator('.search-group h2').allTextContents(), results: await page.locator('.search-result').count() };"`。标题命中的那个人物页在「已有理解」里，正文里提到这个名字的记录在「生活记录」里，两个分组都在；「进入已有理解」指向 `/knowledge`，「查看全部生活记录」指向 `/sources`。
- **生活记录页内搜索。** 运行 `pnpm twh go /sources` 和 `pnpm twh drive --eval "const search = page.getByRole('textbox', { name: '搜索生活记录标题或内容' }); await search.fill('搬家'); await expect(page.getByRole('button', { name: '2026-04-21 搬家后的客厅.md', exact: true })).toBeVisible(); await expect(page).toHaveURL(url => url.pathname === '/sources' && url.searchParams.get('q') === '搬家'); await search.fill('没有这个词83729'); await expect(page.locator('.source-file-row')).toHaveCount(0); await expect(page.getByText('没有匹配的记录', { exact: true })).toBeVisible(); await search.fill(''); await expect(page.locator('.source-file-row').first()).toBeVisible(); return { rows: await page.locator('.source-file-row').count() };"`。输入「搬家」后匹配的记录留在列表里，地址变成 `/sources?q=搬家`；换成没有的词后列表为空，显示「没有匹配的记录」；清空后列表恢复（`rows` 大于 0）。这个搜索框只搜生活记录，不会出现已有理解。
- **用 ⌘K 打开（浏览器宿主）。** 运行 `pnpm twh drive --eval "if (await page.evaluate(() => Boolean(window.desktop))) return '桌面宿主，跳过这一步'; await page.keyboard.press('ControlOrMeta+k'); const palette = page.getByRole('dialog', { name: '搜索与命令', exact: true }); await expect(palette).toBeVisible(); await page.keyboard.press('Escape'); await expect(palette).toHaveCount(0); return await palette.count();"`。浏览器里面板打开，Esc 关闭，返回 0。桌面客户端里返回「桌面宿主，跳过这一步」，那里 ⌘K 属于原生菜单。
- **整段旅程：从面板搜到并打开记录。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它证明了在「搜索与命令」里输入后能找到索引里的生活记录并打开它，正文和标题都对得上；`/search?q=` 和 `/sources?q=` 两个路由都能渲染，后者能定位到一行。它的此刻那一组有过时的定位，见 `capture.md`。
- **整段旅程：搜索结果行的文件菜单。** 运行 `pnpm twh drive --script verify-file-menus`。桌面客户端加演示库。它证明了 `/search?q=林` 的结果行右侧有文件菜单，菜单里是「重命名、打开原始目录、删除」。
- **整段旅程：面板的开关。** 运行 `pnpm twh drive --script verify-today` 和 `pnpm twh drive --script verify-dismiss-layers`。都是桌面客户端。依次证明了「搜索与命令」面板没有页脚、Esc 能关掉；面板关掉后它后面的 Agent 对话不受影响。这两个脚本各有自己的过时定位，见 `capture.md` 和 `questions.md`。
- **留证。** 在搜索结果页上运行 `pnpm twh evidence screenshot search-results` 和 `pnpm twh evidence aria search-results`。两份证据里都能看到关键词和带高亮的搜索结果。

## Gotchas

- 搜索是按词的「或」关系：空格分开的词任何一个命中就算命中，所以结果常常比预期的多。完整搜索页最多给 30 项；生活记录页内搜索不设上限，而且只含生活记录。
- 演示库在中文界面下显示的就是磁盘上的文件名。在列表和搜索结果里找记录，用「文件名.md」这个名字，例如 `2026-04-21 搬家后的客厅.md`。
- 面板有 180 毫秒的防抖。等选项出现，不要用固定等待。
- 面板里没有匹配时不会出现「没有找到相关内容」那句话，而是只剩一项「查看全部搜索结果」。真正的空状态在 `/search?q=` 页面上。
- 搜索结果每行右侧是文件菜单。要点开结果就点链接本身，不要点到菜单。
- 搜索结果页的大标题两侧是中文引号，例如 `“搬家”`。按名字找这个标题时要带上引号。
- 生活记录页内搜索会改地址栏的 `q` 参数，并把第一条匹配自动在右侧打开。它和完整搜索页是两个入口，不要把其中一个当成另一个的证据。
- ⌘K 这类快捷键在浏览器里由页面处理，在桌面客户端里由原生菜单处理。用 `page.keyboard` 能不能触发原生菜单，未核实；拿不准就点标题栏按钮。
- 「两个分组」一步依赖演示库的内容（人物页「阿宁」和提到它的记录）。数据不同时换一个同时出现在已有理解和生活记录里的词，或者只验证「生活记录」一个分组。
- `verify-web` 在面板里点选项用的是「包含这段文字」的匹配，可能点到「查看全部搜索结果」而不是记录本身；它后面是在搜索结果页上继续点链接才完成断言的。运行时实际点了哪一项，未核实。
- 界面语言是英文时，按钮名和演示库的标题、路径都会变成英文，中文关键词会搜不到。
