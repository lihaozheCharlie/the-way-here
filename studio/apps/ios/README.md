# iPhone 宿主（开发中）

当前范围以用户最新要求为准：原生 iOS 17+，负责用户输入、保存和已有内容展示；只开放手机能独立执行的功能，不创建或转交 Mac 任务。原稿中依赖桌面执行的入口已移除，Apple Watch 不在范围内。本轮模拟器原生回归 78/78、Core 54/54 已通过；运行警告与验收边界详见 [Xcode 回归记录](../../docs/IOS-XCODE-REGRESSION.md)，范围详见 [需求和验证清单](../../docs/IOS-UX-COVERAGE.md)。

## 验证

在 `studio/` 执行：

```sh
pnpm ios:prepare
pnpm ios:verify
pnpm ios:build
pnpm ios:test
```

`ios:verify` 会真实执行 Foundation 核心、全部 Swift XCTest 和各原生目标的 Swift 语法检查。没有完整 Xcode 时，输出明确的未验证状态；`ios:build` / `ios:test` 则失败，不能把语法解析当成 iPhone 编译。

安装并首次打开 Xcode，安装一个 iPhone 模拟器 runtime、接受系统所需组件后，构建脚本会优先使用 `/Applications/Xcode.app`，不修改全局开发者目录。打开 `TheWayHere.xcodeproj` 可进行原生调试。工程由 `scripts/generate-ios-project.py` 生成；新增文件后运行 `ios:prepare`。修改生成工程的目标设置时应修改生成器。

真机签名需要在 Apple 开发者配置中为主 App 和扩展配置同一 Team、App Group `group.com.thewayhere.shared`，并为 App/Share Extension 配置 iCloud 容器 `iCloud.com.thewayhere.shared` 和共享钥匙串组。模拟器构建禁用代码签名；通过模拟器不能证明真实 iCloud、系统权限、共享钥匙串或后台调度已通过验收。

## 代码边界

- `Sources/TWHCore`：资料与空间绑定、协调文件操作、三方哈希同步、冲突和回收站及分享收件箱；旧请求数据只作兼容保留，不同步或执行。
- `App`：SwiftUI 采集、记录、对话、理解与系统交互；Wiki 只读，纠正作为新来源。
- `Extensions`：分享扩展、小组件、App Intents、实时活动；复用核心协议。
- `Resources`：提供方目录与匿名演示从既有桌面数据生成；不导出私人知识库。
- `Verification`：无需 XCTest 的隔离核心检查；`Tests` / `UITests` 为 Xcode 下的补充检查。

手机本机导入只接受 Markdown、文本和有文字的 PDF，保留原件并生成可阅读记录；聊天和账单的桌面解析功能不在手机显示，也不复制一套解析器。可选手机模型只在启用、联网且配置可用时开放日记整理、照片故事和对话；失败保留输入，支持本机重试，不交给其他设备。已有理解、人物、回信和预测继续阅读；纠正、补充和想法只追加用户原话。

iCloud 只负责同一空间文件的异步同步，不要求 Mac 心跳、任务确认或专用控制标记。本机副本保留离线输入，冲突保留两份；旧 `.mobile/queue` 文件留在原设备但不经 FileSync 传播。模型 Key 使用现有系统钥匙串，详见[钥匙串配置](../../docs/IOS-KEY-SHARING.md)。桌面原有解析与知识引擎功能保持独立。

Xcode 工程不进入仓库，首次打开前运行 `ios:prepare`。签名团队从本机环境或忽略的本地配置读取，生成工程不是另一份需要手工维护的设置。
