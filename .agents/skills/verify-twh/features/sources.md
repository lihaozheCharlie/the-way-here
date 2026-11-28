# 生活记录

生活记录是用户原话和导入材料的家：左边是文件夹树（包括从磁盘打开的外部目录），中间是文件列表，右边是完整正文。用户可以按来源类型、月份、文件夹和全文筛选，单击正文就地编辑并自动保存，改标题就是改文件名，用文件菜单移动、重命名、在 Finder 中显示或删除。原文留在原处，读到的永远是全文。

## Sub-features

- `sources-list` 文件列表：单击一行，右侧读全文；默认最多显示 120 条，多了出「继续显示 N 份」。
- `sources-tree` 文件夹树：点开才读取子目录；支持键盘，能新建、重命名、移到废纸篓，失效的目录可以重新连接。
- `sources-connect` 打开文件夹：把磁盘上的一个目录作为根加进树和列表；移除只去掉入口，不动磁盘上的文件。
- `sources-filter` 筛选与排序：按来源类型、月份、文件夹范围（仅此层或含子文件夹）、最新或最早。
- `sources-search` 列表内搜索：按标题或正文过滤列表，地址栏跟着带 `q` 参数。
- `sources-read` 阅读与目录：完整正文；有小标题时右侧有目录刻度，可以悬停预览或固定。
- `sources-edit` 就地编辑与自动保存：单击正文进入编辑，Esc 退出，保存写回原文件。
- `sources-rename` 改标题就是改文件名：标题框回车或失焦提交，Esc 取消。
- `sources-file-menu` 文件菜单：移动到…、构建这篇文档、重命名、打开原始目录、删除（要确认）。
- `sources-create` 新建记录和新建文件夹：都要先在树里选中一个文件夹。
- `sources-panes` 折叠栏：文件夹栏和文件列表可以各自收成一条细栏。

## How to get to it (user POV)

- 侧边栏「生活记录」，路由 `/sources`。
- 直接打开 `/sources`，可以带参数：`?folder=`、`?file=`、`?q=`、`?type=`、`?month=`、`?sort=oldest`、`?import=true`。
- 搜索结果页里的「查看全部生活记录」。
- 值得聊聊里账单话题的「看看相关记录」。
- 从搜索或别处打开一条生活记录时落在 `/page/…`，用的也是同一套列表和阅读界面。
- 工具栏：「全部 / 笔记 / AI 对话 / 照片 / 账单」类型按钮、搜索框、「导入资料」、「筛选与排序」、「新建记录」；文件夹栏顶部有「新建文件夹」和「打开文件夹…」。
- 文件行右侧的「更多文件操作」菜单；文件夹节点上的右键菜单。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。从「在树里选中一个文件夹并新建子文件夹」到「移除验收文件夹」的每一步都会真的新建、改写或删除文件和文件夹。
- 当前知识库是演示库（id 为 `demo`），界面语言是中文。界面是英文时，下文所有中文按钮名都不成立。
- 首次启动的模型引导已经处理过，见 `capture.md`。
- 演示库的根目录里有记录 `2026-04-21 搬家后的客厅.md`。下面的步骤用它做阅读对象；列表里没有这个名字时，换成第一步读出来的任意一个。
- 演示库根目录的记录都没有二级标题，所以读它们时没有目录栏。要验证目录，按下面的步骤自己加一个小标题。
- 「打开一个外部文件夹」一步需要一个磁盘上的临时目录，里面放一个 `连接原文.md`，内容是「匿名外部文件夹，仅用于验收。」。下文把它的绝对路径记作 `<外部目录>`。

