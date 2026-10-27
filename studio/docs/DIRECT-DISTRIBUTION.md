# macOS 官网分发

官网版与 MAS 使用独立发布入口。原来的 `desktop:package` 仍只生成本机测试包，不可当作官网正式包。

## 当前准备

`pnpm desktop:release:prepare` 生成 `.runtime/direct/builder.yml` 和公开运营信息，不签名、不上传。`pnpm desktop:release:check` 核验本机 Developer ID Application 身份与钥匙串公证凭据。没有对应私钥、没有公证凭据或苹果拒绝公证时必须停止，不能退回未签名发布。

需要账号持有人在 Apple Developer 的 Certificates 中创建 **Developer ID Application**，不是 Mac App Distribution 或 Developer ID Installer。证书必须与本机 CSR 私钥配对。不要吊销现有商店证书，也不要将私钥或密码提交到仓库。

公证使用 `xcrun notarytool store-credentials <profile>` 的交互入口，由账号持有人输入账号、Team ID 与 App 专用密码，凭据保存在系统钥匙串；不要把密码发到聊天或写进命令历史。之后设置 `APPLE_KEYCHAIN_PROFILE` 为该 profile 名称。存在多张 Developer ID 证书时用 `TWH_DEVELOPER_ID` 选择。

## 构建与验证

在 `studio/` 执行：

```bash
pnpm desktop:release:prepare
APPLE_KEYCHAIN_PROFILE=twh-direct pnpm desktop:release:check
APPLE_KEYCHAIN_PROFILE=twh-direct pnpm desktop:release
```

构建沿用匿名 demo、原生语音/照片组件、Python 与知识工具打包；不收录私人库。官网版保留通过用户选择的外部 Codex 程序连接方式，不使用 MAS 的内置 CLI 或沙盒补丁。前端第三方许可证随包保存。

正式配置强制 Developer ID 签名、Hardened Runtime 与苹果公证。electron-builder 先公证并附票据到应用，再生成 DMG；脚本核验应用签名、票据及 Gatekeeper，再单独公证 DMG、附票据、核验 Gatekeeper，最后生成 `release.json` 与 `SHA256SUMS.txt`。所有产物位于忽略提交的 `.runtime/direct/`。仅生成配置不代表公证成功；以苹果 Accepted 回执、票据及 Gatekeeper 实测为准。

首次发布还需从浏览器下载到一台没有开发环境的 Mac 验证安装、启动、麦克风、照片授权、AI 连接、退出清理与资料备份。当前产物仅面向构建机架构；不能把 Apple Silicon 包称为 Intel 或通用版。系统要求须以最终包 Info.plist 与所含原生组件的实际要求为准。

## 网页与文件托管

准备页沿用现有支持网站。先运行 `node scripts/prepare-direct-site.mjs` 可生成未开放下载的预览到 `.runtime/direct-site/dist/`。安装包通过验证前不能声称可以下载或已经公证。

将最终 DMG 原样上传到公开 HTTPS 文件托管。确认托管支持安装包大小和中国大陆访问；GitHub Release 可作为候选，但本地仓库及其中的私人资料不能因此公开。

设置 `TWH_DOWNLOAD_URL` 为安装包 HTTPS 地址，再运行 `node scripts/prepare-direct-site.mjs`：它核对本地哈希、公证票据和 Gatekeeper，并下载线上文件核验相同哈希后才生成下载按钮。不要把 DMG 放进 Sites 源码仓库。发布网页时沿用现有 Sites 项目与受支持的源码同步流程，不覆盖线上已有支持/隐私内容。

官网版隐私与支持说明位于 `docs/direct-download/site/`：外部 Codex 使用用户自己的程序和配置，可能影响接收方；官网版用户数据位于 Electron 的应用支持目录；更新由用户回官网下载安装。发布时将这三页一同部署，保留现有商店版说明到独立路径，避免改变原 MAS 隐私政策链接。正式构建的 `TWH_PRIVACY_URL` 与 `TWH_SUPPORT_URL` 必须指向最终官网版页面；默认地址已指向上线的官网版 `/download/` 页面；原有根路径继续服务商店版。

## 已发布版本：2026-10-27

- 官网下载页：https://the-way-here-support.finedeer64.chatgpt.site/download/
- 正式文件：https://github.com/lihaozheCharlie/the-way-here/releases/tag/mac-v0.1.2
- 版本 0.1.2；Apple Silicon；macOS 13.0 或更新版本；安装包 1,268,282,472 字节。
- SHA-256：`aeab801ceef0fedc1007db0a0a01754a29e941f80d7e68c9abaca0af95b49ccb`。

