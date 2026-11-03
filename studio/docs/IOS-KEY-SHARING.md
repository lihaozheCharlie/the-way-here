# iPhone 与 Mac 的显式共享密钥

本机旧 AI 设置继续使用 safeStorage 加密。只有用户在偏好页点击发布、使用共享、移除或明确改回本机时才改变共享状态；自动加载不会上传旧密钥。HTTP 接口只接受厂商和动作，返回能力、来源、是否存在和尾号，不接受或返回密钥。

数据路径：AgentSettingsStore → utility process 私有 parentPort → main secretService → `Contents/Helpers/MobileKeychain.app/Contents/MacOS/mobile-keychain` 的 stdin/stdout（未配置授权构建时使用不可用的裸 helper）。密钥不进入 renderer、argv、空间或 `.mobile`，也不写日志。helper 请求 Data Protection Keychain、service `com.thewayhere.mobile.models`、同步项和签名授权的 `<AppIdentifierPrefix>com.thewayhere.shared`。iOS 必须显式使用同组。

shared 来源的共享项丢失或能力不可用会让运行时不可用；本机备份不会自动顶替。registry 每次 resolve 和每15秒检查，token 改变会中断旧 Pi 活动并重建提供方配置。只有明确“改回本机”恢复旧密钥。

## 签名能力边界

默认 direct entitlement 没有共享组。构建器现支持显式配置的产品嵌套 helper，但不能仅添加 entitlement 字符串把现有 Developer ID 安装变为授权共享组。未授权安装显示不可用，不改用普通登录钥匙串或其他组。启用需 Apple Developer 为 Mac/iOS 授权同组、匹配 App ID 的有效描述文件，以及 helper／宿主正确签名。本次未发布、未读取真实用户 Key，未声称真实双端共享通过。

