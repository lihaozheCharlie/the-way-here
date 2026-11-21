# MAS 构建与交接验收

本文件保留可复用的构建和验收步骤。账号身份、审核会话、提交记录、测试凭据及本机验收证据仅保存在忽略的本地运行目录，不随源码分发。每次发布都需核对实际版本与验收状态。

## 每轮更新的回归检查

在 `studio/` 运行 `pnpm typecheck`、`pnpm test` 和 `pnpm build`。桌面测试包含 `mas-compliance.test.mjs`，覆盖 Python 安装协议、缓存字节码、包安装器、私有 AppKit、私有系统压缩库、沙盒、用途说明、ATS 和扫描结果中的凭据脱敏；MAS 构建命令也会先单独运行这组测试。前端测试另覆盖所有模型厂商的商店渠道外链限制。

扫描必须绑定实际产物的版本和构建号，不能只查看 `.runtime/mas/` 中可能过期的包。下例中的路径、版本和构建号须替换为本次候选包的真实值：

```sh
node scripts/verify-mas-apis.mjs '/候选包/The Way Here.app' --version 0.1.10 --build-number 15
```

结果会报告 Bundle ID、版本、构建号、最低系统、扫描数量和失败项。版本或构建号不符也会退出失败；正式 MAS 构建自动传入本次预期值。最终签名、包内链接、签名开发包实机验收仍须完成，模拟夹具测试不能替代这些检查。

| 检查范围 | 更新时必须核对的结果 |
| --- | --- |
| 审核访问与演示（2.1） | 用本次构建从启动开始录制实体 Mac 的操作视频，并在审核备注写明版本、构建号、系统、设备、功能和可用测试路径；不得要求审核员自行购买第三方服务 |
| 沙盒与原生依赖（2.4.5、2.5.1） | 主程序和原生辅助程序均无多余服务端网络权限；无私有 AppKit 或 Apple 私有压缩库依赖；新增 Node、语音、照片及钥匙串组件均纳入最终包检查 |
| 自包含执行环境（2.5.2） | Python 源码及缓存均无安装协议残留；不带未使用的 pip/ensurepip；知识工具仍只执行随包签名代码；照片检测和分组模型及其 WebAssembly 从包内加载 |
| 渠道差异 | MAS 不启用商店外更新器；商店引导页不链接至厂商申请 API Key 的控制台；商店外版本继续沿用其既有方式 |
| 资料与共享许可 | 拒绝或撤回 AI 共享许可后不再发送；密钥不明文回退；新后台任务和目录连接也使用既有同意闸门 |
| 支付模式 | 免费下载、用户自带凭据、无自营收费均不自动豁免 3.1.1；第三方 Key 与既有账号登录须分别核实，不把 ChatGPT 订阅当成 API 额度 |