Developer ID Application（G2）证书已安装，并验证与本机 CSR 私钥匹配。经用户明确授权创建的公证专用凭据仅存于系统钥匙串，profile 为 `twh-direct`；未改动主密码或原有 LLM Space 凭据。私钥文件位于忽略提交的 `.runtime/direct-signing/`，权限为 600，不可上传。

本次从已签名应用继续完成公证：应用 ZIP 与最终 DMG 均取得苹果 Accepted 回执，应用与 DMG 已附离线票据。对 DMG 实际只读挂载后，包内应用也通过深层严格签名、stapler 与 Gatekeeper 校验；临时磁盘已卸载。回执保存在 `.runtime/direct/app-notarization-result.json` 与 `dmg-notarization.json`，最终 manifest 为 `release.json`，校验文件为 `SHA256SUMS.txt`。

GitHub 托管端大小、SHA-256 与本机文件一致；经公开下载地址完整读取后，哈希再次匹配。官网下载按钮、版本、架构和系统要求已通过 Sites 第 6 版部署，源码提交为 `8fc4b0af371de70ff602f72b1a7c809110f9b6a5`。官网版帮助及隐私页在 `/download/` 下，商店版原有链接保持可用。当前机器下载校验需要使用现有代理，可运行 `node --use-env-proxy scripts/prepare-direct-site.mjs`，不关闭 TLS 校验。

`pnpm typecheck`、`pnpm test`、`pnpm build` 已通过，测试合计 659 项；发布脚本语法检查和实际公证、打包、签名与哈希验证已通过。尚未完成另一台无开发环境 Mac 的全功能验收，不能把公证或本机验证视为所有设备上的功能验收。官网版暂未提供自动更新。

