# The Way Here 商店版工程准备清单

已完成商店版 0.1.2 的开发签名实测：包内 Codex 0.162.1 与 DeepSeek 均完成匿名问答及生活记录整理保存，Codex 还验证了取消、恢复与撤回许可。公开政策、隐私标签及截图已准备。最终分发包采用 macOS 15 / Apple Silicon，保留 Codex CLI 和 App Sandbox。上传与提交结果及尚未完成的实机验收以 [mas-validation.md](mas-validation.md) 为准。

## 实现及剩余验收

| 项目 | 已实现 | 仍需完成 |
| --- | --- | --- |
| MAS 构建 | 独立 check/dev/release 命令、明确 Team/App ID/profile 检查、沙盒权限、递增构建号、签名及包内链接检查 | 签名及基础实机验证已通过，补齐完整验收 |
| 文件访问 | security-scoped bookmarks 持久化、启动恢复、失效提示；授权后重启服务以继承授权 | Python/utility process/外部 CLI 的真实沙盒访问；授权期间无活动任务 |
| Codex CLI | 内置固定版本，用户只连接既有 ChatGPT 登录；受限工具逐任务绑定，禁用 shell/插件/MCP | 正式产品的匿名读取及整理保存成功；补齐写入、取消、恢复验收和完整第三方许可 |
| 确定性工具 | 打包桌面版从 App Resources 执行 Python；引导器只重绑定数据根，不复制领域规则 | 所有 native/Python 组件签名和运行 |
| AI 同意 | 统一运行时 start/steer/approval/recover 闸门；按厂商记录、撤回中断任务；后台任务同样覆盖 | 实机网络验证、Codex 接收方识别限制的评估 |
| 密钥 | 桌面主进程 safeStorage 加密设置；worker IPC，旧设置迁移，失败不回退明文 | 钥匙串失效、迁移、备份清理与真实包验证 |
| 隐私入口 | 应用内说明与公开政策入口，发布配置注入真实运营者和 URL | 草稿补全、真实网页、App Privacy 问卷与实际数据流一致 |
| 中国大陆 | 操作手册已列核对步骤 | 在真实 App 记录核对备案/供应资料，不能推测豁免 |

详细命令、限制与验收步骤见 [mas-validation.md](mas-validation.md)。

## 数据流与隐私声明核对

| 数据 | 当前实现与待核对点 |
| --- | --- |
| 日记、Markdown、Wiki、对话和任务快照 | 保存在本机；AI 可能读取相关内容作为上下文。任务快照、对话记录的保留与删除也要覆盖，不能只删除一篇原文就承诺所有副本已删除 |
| 照片 | 本地保存和处理；AI 写故事会读取图片并发送给所选模型。不得承诺照片始终只在本机处理 |
| 消费账单 | 本地导入后可能作为 AI 上下文；核对是否传出金额、交易项目或其他财务信息，若传出并构成收集，按实际类别申报 |
| 麦克风音频 | `native/SpeechCapture.swift` 支持时优先设备识别；不支持时由系统语音服务处理。不能宣称始终离线；AI 整理使用转写及任务上下文 |
| API 密钥 | 打包桌面版以 safeStorage/Keychain 支持的加密 envelope 保存并迁移旧文件；浏览器开发服务仍用 0600 JSON。MAS 经用户选择仅导入 ChatGPT 登录材料至应用私有目录（0600），不复制原始配置/会话；备份与历史明文副本需另行清理 |
| 第三方提供方 | 当前配置含 DeepSeek、智谱、阿里云千问、Kimi、MiniMax 等，也有 Codex 路径。按最终保留服务逐一补充准确运营实体、官方隐私链接、保留/训练政策及处理地区；不要替服务商承诺不留存或不训练 |
| 分析与崩溃报告 | 源码检查未见主动分析上传配置；最终安装包仍需检查 Electron 和所有第三方 SDK，不能把源码搜索等同完整网络审计 |

App Store 的“收集”强调离开设备后的访问和保留；本地处理通常不用申报，第三方行为仍需纳入。其他用户内容、照片、音频和财务信息只是需要核对的类别，不能机械全选或全不选；每类还要判断用途、是否关联身份和是否跟踪。[Apple 隐私标签定义与示例](https://developer.apple.com/app-store/app-privacy-details/)。

隐私问卷、网页隐私政策、`PrivacyInfo.xcprivacy` 是三种不同材料。审计最终二进制的 Required Reason APIs 和 SDK 清单后填写实际理由；不能用空 manifest 或随意理由码当作完成。[Required Reason API 文档](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)。

## 包内容与版本

- Apple 上传校验 90285 不支持 `com.apple.security.personal-information.speech-recognition`，MAS 配置已移除。语音仍通过 `NSSpeechRecognitionUsageDescription`、SFSpeechRecognizer 运行时授权及受支持的 audio-input 权限使用；真实麦克风完整验收尚未完成。

- MAS 最低系统为 macOS 15.0：完整 Codex 发行资源中的 zsh 要求 15、voice 要求 14；54 个 Mach-O 的部署目标检查通过，尚未在最低系统实机验证。
- `package-licenses.mjs` 收集前端 141 个运行依赖的原许可、通知与包元数据，并随包保留 Electron、Python、服务器及 Codex 组件许可。官方上游缺失的部分声明在 `scripts/licenses/` 补齐，保留来源。服务器依赖复制时排除 `.claude/.codex/.agents/.git/.github` 开发配置目录。
- 当前桌面版本 `0.1.2`，根工作区版本 `0.1.0`。最终商店版本应以桌面应用包为准，明确独立递增的构建号。
- 当前 DMG 是 Apple Silicon；没有验证 Intel 兼容，不得在描述中承诺所有 Mac 均支持。若增加 x64，Swift、Python 和所有原生模块需匹配架构。
- 明确最低 macOS 版本，按 Electron 版本、Swift 编译目标、Python 和实际硬件测试综合确定，不能凭默认值承诺。
- 检查随包匿名 demo、图片、人脸模型、Python、PyYAML、Electron、字体和 npm 依赖的授权与必要许可声明；不把现有 demo 目录视为自动完成权利审核。
- 相机用途字符串现有但功能通过文件选择器导入照片；确认实际是否使用摄像头，不为未实现功能索要权限。
- 商店版本更新使用商店渠道，所有运行的子进程必须随退出停止。

## 验收顺序

1. 普通代码质量检查：在 `studio/` 运行 `pnpm typecheck`、`pnpm test`、`pnpm build`。
2. MAS 开发签名包：干净 macOS 用户、无需外部开发工具，首次启动 demo 和个人库可用。
3. 授权目录：选择、读取、修改、退出重启、权限撤回、目录移动和失效恢复；覆盖本地服务及 Python。
4. 网络及 AI：不配置服务、拒绝同意、同意后对话、改服务方、撤回同意、自动更新、网络失败、取消运行；审核员有真实可用的测试方式。
5. 语音及通知：真实麦克风，拒绝授权后的降级，录音停止、退出后无残留采集或服务。
6. 资料保护：商店包不含私人库、本机状态、密钥、日志和个人绝对路径；只带经过权利核对的 demo。
7. 最终 PKG：签名/描述文件/Bundle ID/构建号一致，Transporter 验证上传通过，重新截图并核对网页和商店元数据。

普通测试成功只能说明现有产品基线可用，不能替代上面 MAS 开发包和真实权限验收。
