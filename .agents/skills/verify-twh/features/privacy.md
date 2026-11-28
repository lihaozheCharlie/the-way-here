# 隐私与数据使用

「隐私与数据使用」是一页说明：系统照片库什么时候读、本机资料存在哪、AI 可能发送什么、语音和密钥怎么处理、怎么撤销和删除、应用更新联不联网，以及客服邮箱和完整隐私政策的链接。内容随构建变化：有运营者和政策地址时显示它们，没有时明确写着这个构建不能作为商店发布版本。浏览器和 Mac 客户端看到的是同一页。

## Sub-features

- `privacy-page` 页面固定七节：系统照片库、本机资料、可选 AI 服务、语音与密钥、撤销与删除、应用更新、联系与完整政策。
- `privacy-ai-wording` 「可选 AI 服务」按构建说明接收方：商店版是内置 Codex，其余是本机 Codex CLI。
- `privacy-contact` 客服邮箱固定；运营者、完整隐私政策、使用帮助与支持三项按构建配置出现。
- `privacy-policy-missing` 没有配置公开隐私政策地址时，显示一句「此构建不能作为商店发布版本」。
- `privacy-entry-link` 偏好设置通用页签底部和 AI 助手页签里都有链接，在新标签页或新窗口打开这一页。
- `privacy-entry-menu` Mac 客户端菜单「The Way Here → 隐私与数据使用」在独立窗口里打开这一页。

## How to get to it (user POV)

- 地址 `/privacy`。
- 「偏好设置 → 通用」最底下的「隐私与数据使用」链接。
- 「偏好设置 → AI 助手」里「允许 AI 使用哪些资料」下面的「隐私与数据使用说明」链接。
- Mac 客户端菜单「The Way Here → 隐私与数据使用」。

## Driving it with twh

Preconditions:

- 在 `studio/` 目录运行所有命令，先让 `pnpm twh doctor` 通过。
- 应用由本次验证运行启动，数据目录是一次性的。
- 界面语言是中文。界面是英文时，下文所有中文标题都不成立。
- 这几步只读。

- **打开隐私页。** 运行 `pnpm twh go /privacy` 和 `pnpm twh drive --eval "await expect(page.getByRole('heading', { level: 1, name: '隐私与数据使用' })).toBeVisible(); await expect(page.locator('.preferences-heading p')).toHaveText('资料由你管理，外部 AI 由你决定是否使用。'); const sections = await page.locator('.desktop-preferences h2').allTextContents(); expect(sections).toEqual(['系统照片库', '本机资料', '可选 AI 服务', '语音与密钥', '撤销与删除', '应用更新', '联系与完整政策']); return { sections, title: await page.locator('.desktop-window-title').innerText() };"`。一级标题是「隐私与数据使用」，七节按固定顺序出现。
- **确认基线。** 运行 `pnpm twh drive --eval "return await page.evaluate(async () => { const vault = await (await fetch('/api/vault')).json(); return { knowledgeBaseId: vault.knowledgeBaseId, agentAvailable: vault.agentAvailable, lang: document.documentElement.lang, desktop: Boolean(window.desktop) }; });"`。`lang` 是 `zh-CN`；`desktop` 为 `false` 表示浏览器宿主。
- **客服邮箱与政策链接。** 运行 `pnpm twh drive --eval "const mail = page.getByRole('link', { name: '644730894@qq.com', exact: true }); await expect(mail).toHaveAttribute('href', 'mailto:644730894@qq.com'); const policy = page.getByRole('link', { name: '完整隐私政策', exact: true }); const missing = page.getByText('公开隐私政策地址尚未配置，此构建不能作为商店发布版本。'); if ((await policy.count()) > 0) { await expect(missing).toHaveCount(0); } else { await expect(missing).toBeVisible(); } return { policyLink: await policy.count(), operator: await page.getByText(/^运营者：/).count(), support: await page.getByRole('link', { name: '使用帮助与支持', exact: true }).count() };"`。客服邮箱永远在，链接是 `mailto:`；有「完整隐私政策」链接时没有那句缺失说明，没有链接时说明可见。匿名启动的实例通常三项都是 0。
- **可选 AI 服务的接收方。** 运行 `pnpm twh drive --eval "const section = page.locator('.desktop-preferences h2').filter({ hasText: '可选 AI 服务' }).locator('..'); await expect(section).toContainText('共享许可默认关闭'); const store = await section.getByText('内置 Codex 固定使用 OpenAI', { exact: false }).count(); const cli = await section.getByText('Codex CLI 使用它自己的模型服务和登录配置', { exact: false }).count(); expect(store + cli).toBe(1); return store > 0 ? '商店版文案' : '非商店版文案';"`。这一节永远写着共享许可默认关闭；接收方的说明只有一种，商店版和非商店版各一句。
- **从偏好设置的通用页签进来。** 运行 `pnpm twh go /preferences` 和 `pnpm twh drive --eval "const link = page.getByRole('link', { name: '隐私与数据使用', exact: true }); await expect(link).toHaveAttribute('href', '/privacy'); await expect(link).toHaveAttribute('target', '_blank'); return await link.getAttribute('href');"`。页脚的链接指向 `/privacy`，会在新标签页或新窗口里打开。
- **从 AI 助手页签进来。** 运行 `pnpm twh go "/preferences?tab=ai"` 和 `pnpm twh drive --eval "const link = page.getByRole('link', { name: '隐私与数据使用说明', exact: true }); await expect(link).toHaveAttribute('href', '/privacy'); return await link.getAttribute('href');"`。许可说明下面的链接同样指向 `/privacy`。
- **整段旅程：地址能打开。** 运行 `pnpm twh drive --script verify-web`。浏览器加真实本地服务。它对这一页的断言是一级标题可见、没有接口报错。但这几行排在已经过时的随手记段落之后（见 `capture.md` 的 Gotchas），按静态比对走不到。未核实运行结果。
- **留证。** 运行 `pnpm twh go /privacy`、`pnpm twh evidence screenshot privacy` 和 `pnpm twh evidence aria privacy`。两份证据里都能看到标题和七节的小标题。

## Gotchas

- 这一页是全窗口的页面，有侧边栏和标题栏按钮，不是设置那种工具窗口；但它没有左侧栏目的激活项。
- 内容随构建变化。验证时只断言七节的标题、客服邮箱，以及「有政策链接」和「有缺失说明」二者必居其一，不要断言运营者或支持链接一定在。
- 两处链接都是新开标签页或新窗口，当前页面不会跳走。只用 `page` 和 `expect` 去接住新标签页（`page.context()` 等新页面事件）的做法没有现成脚本走过，未核实；上面只断言了链接目标。
- Mac 客户端的菜单「The Way Here → 隐私与数据使用」没法只靠 `page` 和 `expect` 去点，未核实。
- 英文界面下标题和小节名都会变。本文件的名称都按中文写。