参考：[苹果分发对比](https://developer.apple.com/macos/distribution/)、[Developer ID](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)、[electron-builder v26 公证](https://www.electron.build/v26/docs/notarization/)。

## 0.1.3 轻量语音构建

移除 Whisper large-v3、Silero VAD、CLI、模型准备脚本与桌面重转写包装层。macOS 原生助手负责中文设备端识别：实时预览、45 秒分段保存、停止后按分段请求标点、失败文字保留、60 秒分段超时和取消。系统资源不可用时明确提示，不上传录音。语音授权成为开始录音的前置条件。

构建机中文设备端识别能力与可用性检查为 true。原生组件编译通过，安装包资源检查确认不含 Whisper/VAD；`pnpm typecheck`、`pnpm test`、`pnpm build` 通过，共 657 项测试。首次与打包并行时，一个演示英文扫描用例触发 5 秒超时；完整重跑通过。没有真实录音对照或另一台 Mac 的验收结果，不能声称准确率提高。

正式产物：`The-Way-Here-0.1.3-arm64.dmg`，229,951,286 字节（约 230 MB），较 0.1.2 的 1,268,282,472 字节减少约 82%。SHA-256 为 `70680824e15407730f8f179746e81ccfb40f9cdd844e96d20f1d25d33dd46081`。应用公证回执为 `.runtime/direct/app-notarization-0.1.3.json`，DMG 公证 ID 为 `002c9f73-03d7-46e2-a178-52bcd1b0b848`，结果 Accepted；均已附票据并通过 Gatekeeper。只读挂载最终 DMG 后，包内应用也通过严格签名、公证票据和 Gatekeeper 检查，临时磁盘已卸载。

0.1.3 已发布到 https://github.com/lihaozheCharlie/the-way-here/releases/tag/mac-v0.1.3 。GitHub 资产大小、SHA-256 和公开完整下载校验均匹配。官网下载页已通过 Sites 第 7 版成功部署，源码提交 `8b91e7a82a6ff5c61d4ac895a3d96c9c458da63e`，下载按钮显示 0.1.3 / 230 MB；帮助与隐私说明同步更新。原商店版路径保留。官网地址仍为 https://the-way-here-support.finedeer64.chatgpt.site/download/ 。本次构建、公证及测试进程均已结束，验证磁盘未遗留挂载。

## 自动检查、点击下载（0.1.4 起）

固定检查地址：`https://github.com/lihaozheCharlie/the-way-here/releases/latest/download/update.json`。它随最新正式发布切换，不需要修改已安装客户端或为每次更新重新配置地址。仅下载用户点击的安装包；退出后手动替换安装。0.1.3 及更早客户端须手动安装一次 0.1.4。

以后开发完成，先递增 `apps/desktop/package.json` 的版本号，准备中英文纯文本说明（每种最多 4000 字符），运行：

```bash
APPLE_KEYCHAIN_PROFILE=twh-direct \
TWH_RELEASE_NOTES_ZH=.runtime/release-notes-zh.txt \
TWH_RELEASE_NOTES_EN=.runtime/release-notes-en.txt \
pnpm desktop:ship
```

`desktop:ship` 依次构建签名公证、生成更新信息、上传 GitHub 草稿、核对托管大小及 SHA-256，最后公开并更新 latest。安装包已准备时可单独运行 `pnpm desktop:publish`；需保持同样的说明文件环境变量。只构建而不发布仍使用 `pnpm desktop:release`。仓库和钥匙串需提前登录，脚本不保存密码。网络或权限错误会停止；已公开版本拒绝覆盖，先增版再发布。

更新信息只对当前已构建的架构提供下载，目前是 Apple Silicon。主进程校验稳定版号、架构、macOS 要求与仓库地址；网络失败不打断应用，在设置里重试。官网下载页的版本显示和固定版本按钮仍通过 `prepare-direct-site.mjs` 及 Sites 发布流程更新；可随时从 GitHub latest 查看最新发布。客户端检查更新不依赖官网页面是否刷新。

### 0.1.4 发布验证（2026-10-27）

正式包为 229,956,044 字节（约 230 MB），Apple Silicon，macOS 13.0+；SHA-256 为 `780b15bb656baa32458a42d53da2059b5bf59eb236b496fc7ff8470de9cddddf`。应用与 DMG 均已公证并附票据；DMG 公证 ID 为 `90a7fb4f-1070-4be0-816f-d21231caabfd`，Accepted。最终只读挂载后的内部应用通过严格签名、票据和 Gatekeeper，临时磁盘已卸载。

`pnpm typecheck`、`pnpm test`、`pnpm build` 通过，共 664 项测试；新增隐私与更新文案的 7 项语言检查通过。匿名浏览器验证覆盖检查中、已是最新、断网重试、不兼容、自动提示、仅点击下载、忽略与中英文说明；纯文本说明不会作为 HTML 执行。独立只读审查未发现范围内的实质缺陷。

`pnpm desktop:publish` 已实际运行，核对 GitHub 草稿安装包与更新 feed 摘要后公开 mac-v0.1.4。固定 latest-release/update.json 已实测：当前检查器返回 current，模拟旧版检查器返回 available 且指向本次公证文件；公开完整 DMG 下载哈希匹配。

官网下载、支持及隐私说明经 Sites 第 8 版部署成功，提交为 `abe9edc3451a8a0747c6a4a3197faa2f5455a967`。0.1.3 及更早用户需先手动安装一次；本机制不自动执行或覆盖安装。本次测试端口 5207、构建公证与上传验证进程、临时磁盘挂载均已清理。

## 0.1.5 启动故障修复与新增发布门槛

0.1.4 正式应用的原生 locale 模块错误地读取开发源码 `web/src/shared/i18n/en-messages.ts`，正式安装包不包含该源码，启动会发生 ENOENT。此前的签名、公证和模块测试未覆盖安装后的真实主进程启动；不能将旧版发布记录中的签名及公证通过当作安装可用性证明。

0.1.5 构建时从唯一 Web 词典生成并分发 `locales/en-messages.json`，正式运行只读随包数据。新增无开发源码的打包回归测试，以及 `verify-installed-desktop.mjs` 真实 DMG 安装与启动验收。`desktop:release` 在验收成功前不写 ready；发布和官网按钮同时要求 startupVerified。该验收会使用隔离的全新用户目录，不触碰用户原有知识库，且清理测试应用和子进程。

0.1.5 已通过三次真实运行验收：最终 DMG 复制安装、从公开下载地址重新下载后复制安装、安装到本机 Applications 后启动。每次均检查主窗口、本地 API、偏好设置、中英文界面与原生菜单、生产更新桥接，全部通过后关闭测试实例。原有 0.1.4 应用程序已备份到忽略提交的 `.runtime/installed-backup/`，用户资料目录保留。

正式文件为 230,039,760 字节，SHA-256 为 `f4647279bf6687ec44e38000f582d54b0904ef9c2858729ae42716a2d3495b28`，DMG 公证 ID `620eba3f-16b9-4a8c-bc46-86442cd44fab`，Accepted。665 项测试、类型检查和构建通过；打包结构回归在修复前复现 ENOENT，修复后通过。验收结果与真实界面截图保存在 `.runtime/installed-verification/`。

网页生成器现在保留并验证公开下载的实际 DMG，再运行同一套安装启动验收，通过后才恢复下载按钮。网站第 10 版曾暂停故障下载，第 11 版已恢复到 0.1.5，源码提交 `0458a3270cb7bc99cfeea48d4e7cee60c0724a39`。固定更新地址与新安装包摘要已再次验证匹配。