- **打开生活记录并读出列表。** 运行 `pnpm twh doctor`、`pnpm twh go /sources` 和 `pnpm twh drive --eval "await expect(page.getByRole('tree', { name: '文件夹树' })).toHaveAttribute('aria-busy', 'false'); await expect(page.locator('.source-file-row').first()).toBeVisible(); await expect(page.locator('.source-preview .editable-document-body')).toBeVisible(); return { active: await page.locator('.desktop-navigation a.active').allTextContents(), files: await page.locator('.source-file-row .source-file-select').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), folders: await page.getByRole('tree', { name: '文件夹树' }).locator('[data-folder]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-folder'))), types: await page.locator('.source-type-filter button').allTextContents() };"`。`doctor` 以退出码 0 结束；`active` 是「生活记录」；`files` 是列表里的记录名（带 `.md`），其中有 `2026-04-21 搬家后的客厅.md`；`folders` 第一项是空字符串（根节点「全部材料」），后面是各文件夹的路径；`types` 是「全部、笔记、AI 对话、照片、账单」，有待构建的记录时多一项「待构建 N」；右侧已经打开第一条记录。
- **选一条记录读全文。** 单击列表里的 `2026-04-21 搬家后的客厅.md`。运行 `pnpm twh drive --eval "const row = page.getByRole('button', { name: '2026-04-21 搬家后的客厅.md', exact: true }); await row.click(); await expect(row).toHaveAttribute('aria-current', 'true'); const body = page.locator('.source-preview .editable-document-body'); await expect(body).toBeVisible(); await expect(page.locator('.record-document-title input')).toHaveValue('2026-04-21 搬家后的客厅'); await expect(page.locator('.record-document-path')).toContainText('2026-04-21 搬家后的客厅.md'); return { file: new URL(page.url()).searchParams.get('file'), chars: (await body.innerText()).length };"`。这一行带 `aria-current="true"`，右侧是全文，标题框是 `2026-04-21 搬家后的客厅`，路径行带文件名，地址栏多了 `file` 参数，`chars` 大于 0。
- **没有小标题的记录没有目录栏。** 运行 `pnpm twh drive --eval "const toggle = page.locator('.record-document-toolbar .record-outline-control'); await expect(toggle).toBeDisabled(); return { navigationWidth: await page.locator('.document-navigation-host').evaluate(node => node.getBoundingClientRect().width) };"`。目录按钮是禁用的，`navigationWidth` 是 0。
- **按来源类型筛选。** 运行 `pnpm twh drive --eval "const buttons = page.locator('.source-type-filter button'); const all = await page.locator('.source-file-row').count(); const photos = buttons.filter({ hasText: '照片' }); await photos.click(); await expect(photos).toHaveAttribute('aria-pressed', 'true'); const photoRows = await page.locator('.source-file-row').allTextContents(); await buttons.filter({ hasText: '全部' }).click(); await expect(page.locator('.source-file-row')).toHaveCount(all); return { all, photoRows };"`。点「照片」后按钮带 `aria-pressed="true"`，列表只剩照片类记录（`photoRows`）；点「全部」后恢复到 `all` 行。
- **在列表里搜索。** 在工具栏搜索框里输入。运行 `pnpm twh drive --eval "const search = page.getByRole('textbox', { name: '搜索生活记录标题或内容' }); await search.fill('搬家'); await expect(page.getByRole('button', { name: '2026-04-21 搬家后的客厅.md', exact: true })).toBeVisible(); const q = new URL(page.url()).searchParams.get('q'); await search.fill('没有匹配的词83729'); await expect(page.locator('.source-file-row')).toHaveCount(0); await expect(page.getByText('没有匹配的记录', { exact: true })).toBeVisible(); await expect(page.locator('.source-preview-empty')).toBeVisible(); await search.fill(''); await expect(page.locator('.source-file-row').first()).toBeVisible(); return { q, rows: await page.locator('.source-file-row').count() };"`。输入「搬家」后匹配的记录留在列表里，地址栏带 `q=搬家`；换成没有的词后列表为空，显示「没有匹配的记录」，右侧显示「选择一个文件」；清空后列表恢复（`rows` 大于 0）。
- **排序。** 打开「筛选与排序」。运行 `pnpm twh drive --eval "const options = page.getByRole('button', { name: '筛选与排序', exact: true }); await options.click(); await page.getByRole('menuitemradio', { name: '最早在前', exact: true }).click(); const oldest = await page.locator('.source-file-row').first().innerText(); const sort = new URL(page.url()).searchParams.get('sort'); await options.click(); await page.getByRole('menuitemradio', { name: '最新在前', exact: true }).click(); const newest = await page.locator('.source-file-row').first().innerText(); return { oldest, newest, sort };"`。选「最早在前」后第一行是最早的记录（`oldest`），地址栏带 `sort=oldest`；选回「最新在前」后第一行是 `newest`，两者不同。
- **在树里选中一个文件夹并新建子文件夹。** 运行 `pnpm twh drive --eval "const tree = page.getByRole('tree', { name: '文件夹树' }); const parent = tree.getByRole('treeitem').nth(1); await parent.click(); const parentPath = await parent.getAttribute('data-folder'); await page.getByRole('button', { name: '新建文件夹', exact: true }).click(); const input = page.getByRole('textbox', { name: '新文件夹名称', exact: true }); await input.fill('验收目录'); await input.press('Enter'); const created = tree.getByRole('treeitem').filter({ hasText: '验收目录' }); await expect(created).toHaveAttribute('aria-selected', 'true'); return { parentPath, created: await created.getAttribute('data-folder'), folder: new URL(page.url()).searchParams.get('folder') };"`。新节点被选中（`aria-selected="true"`），它的 `data-folder` 是 `parentPath/验收目录`，地址栏的 `folder` 参数也是它。
- **在新文件夹里新建一条记录，加一个小标题。** 点「新建记录」，输入标题回车，接着在编辑器末尾另起一行写 `## 验收小标题`。运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '新建记录', exact: true }).click(); const input = page.getByRole('textbox', { name: '新建记录', exact: true }); await input.fill('验收记录'); await input.press('Enter'); const editor = page.locator('[data-document-editor]'); await expect(editor).toBeFocused(); const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/api/pages/')); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.insertText('## 验收小标题'); const response = await saved; await expect(response.ok()).toBe(true); await page.keyboard.press('Escape'); await expect(editor).toHaveCount(0); await expect(page.getByRole('button', { name: '验收记录.md', exact: true })).toBeVisible(); await expect(page.locator('.outline-item')).toHaveCount(1); return { status: response.status(), outline: await page.locator('.outline-item').allTextContents() };"`。新记录一建出来就在编辑状态（编辑器获得焦点）；保存请求成功返回（`status` 是 2xx）；Esc 回到阅读；列表里出现 `验收记录.md`；因为有了二级标题，目录里出现一项「验收小标题」。
- **用目录跳转。** 点工具栏上的目录按钮，再点第一条目录项。运行 `pnpm twh drive --eval "const control = page.locator('.record-document-toolbar .record-outline-control'); await control.click(); const card = page.locator('.document-outline-card'); await expect(card).toBeVisible(); await page.locator('.outline-item').first().click(); await expect(page.locator('.outline-item').first()).toHaveAttribute('aria-current', 'location'); const pinned = await control.getAttribute('aria-pressed'); if (pinned === 'true') await control.click(); else await page.keyboard.press('Escape'); return { pinned, outline: await page.locator('.outline-item').allTextContents() };"`。目录卡片打开，点目录项后它带 `aria-current="location"`。阅读区够宽时目录被固定，`pinned` 是 `'true'`，再点一次目录按钮收起；不够宽时它是悬停式预览，`pinned` 是 `'false'`，Esc 收起。
- **改标题就是改文件名。** 在标题框里改名。运行 `pnpm twh drive --eval "const title = page.locator('.record-document-title input'); await title.fill('验收记录改名'); await title.press('Enter'); await expect(page.getByRole('button', { name: '验收记录改名.md', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '验收记录.md', exact: true })).toHaveCount(0); await title.fill('这次要取消'); await title.press('Escape'); await expect(title).toHaveValue('验收记录改名'); await expect(page.getByRole('button', { name: '这次要取消.md', exact: true })).toHaveCount(0); return { title: await title.inputValue(), path: await page.locator('.record-document-path').innerText() };"`。回车后列表里的名字变成 `验收记录改名.md`，旧名字消失；按 Esc 的修改被放弃，名字保持「验收记录改名」。
- **文件菜单。** 把鼠标放在这一行上，点「更多文件操作」，再点「删除」。运行 `pnpm twh drive --eval "const item = page.locator('.source-file-row').filter({ hasText: '验收记录改名' }); await item.hover(); await item.getByRole('button', { name: /更多文件操作/ }).click(); const menu = page.getByRole('menu'); await expect(menu.getByRole('menuitem')).toHaveText(['移动到…', '构建这篇文档', '重命名', '打开原始目录', '删除']); await menu.getByRole('menuitem', { name: '删除', exact: true }).click(); const confirm = page.getByRole('alertdialog', { name: '删除这份生活记录？', exact: true }); await expect(confirm).toBeVisible(); await confirm.getByRole('button', { name: '取消', exact: true }).click(); await expect(page.getByRole('button', { name: '验收记录改名.md', exact: true })).toBeVisible(); return await confirm.count();"`。菜单五项依次是「移动到…、构建这篇文档、重命名、打开原始目录、删除」；点「删除」弹出确认「删除这份生活记录？」；点「取消」后记录还在，返回 0（确认框已关）。
- **确认删除。** 再打开文件菜单，点「删除」，在确认框点「删除文件」。运行 `pnpm twh drive --eval "const item = page.locator('.source-file-row').filter({ hasText: '验收记录改名' }); await item.hover(); await item.getByRole('button', { name: /更多文件操作/ }).click(); await page.getByRole('menuitem', { name: '删除', exact: true }).click(); await page.getByRole('alertdialog', { name: '删除这份生活记录？', exact: true }).getByRole('button', { name: '删除文件', exact: true }).click(); await expect(page.getByRole('button', { name: '验收记录改名.md', exact: true })).toHaveCount(0); await expect(page.locator('.source-list-empty')).toContainText('这个文件夹里还没有文件'); return { rows: await page.locator('.source-file-row').count() };"`。记录从列表消失（`rows` 是 0）；这个文件夹空了，列表处显示「没有匹配的记录」和「这个文件夹里还没有文件」。
- **移除验收文件夹。** 右键树里的「验收目录」，点「移到废纸篓」并确认。运行 `pnpm twh drive --eval "const accept = dialog => dialog.accept(); page.on('dialog', accept); const node = page.getByRole('tree', { name: '文件夹树' }).getByRole('treeitem').filter({ hasText: '验收目录' }); await node.click({ button: 'right' }); await page.getByRole('menuitem', { name: '移到废纸篓', exact: true }).click(); await expect(node).toHaveCount(0); page.off('dialog', accept); return { folder: new URL(page.url()).searchParams.get('folder') };"`。节点消失，地址栏的 `folder` 回到它的上一层。
- **打开一个外部文件夹（浏览器宿主）。** 点「打开文件夹…」，在弹出的路径框里填 `<外部目录>`，同意授权提示。运行 `pnpm twh drive --eval "if (await page.evaluate(() => Boolean(window.desktop))) return '桌面宿主，跳过这一步'; const accept = async dialog => { if (dialog.type() === 'prompt') await dialog.accept('<外部目录>'); else if (dialog.type() === 'confirm') await dialog.accept(); else await dialog.dismiss(); }; page.on('dialog', accept); await page.getByRole('button', { name: '打开文件夹…', exact: true }).click(); const file = page.getByRole('button', { name: '连接原文.md', exact: true }); await expect(file).toBeVisible(); page.off('dialog', accept); await file.click(); await expect(page.locator('.source-preview')).toContainText('匿名外部文件夹，仅用于验收。'); return { folders: await page.getByRole('tree', { name: '文件夹树' }).locator('[data-folder]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-folder'))) };"`。浏览器里列表出现 `连接原文.md`，点它右侧显示文件内容，`folders` 里多了一个以 `外部来源/` 开头的根。桌面客户端里返回「桌面宿主，跳过这一步」，因为那里用的是系统目录选择器。
- **从列表移除外部目录。** 运行 `pnpm twh drive --eval "const root = page.getByRole('tree', { name: '文件夹树' }).locator('[data-folder^=外部来源]').first(); const path = await root.getAttribute('data-folder'); await root.hover(); await root.getByRole('button', { name: /更多文件夹操作/ }).click(); await expect(page.getByRole('menuitem', { name: '重命名', exact: true })).toHaveCount(0); await expect(page.getByText('只移除入口，不会删除磁盘上的文件', { exact: true })).toBeVisible(); await page.getByRole('menuitem', { name: '从列表移除', exact: true }).click(); await expect(root).toHaveCount(0); return { removed: path, connections: await page.evaluate(async () => (await (await fetch('/api/source-connections')).json()).length) };"`。外部根的菜单里没有「重命名」，有「从列表移除」和说明「只移除入口，不会删除磁盘上的文件」；移除后节点消失，`connections` 是 0。`<外部目录>` 里的文件还在，可以自己去磁盘上确认。
- **折叠文件夹栏和文件列表。** 运行 `pnpm twh drive --eval "await page.getByRole('button', { name: '收起文件夹栏', exact: true }).click(); await page.getByRole('button', { name: '展开文件夹栏', exact: true }).first().click(); await page.getByRole('button', { name: '收起文件列表', exact: true }).click(); await expect(page.locator('.source-file-contents')).toBeHidden(); await page.getByRole('button', { name: '展开文件列表', exact: true }).first().click(); await expect(page.locator('.source-file-contents')).toBeVisible(); return { folderToggle: await page.getByRole('button', { name: '收起文件夹栏', exact: true }).getAttribute('aria-expanded'), fileToggle: await page.getByRole('button', { name: '收起文件列表', exact: true }).getAttribute('aria-expanded') };"`。收起文件列表后内容区隐藏，再展开后恢复；返回两个 `aria-expanded="true"`。
- **整段旅程：真实服务上的读写。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它证明了「打开文件夹…」连接外部目录并读到原文、外部根只能从列表移除且磁盘文件保留、键盘进入编辑并自动保存写回原文件、改标题就是改文件名、独立窗口里正文只读、`/sources?q=` 定位到一行、确认后删除文件。它的此刻那一组有过时的定位，见 `capture.md`。
- **整段旅程：生活记录的完整交互。** 运行 `pnpm twh drive --script verify-life-record-ux`。只挂载生活记录页，接口全部拦截。它证明了类型筛选、全文搜索、文件夹范围、排序和月份、批量选择与构建、三种导入入口、文件夹的新建、改名、在 Finder 中显示、移到废纸篓、取消，文件的新建、改名、冲突、在 Finder 中显示、构建、删除，编辑器的光标和自动保存，目录的停靠与悬停，折叠栏和空状态。
- **整段旅程：目录树、文档目录和整合页。** 运行 `pnpm twh drive --script verify-source-tree-and-outline`。同样的组件级环境。它证明了目录树的懒加载和键盘操作、内联新建、根目录和子目录的菜单、失效目录的「重新连接」、记住展开状态；目录栏的刻度、悬停预览、固定和窄屏；以及整合页的范围筛选、关联结果和空状态。`verify-source-directories` 和 `verify-document-mode` 只是它的别名。
- **整段旅程：外部改动后的刷新。** 运行 `pnpm twh drive --script verify-folder-refresh`。组件级环境，接口和事件流都是拦截的。它证明了自动保存、运行、打开、索引和窗口获得焦点都会刷新目录树，刷新时已有的行不消失，滚动位置和焦点不丢，刷新失败有提示并能重试，磁盘上增删目录会跟着变。
- **整段旅程：改标题。** 运行 `pnpm twh drive --script verify-title-editing`。组件级环境。它证明了在标题框里停顿、移动光标、输入法回车都不丢焦点，回车和失焦各提交一次，Esc 取消，点正文时光标落在点击的位置。
- **整段旅程：桌面客户端上的列表和菜单。** 运行 `pnpm twh drive --script verify-pane-shelf`、`pnpm twh drive --script verify-file-menus` 和 `pnpm twh drive --script verify-shared-file-browser`。都是桌面客户端加演示库。依次证明了两个栏头样式一致、静默滚动条、「继续显示 20 份」、两个折叠按钮；文件菜单的显示、重命名、删除的取消与确认、生活记录里的「构建这篇文档」；生活记录和回信共用同一套列表和编辑器样式。
- **整段旅程：原生菜单下的同一套界面。** 运行 `pnpm twh drive --script verify-desktop`。桌面客户端。它证明了在原生 IPC 下 `/sources` 路由照常打开，「打开文件夹…」和「从列表移除」的语义不变，原生菜单「导入生活记录…」打开导入弹窗。
- **留证。** 运行 `pnpm twh evidence screenshot sources-record` 和 `pnpm twh evidence aria sources-record`。两份证据里都能看到文件夹树、文件列表和右侧正在阅读的记录。