移除申请 Key 的外链仅处理导流问题，**不能据此宣称 API Key 接入已符合支付规则**。支付模式仍有未解决反馈时，先在原审核线程澄清适用范围；不以相同模式反复上传送审。技术扫描通过也不代表支付或其他政策问题已解决。参考 [Apple 审核指南 3.1](https://developer.apple.com/app-store/review/guidelines/#payments)。

## 朋友的 Mac 上准备

需要 Xcode 与命令行工具、Node >=22.19、项目锁定的 pnpm、uv；架构须与目标一致。当前构建只生成本机架构，不宣称 universal 或已支持 Intel。安装依赖：在 `studio/` 执行 `pnpm install --frozen-lockfile`。

在 Apple Developer 注册显式 Bundle ID `com.thewayhere.desktop`。准备开发测试 profile（包含本机设备）和 Mac App Store distribution profile，签名证书及对应私钥安装在朋友的钥匙串；分发还需要 Mac Installer Distribution 证书。证书不能是 Developer ID。个人账号相关门户操作需要账号持有人。

最终隐私政策和支持页必须补全运营者、处理服务与日期并上线。用终端设置以下**非密钥**变量（示例中的占位文字必须替换；不要把证书私钥提交仓库）：

```sh
export TWH_APPLE_TEAM_ID='替换为十位TEAMID'
export TWH_APPLE_PROFILE='/绝对路径/开发测试.provisionprofile'
export TWH_APPLE_IDENTITY='证书持有人姓名 (TEAMID)'
export TWH_OPERATOR='实际运营者姓名'
export TWH_PRIVACY_URL='https://你的真实域名/privacy.html'
export TWH_SUPPORT_URL='https://你的真实域名/support.html'
export TWH_BUILD_NUMBER='1'
pnpm appstore:check
pnpm appstore:dev
```

identity 填多张证书共有的姓名/Team ID 匹配部分，不带 Apple Development、Apple Distribution 等前缀，不填密码。脚本校验 profile 的 Team ID、显式 App ID、有效期和开发类型，以及本机签名身份；不会上传。输出在 `.runtime/mas-dev/`。若 Apple 要求 App Group 与 profile 匹配，注册并启用 `<TEAMID>.com.thewayhere.desktop` 后重新下载 profile，不能删掉沙盒权限规避错误。

## 签名开发包逐项验收

- 在干净 macOS 用户中启动，同版本开发包无需外部 Node/Python/Homebrew 即可使用本地 demo、搜索、编辑和删除；拒绝 AI 共享许可时仍可浏览本地内容。
- 以独立的 macOS 测试用户验证商店包首次启动。商店构建使用系统分配的应用容器，不能用普通桌面测试的 `--user-data-dir` 作为隔离证据，也不能为接入测试工具打开调试或入站网络权限。
- 外部目录用原生选择器授权。测试读写、重启恢复、移动目录、权限失效重新选取，以及服务/Python 子进程访问。授权后会重启本地服务，应在没有活动 AI 任务时连接目录或 CLI。
- Codex 是可选功能。MAS 内置固定版本 CLI，仅连接既有 ChatGPT 登录目录；测试启动 app-server、列模型、受限工具读写、对话、取消、重新启动和退出。原生 shell 及外部 CLI 不用于 MAS。失败时保留功能与错误证据，回到工程修复，不能关闭 App Sandbox、下载运行替代代码、偷偷移除功能或隐藏审核说明。
- 检验首次 AI 共享开关默认关闭，接受后才发任务；更换厂商/运行方式失效，撤回停止任务、阻止后台更新/恢复/预测发送；开发版测试只验证产品逻辑，实际网络范围须在 MAS 包中检查。MAS 固定 OpenAI 接收方，不导入外部服务配置；商店外版本的内部配置变更仍需先撤回再确认。
- 检验钥匙串不可用时保存失败且不回退明文，API 密钥移除；首次迁移旧设置生成加密 envelope，原备份文件不会自动清除。
- 检验语音授权、拒绝、停止、退出，通知、快捷键、私有进程通信、Python 校验、sharp 和其他原生组件。应用退出后无服务或录音进程残留。
- 用匿名照片在签名包中执行本地人脸检测和分组，确认实际加载随包模型、能返回结果，并在照片权限拒绝后仍可从本地文件导入。网页测试和模拟照片接口无法覆盖桌面资源策略。
- 查看所有 Mach-O 签名和各 helper entitlement。构建脚本的 `codesign --deep --strict` 与符号链接检查是基础检查，不能证明沙盒功能正常、所有组件获得正确继承权限或审核通过。
- 核验匿名 demo、依赖、模型、图片与字体授权，版本最低 macOS 和硬件支持范围；不包含私人库、登录目录、密钥、日志或本机快照。

用实际结果记录日期、机器/系统、版本、build number、每项通过/失败和证据。出现失败时不能在交接清单中勾选已通过。

## 分发包

MAS 打包在知识运行环境准备后，对固定 CPython 应用官方 App Store 合规补丁的 URL 解析部分，移除未使用的 `itms-services` 协议支持，并使对应的缓存字节码失效。此处理仅用于商店渠道，不改写系统 Python。依据：[CPython 的合规说明](https://docs.python.org/3.14/using/mac.html#app-store-compliance)及[上游补丁](https://github.com/python/cpython/blob/v3.13.0/Mac/Resources/app-store-compliance.patch)。协议过滤不等同于任意代码下载能力的审计；客户端外链仍须维持 HTTP/HTTPS/mailto 白名单，不能调用安装协议。

最终 `verify-mas-apis.mjs` 会遍历所有普通文件（包括 Python 源文件和缓存字节码）检查该安装协议残留，并对原生二进制检查私有 API、压缩库依赖及不需要的服务端监听权限。必须检查最终签名应用，不能仅扫描源码或通过隐藏字符串绕过检查。

开发包全部通过后，设置 `TWH_APPLE_PROFILE` 为对应的**商店分发** profile，保持最终版本与资源一致，执行：

```sh
pnpm appstore:release
```

输出在 `.runtime/mas/`，签名 `.pkg` 用 Transporter 验证上传；分发 `.app` 不能直接当普通应用测试。查看 `pkgutil --check-signature`，确认 Installer 证书；App Store Connect 处理成功后选择构建。现有 `desktop:package` 是另外的 DMG 渠道。

只有浏览器的代理可以填写后台字段，但不能替你本机生成私钥、签名、执行沙盒测试或操作 Transporter。使用[交接 prompt](friend-publish-prompt.md)，由有本机工具能力的代理执行，或先人工提供通过验收的签名 pkg。

参考：[Electron MAS 指南](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)、[Apple 审核规则](https://developer.apple.com/cn/app-store/review/guidelines/)。