依据：[Apple 共享组说明](https://developer.apple.com/documentation/Security/sharing-access-to-keychain-items-among-a-collection-of-apps) 与 [TN3137](https://developer.apple.com/documentation/Technotes/tn3137-on-mac-keychains)。Mac 的 Data Protection Keychain 组需描述文件授权，本实现以 Security 实际返回值核验。

## 验证

17项匿名服务端测试覆盖显式发布、轮换、删除、重启、能力失效、加密备份、明确回本机与 HTTP 拒绝密钥正文。3项Node fake child 检查密钥仅走 stdin、argv为空、stderr丢弃。真实 Swift helper 编译及未授权 status 拒绝已检查；未使用真实 Key。 新增15项匿名 profile 元数据、构建计划、输出路径与运行路径测试；连同原私有通道和 afterPack 资源测试，本轮定向19项 Node 测试通过。

## 调用方认证与生产签名路线

私有 stdin/stdout 只是传输通道，不构成调用方身份。生产 helper 在读取 stdin 前记录内核 `getppid()`；之后通过 Security.framework 的 `SecCodeCopyGuestWithAttributes` 取得该 PID 的动态 code，要求 `anchor apple generic`、与 helper 真实签名相同的 Team，且 identifier 仅为 `com.thewayhere.desktop` 或 `com.thewayhere.desktop.dev`。helper 自身的 Team 和共享组来自 `SecCodeCopySelf` 与已验证签名的信息，不读取可伪造的 argv[0] 或环境变量。父签名还通过 `SecCodeCopyStaticCode` 和 `SecStaticCodeCheckValidity(strictValidate | checkNestedCode)` 检查完整 bundle 的资源封印与嵌套代码，包含 extraResources 下的服务端代码。每次 SecItem 操作前重新核验 PID、完整 bundle、签名要求、identifier 与 CDHash；输出读取到的 token 前再核验一次。父进程退出、被替换、Team/identifier 不符或签名无效均在钥匙串访问前拒绝。

只有有效 UUID 的 `acceptanceRun` 可跳过桌面父签名，并且只能访问独立的 `.acceptance.<UUID>` service 与 `anonymous-phone` / `anonymous-mac` 两个账户；真实厂商账户始终被拒绝。该测试能力不能提升到生产 service。`scripts/verify-mobile-keychain-authorization.mjs` 编译执行16项匿名原生授权检查，并验证裸 unsigned helper 拒绝普通 Node 调用；不读取真实 Key。编译期测试分支不会进入 SecItem 代码，不能通过运行参数或环境开启。

产品构建已支持独立 App ID `com.thewayhere.desktop.mobile-keychain`。正常未配置构建仍使用不可用的裸 helper；QA wrapper 不能替代产品签名。显式配置以下三项后，`scripts/build-desktop-native.mjs` 才生成 `apps/desktop/dist/MobileKeychain.app`：

```bash
export TWH_MOBILE_KEYCHAIN_PROFILE='/absolute/path/MobileKeychain.provisionprofile'
export TWH_MOBILE_KEYCHAIN_IDENTITY='<完整签名证书名称或 SHA-1 指纹>'
export TWH_MOBILE_KEYCHAIN_TEAM_ID='<10位 Team ID>'
node scripts/build-desktop-native.mjs
```

profile 必须是有效 macOS profile，授权产品 helper App ID，并授权 `<AppIdentifierPrefix>com.thewayhere.shared`（profile 的同前缀通配允许项可授权；实际签名只请求这一精确共享组）。构建器验证有效期、App ID、prefix、Team、证书 SHA-1 与证书真实 OU；不从证书显示名括号推断 Team。缺少任一配置、QA App ID、不覆盖产品的通配、错误 group、过期或证书不匹配均报错，不静默降级。没有三项配置时会移除旧的生成 bundle，保留裸 helper 的不可用状态与旧本机加密 Key。仅 Development 渠道允许 profile 的单个末尾通配授权（`PREFIX.*` 或 `PREFIX.com.example.*`），且必须覆盖精确产品 App ID。实际签名始终为精确产品 App ID 和唯一共享组；不会把 profile 通配值复制进签名。开发描述文件必须包含本机 `system_profiler` 报告的 provisioning UDID（Apple Silicon 上不同于 Hardware UUID），且不可将开发证书/设备限制转换为分发授权；Developer ID/MAS 分发仍要求精确产品 App ID。描述文件必须嵌入 `.app/Contents/embedded.provisionprofile`；独立裸可执行文件不能承载这份授权。[Apple TN3125](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles)

`afterPack` 将校验后的 bundle 放入桌面应用的 `Contents/Helpers/`，删除这次打包中的裸副本，并要求父签名使用相同 Team、匹配的开发或分发通道。普通签名跳过这份独立签名 bundle，避免 Electron 的通用 entitlement 覆盖它；`afterSign` 再检查 Apple 签名锚点、父子 Team/identifier、精确 entitlement、嵌入 profile 与构建摘要。MAS 原有签名步骤末尾也执行此检查。helper 由桌面直接 spawn，不能通过 `open` 或 shell 转发。Electron fuses 保持现有配置，正式安装包仍须验证它们和完整资源封印。[electron-builder 构建钩子](https://www.electron.build/docs/features/hooks/)

匿名元数据/路径/构建计划与无 profile 分支的定向 Node 测试共 19 项通过，包含开发通配授权、精确最终签名计划及本机设备限制边界；生产 Swift 已独立编译。已在独立匿名测试输出目录，用现有 Development profile 构建真实 helper，并封装到正确父 ID 的同 Team 开发父 bundle；父子 Apple 签名锚点、精确 App ID/共享组、profile 与源/二进制摘要验证均通过。父子可执行文件未启动，SecItem 操作为 0。Development 本地签名验证与实际同组 Key 访问是不同验收阶段：签名检查不能证明已执行钥匙串操作。 后续另一次有界正向检查将该匿名父程序重签后，实际通过生产父授权 gate 调用嵌套 helper，仅传 `{"operation":"status"}`；生产 helper 仅查询固定 `__capability_probe__` 且未请求返回数据，结果为 `{"available":true}`。未传 provider/token/acceptanceRun，未创建、读取或删除厂商 Key，父子进程均已退出。这证明当前本机 Development 父授权和系统共享组能力可用，不证明跨端同步或 Developer ID 分发可用。Developer ID 导出仍因 Xcode `No Accounts` 与缺少产品对应分发描述文件阻塞；Development 产物不得冒充分发安装包。没有读取真实厂商 Key，也没有发布；真正的同组访问和跨端轮换/删除仍须在最终同 Team 安装包中独立验收。

Apple 将 profile 的 entitlement 视为授权 allowlist，允许通配；应用签名必须请求具体值。Xcode 会在签名时展开 profile 的通配授权。本地构建器沿用这一边界，仅为开发验收增加合法末尾通配兼容。[Apple TN3125](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles)、[Apple TN2415](https://developer.apple.com/library/archive/technotes/tn2415/)
