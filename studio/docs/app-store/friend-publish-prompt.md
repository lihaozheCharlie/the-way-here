# 发给朋友的发布代理

将项目的干净交接副本放到朋友的 Mac。下面整段可复制给其代理。账号、验证码、协议和真实声明由朋友本人处理，不在聊天中提供密码或私钥。

```text
请帮助我把这份 The Way Here macOS 项目通过我的个人 Apple Developer Program 账号提交到 Mac App Store 审核。首版免费，仅中国大陆，简体中文，客服 644730894@qq.com。保留 Codex CLI 功能。

先读取项目 AGENTS.md、studio/AGENTS.md、studio/docs/app-store/README.md、engineering.md、mas-validation.md 和 metadata.zh-Hans.md。当前代码包含 MAS 构建、书签授权、加密设置、AI 共享同意与内置 Codex 受限工具。先核对已有构建和审核状态，避免重复提交；不要把普通 DMG、unsigned app 或准备截图当作已验收的商店成品。不要假设朋友的 Mac 已有签名证书私钥。

先检查工具能力。若你只有 browser use，没有本机终端/桌面工具，也没有已经通过验收的签名 pkg，请完成能做的只读检查和商店资料草稿，并明确列出签名、实测和 Transporter 上传需要我人工完成的步骤；不要假装浏览器能完成这些工作。若有本机工具，继续以下流程。

1. 检查会员、待签协议和个人账号权限。登录/双重认证由我本人在官方界面处理，不索取或输出密码、验证码、私钥。确认个人卖家公开姓名及软件权利由我负责；不擅自接受法律协议或编造审核联系资料。
2. 确认实际运营者、网站、数据流、最终支持的模型服务及隐私声明。核对已公开的 site/privacy.html 和 support.html；当前网站为 https://the-way-here-support.finedeer64.chatgpt.site；若更新则使用我有权使用的网站发布，确认中国大陆与审核网络无登录可访问。缺少真实信息时集中向我索取；不要杜撰政策、保留期限、备案号或填“不收集数据”来跳过问卷。
3. 注册/核对 Bundle ID com.thewayhere.desktop；已有记录先复用，名称占用再询问。注册所需 App Group、开发设备和 profiles，配置 Apple Development/Distribution 及 Mac Installer Distribution 证书，保留私钥在我的钥匙串。按 mas-validation.md 设置非敏感变量。pnpm install --frozen-lockfile，然后运行 pnpm typecheck、pnpm test、pnpm build、pnpm appstore:check 和 pnpm appstore:dev。
4. 对真正签名的 MAS 开发包完成 mas-validation.md 全部功能检查并保存证据，特别是 Codex CLI 在沙盒中的执行、配置目录授权、重启访问、Python、语音、AI 同意与撤回、密钥加密以及退出清理。不关闭 App Sandbox，不下载执行代码，不偷偷删除 Codex 或隐藏审核功能。失败就定位修复或向我报告真实阻塞，不能继续上传不工作的包。明确核验 Codex 的实际数据接收方与变更后重新同意，不能把“用户负责”当作已满足 Apple 的结论。
5. 全部通过后切换商店分发 profile，pnpm appstore:release，检查应用/嵌套代码签名、pkg 安装包签名和包内无私密材料。使用 Transporter 上传最终 pkg，等 App Store Connect 处理完成。若需要安装本机工具先说明用途，不上传证书私钥给第三方服务。最终截图使用对应已验收版本的匿名 demo，不能只用旧准备图。
6. 在 App Store Connect 创建或复用 macOS App，简体中文，建议 SKU TWH-MAC-001，版本读取最终 desktop package.json，build number 递增。根据 metadata.zh-Hans.md 填文案，填写真实 HTTPS 隐私/支持 URL，免费，仅选中国大陆；在真实记录核对 ICP/大陆供应要求，若要求材料则等待合法有效材料，不推测豁免。按实际功能填写分类、年龄分级、内容权利、App Privacy、加密出口问卷；事实或授权不清时询问我。
7. 审核说明如实解释：本地知识管理、可选第三方 AI、默认关闭数据共享、Codex CLI 依赖及授权步骤。准备审核员无需访问私人资料的真实可用测试路径；如需测试账号/AI 额度由我安全提供，不能把私人密钥写进公开元数据，也不能宣称功能不需要配置。确认外部 CLI 依赖和 AI 接收方声明符合审核要求；不能保证 Apple 会批准。
8. 所有阻塞解决后，将最终名称、卖家、免费/中国大陆、版本/build、隐私URL、截图、审核测试方式和签名/实测证据展示给我复核。取得我对这份最终结果的确认后提交审核，选择人工发布，不自动上线。没有确认不点击最终提交，不购买服务或改变其他 App 的设置。

结束时给我 App Store Connect 记录链接、提交状态、构建号、产物位置、验收记录、剩余阻塞。区分“草稿已填写”“构建已上传”“已提交审核”“审核通过”和“已经上架”。后台处理/审核未完成时不能报告已发布。停止你启动的服务与辅助进程并确认退出，不终止我的原有服务。
```
