# MAS 构建与交接验收

本文件保留可复用的构建和验收步骤。账号身份、审核会话、提交记录、测试凭据及本机验收证据仅保存在忽略的本地运行目录，不随源码分发。每次发布都需核对实际版本与验收状态。

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
- 外部目录用原生选择器授权。测试读写、重启恢复、移动目录、权限失效重新选取，以及服务/Python 子进程访问。授权后会重启本地服务，应在没有活动 AI 任务时连接目录或 CLI。
- Codex 是可选功能。MAS 内置固定版本 CLI，仅连接既有 ChatGPT 登录目录；测试启动 app-server、列模型、受限工具读写、对话、取消、重新启动和退出。原生 shell 及外部 CLI 不用于 MAS。失败时保留功能与错误证据，回到工程修复，不能关闭 App Sandbox、下载运行替代代码、偷偷移除功能或隐藏审核说明。
- 检验首次 AI 共享开关默认关闭，接受后才发任务；更换厂商/运行方式失效，撤回停止任务、阻止后台更新/恢复/预测发送；开发版测试只验证产品逻辑，实际网络范围须在 MAS 包中检查。MAS 固定 OpenAI 接收方，不导入外部服务配置；商店外版本的内部配置变更仍需先撤回再确认。
- 检验钥匙串不可用时保存失败且不回退明文，API 密钥移除；首次迁移旧设置生成加密 envelope，原备份文件不会自动清除。
- 检验语音授权、拒绝、停止、退出，通知、快捷键、本地回环网络、Python 校验、sharp/其他 native 组件。应用退出后无服务或录音进程残留。
- 查看所有 Mach-O 签名和各 helper entitlement。构建脚本的 `codesign --deep --strict` 与符号链接检查是基础检查，不能证明沙盒功能正常、所有组件获得正确继承权限或审核通过。
- 核验匿名 demo、依赖、模型、图片与字体授权，版本最低 macOS 和硬件支持范围；不包含私人库、登录目录、密钥、日志或本机快照。

用实际结果记录日期、机器/系统、版本、build number、每项通过/失败和证据。出现失败时不能在交接清单中勾选已通过。

## 分发包

开发包全部通过后，设置 `TWH_APPLE_PROFILE` 为对应的**商店分发** profile，保持最终版本与资源一致，执行：

```sh
pnpm appstore:release
```

输出在 `.runtime/mas/`，签名 `.pkg` 用 Transporter 验证上传；分发 `.app` 不能直接当普通应用测试。查看 `pkgutil --check-signature`，确认 Installer 证书；App Store Connect 处理成功后选择构建。现有 `desktop:package` 是另外的 DMG 渠道。

只有浏览器的代理可以填写后台字段，但不能替你本机生成私钥、签名、执行沙盒测试或操作 Transporter。使用[交接 prompt](friend-publish-prompt.md)，由有本机工具能力的代理执行，或先人工提供通过验收的签名 pkg。

参考：[Electron MAS 指南](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)、[Apple 审核规则](https://developer.apple.com/cn/app-store/review/guidelines/)。