## Gotchas
- 「移到废纸篓」走 Finder（服务端起 osascript），无人值守时会一直挂住等确认；夜间巡检和过夜运行跳过这一步，需要人工在场时再做。

- 所有写步骤都是真的：新建文件夹、新建记录、编辑、改名、删除、移到废纸篓都会改磁盘。只在一次性数据目录里做；拿不准数据目录是不是一次性的，就只走读步骤，或者用 `--script`，现有脚本都会自己建临时目录。
- 演示库根目录的记录只有一级标题，没有目录栏（目录按钮禁用，目录区宽度为 0）。`账单记忆`、`照片记忆` 下的记录有二级标题。
- 列表默认最多显示 120 条，其余要点「继续显示 N 份」。「全部记录」下第一条会自动在右侧打开。
- 「新建文件夹」和「新建记录」在没有选中文件夹时是禁用的，不能直接建在根上。新文件夹建在选中的文件夹里面。
- 文件夹树是点开才读取的；展开状态、两个栏的开合、上次选中的文件夹都记在本机偏好里。复用配置目录时看到的不是默认状态，比如栏可能是收起的。
- 栏收起后有两个同名的「展开文件夹栏」按钮（折叠开关和竖排标签），「展开文件列表」也一样。按名字找时加 `.first()`，否则会因为匹配到多个而报错。`verify-pane-shelf` 没有加，未核实它现在是否还能过。
- 「打开文件夹…」在浏览器里是路径输入框加一个授权确认框；在桌面客户端里是系统目录选择器，`page` 作用域里替不了。`verify-desktop` 是在主进程里替换了系统的打开对话框才做到的。
- 「移到废纸篓」有一个确认框，确认后文件夹和里面的文件会被真的移走。外部来源的根没有这一项，只能「从列表移除」或「重新读取」，也不能重命名；它下面的子目录可以。
- 改名或保存时文件已经在别处被改过，会提示「文件已在别处更新」并保留你的输入，不会悄悄覆盖。
- 外部目录在磁盘上被移走后，树里显示「原文件夹不可用」和「重新连接」按钮。
- 「移动到…」和「构建这篇文档」没有写驱动步骤。前者没有现成脚本覆盖，后者会调用模型；两者的运行结果都未核实。
- 页面上没有可见的大标题，「生活记录」这个一级标题只给屏幕阅读器用。判断页面加载完，看列表第一行出现。
- 地址带 `detached=true` 的独立阅读窗口里正文只读，点正文不会进入编辑。
- 旧脚本里的过时定位：`verify-redesign` 和 `verify-dismiss-layers` 用的 `.source-connections-popover` 与「连接原始目录」按钮已经不存在；`verify-dismiss-layers` 以为「新建记录」会弹出「写一条生活记录」弹窗，现在是行内输入；`verify-shared-file-browser` 等待的 `.source-preview textarea` 在源码里是 CodeMirror 编辑器。这些都是静态比对，未核实运行结果。
- 界面语言是英文时，按钮名和演示库的标题、文件夹名都会变成英文。下面的步骤都按中文界面写。
