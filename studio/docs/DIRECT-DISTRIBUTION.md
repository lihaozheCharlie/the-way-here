# macOS 官网分发

官网版与 MAS 使用独立发布入口。原来的 `desktop:package` 仍只生成本机测试包，不可当作官网正式包。

## 客户端内自动更新（0.1.7 起）

新客户端启动后、激活时及每十五分钟检查版本。侧栏偏好设置右侧提供下载按钮，点击后在应用内显示进度，校验完成且当前工作安全后自动重启安装。录音、未保存内容、正在写入的请求及任一知识库的任务未完成时会等待，失败提供重试。0.1.6 及更早客户端需手动安装支持此机制的版本一次。

发布仍使用 `desktop:ship`，现同时生成 DMG 与 ZIP。ZIP 来自同一签名、公证并附票据的应用，并单独进行启动验收；两个格式均通过后才记录 `autoUpdateVerified`。GitHub 发布增加 ZIP 和 `latest-mac.yml`，继续提供旧客户端可读的 `update.json`，固定更新地址不变。ZIP 下载锁定检查时的版本，发布前核对全部托管资产摘要。

组件测试覆盖显式下载、进度、摘要篡改、重试、退出清理、跨窗口准备和跨知识库任务保护；匿名浏览器验收覆盖中英文按钮及保存准备。类型检查、671 项测试及构建通过，独立界面复核的失败反馈和英文空间问题均已解决。

`verify-native-update.mjs` 已用独立 Bundle ID、两份临时 Developer ID 签名应用与匿名资料目录，实测生产 UpdateChecker/安装适配器、真实 electron-updater/Squirrel.Mac 下载、原地替换、自动重启和草稿保留。测试仅将网络传输指向本机夹具，保持版本及摘要校验；没有发布虚构版本或访问真实资料。所有测试应用、进程、端口、资料及缓存均清理，结果位于 `.runtime/update-ui/native-upgrade.json`。本轮使用既有签名应用模板与工作区中的更新组件；正式发布还会对当版新包执行 `--require-bundled-updater`，要求自动更新依赖确实随包分发，并通过同一替换验收，成功后才写 `autoUpdateVerified`。

### 官网同步验证（2026-10-28）

0.1.7 的官网下载页、使用帮助及更新隐私说明已通过 Sites 第 12 版部署，源码提交 `38760457e1e29ddd2c9524a67e6bcb386c2e44ef`，部署 ID `appgdep_6ae164078df081919f417dd8015d1c50`，状态 succeeded。页面显示 0.1.7 / Apple Silicon / macOS 13.0+ / 231 MB，按钮指向本次已公证并完整下载校验的 DMG。帮助说明应用内下载与自动安装，并提示旧版手动安装一次；其他托管页面内容不变。

原地址 `https://the-way-here-support.finedeer64.chatgpt.site/download/` 实测自动转到当前标准地址 `https://the-way-here-support.charlielii.chatgpt.site/download/`，两者均成功返回 0.1.7 与正确下载链接。今后将官网下载页同步作为每次客户端发布的必要步骤。类型检查、671 项测试及构建通过，临时预览与安装测试已退出，5213 端口已释放。

## 0.1.8 发布验收（2026-10-28）

本版修复三项问题：用户选择的目录、语言、通知、界面和窗口偏好独立持久化，升级补缺失字段并保留已有选择；跨天草稿首次生成日记使用最终保存时的本地日期，补充既有日记保留原日期；标题在 Enter 或失焦时提交，停顿、移动光标和输入法组合输入不再触发自动退出编辑。配置清单及边界见 `USER-PREFERENCES.md`。本轮未改动用户现有配置或私人笔记。

679 项测试、类型检查、构建和标题浏览器回归通过。用户恢复既有 `twh-direct` 后，应用公证 `ac7cced2-771e-4f1c-8bbd-3c55d7c8f768`、DMG 公证 `972a43b5-c65d-418b-86b3-b4f5c4308595` 均为 Accepted，签名、票据和 Gatekeeper 验证通过。最终 DMG、ZIP 真实安装启动、打包应用配置重启保留，以及真实 Squirrel.Mac 替换后偏好与草稿保留均通过。

DMG 为 230529744 字节，SHA-256 `b37e43285f5adf179761a3a731ffe10b00ce897652622b6772fe7da875fe6c81`；ZIP 为 237094305 字节。正式 `release.json` 的 ready、startupVerified、autoUpdateVerified、preferencesVerified 均为 true。正式发布验收已取代早期未公证预检记录。

0.1.8 已在 GitHub 正式公开，草稿中的 DMG、ZIP、更新信息及校验文件大小与 SHA-256 全部匹配后才切换 latest。GitHub CLI 多文件上传遇到 HTTP 408，本轮通过官方 REST 接口逐个传输并复用已验证资产；上传直连与 HTTP/2 流式方式完成，不更改系统代理。凭据仅从既有登录读取到内存并通过 stdin 交给 curl，不写入文件或日志。公开 DMG 已完整下载并校验通过，下载文件的真实安装启动、界面与更新桥接验收通过。公开 ZIP 的完整下载大小与 SHA-512 也已匹配。客户端更新 feed、原生 feed 与安装器元数据一致：当前版检查为 current，模拟旧版检查为 available，并指向本次版本固定文件。结果见 `.runtime/direct/public-verification-0.1.8.json`。发布下载工具支持保留断点并续传，完整文件仍强制检查大小和摘要，篡改及超长文件拒绝用例通过。

Sites 第 13 版已部署成功，源码提交 `1bbb9cbe4add4b1193d4517e39e9c36f8ecc4a37`，部署 ID `appgdep_6ae1ab0b4e0c81918625f3becf857de0`。新旧两个 `/download/` 地址均返回 200、显示 0.1.8、正确 DMG 链接及同版更新说明；旧地址跳转到当前 charlielii 标准地址。六个其他托管文件摘要保持不变。网站临时预览已停止，49469 端口释放；本次发布及安装测试进程、临时挂载均已清理。

## 用户长期授权与常用入口

### 0.1.7 发布验证（2026-10-28）

2026-10-28 在已授权发布的正常钥匙串访问环境中，原 `twh-direct` 配置验证成功，无需重建凭据；先前受限预检的“未找到”不能据此断言凭据已删除。0.1.7 合并客户端内自动更新与长语音逐句累计修复，已完成正式构建、公证、DMG 与 ZIP 真实安装启动验收，以及随包更新组件的真实替换、重启与匿名草稿保留验收。

语音修复使用四段既有录音在本机设备端实速重放，未上传录音，也未将私人音频或转写加入仓库：37.8 秒录音旧结果 47 字、修复后 82 字；315.4 秒录音旧结果 454 字、修复后 1146 字且完整保留 15139200 帧；42.1 秒及 31.8 秒录音额外测试暂停、继续及停止重识别，结果分别 126 字、77 字，全部音频帧保留，无识别中断警告。这是本次已复现故障的回归结果，不是识别准确率或所有环境完整性的保证。类型检查、671 项测试、前后端构建和原生构建均通过。

正式发布：https://github.com/lihaozheCharlie/the-way-here/releases/tag/mac-v0.1.7 。DMG 为 230528390 字节，SHA-256 `8a5a823e1488d885576bb42df5b613133d6d171d616d7c9771ed1a43f51814d2`；自动更新 ZIP 为 237090542 字节。应用公证 ID `b0033596-b783-453a-82bb-89599b1b0d50`、DMG 公证 ID `dbcb6868-7188-4319-a04d-20baf31d7bf7`，均为 Accepted。GitHub 草稿的全部资产大小与摘要验证后公开，固定 latest 更新信息已切换 0.1.7。公开 DMG 的 SHA-256、ZIP 的 SHA-512 与完整下载大小均再次匹配，当前版检查为 current、模拟旧版检查为 available，原生更新 feed 与安装器元数据一致；结果保存在 `.runtime/direct/public-verification-0.1.7.json`。0.1.6 及更早版本需手动安装这一次，以后可使用应用内下载和自动安装。测试助手、安装实例、更新夹具服务、进程和临时挂载均已清理，没有覆盖或重启用户正在使用的应用。

用户在 2026-10-27 明确允许当前 0.1.6 构建包提交 Apple 公证，并授权今后频繁要求推送本软件更新时自动执行完整常规发布流程。收到更新发布请求后，沿用 `studio/AGENTS.md` 的授权范围，无需反复询问 Apple 公证或 GitHub 发布许可；不自动发起无用户请求的发布，不更改平台审批设置。

常规顺序：检查当前公开版本 → 递增 `apps/desktop/package.json` 版本号 → 准备中英文说明 → `pnpm typecheck`、`pnpm test`、`pnpm build` → 使用现有 `twh-direct` 钥匙串 profile 执行下文 `desktop:ship` → 核验最新公开 feed、版本、下载大小及 SHA-256。签名、公证和最终 DMG 隔离安装验收由发布脚本串联；GitHub 上传只包含签名安装包、校验和及更新 feed。每次发布必须同步官网的版本、下载按钮及相关帮助说明，完成下文 Sites 源码同步与部署，并记录成功结果；客户端 feed 切换和官网部署都完成才结束发布。所有测试进程和临时挂载必须清理，不替用户重启或覆盖正在使用的应用。

## 当前准备

`pnpm desktop:release:prepare` 生成 `.runtime/direct/builder.yml` 和公开运营信息，不签名、不上传。`pnpm desktop:release:check` 核验本机 Developer ID Application 身份与钥匙串公证凭据。没有对应私钥、没有公证凭据或苹果拒绝公证时必须停止，不能退回未签名发布。若受限环境报告找不到既有 profile，先通过已授权发布流程验证钥匙串访问，再判断是否真的缺失；不要仅凭受限预检结果要求用户重新配置。

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

## 0.1.6 转写覆盖保护（已发布）

修复停止录音后明显变短的最终识别结果覆盖较完整预览的问题：最终文字不足对应预览的一半时，保留较完整预览及分段录音，并提示识别未完成。这是疑似截断保护，不是识别完整性保证。

匿名输入对照确认：旧版将 94 字预览覆盖为 21 字，修复后保留 94 字；空结果、较短的正常纠正和多段顺序的回归检查通过。类型检查、665 项测试及构建通过。最终 DMG 通过签名、Apple 公证及 Gatekeeper 校验，并复制到隔离目录完成真实安装启动、本地 API、中英文界面与菜单及更新桥接验收。测试进程、资料和临时挂载均已清理。

正式发布：https://github.com/lihaozheCharlie/the-way-here/releases/tag/mac-v0.1.6 。安装包 230,032,632 字节，SHA-256 为 `4d809f6ce9253953fe483a6fcff0141fe1f530e302c4d3d142a9fac496efd06c`；应用公证 ID `acfc6830-e7f2-4d85-9375-00808c4e7cd2`，DMG 公证 ID `44ee11c5-6d25-4ba6-9a1c-86ed16db2c3d`，均为 Accepted。GitHub 草稿资产大小及摘要核对后公开，固定 latest-release 更新 feed 已切换 0.1.6。公开完整下载的大小和 SHA-256 再次匹配，0.1.5 检查器返回 available，0.1.6 返回 current；结果保存在 `.runtime/direct/public-verification-0.1.6.json`。本次未重新部署官网下载网站，客户端推送通过固定更新 feed 生效。

## 启动与加密设置回归

每次正式发布须针对最终安装包执行 `verify-first-install.mjs` 和 `verify-desktop.mjs` 的隔离验收：无开发环境的首次启动、保留记录及偏好的再次启动，以及保存加密 AI 设置后的重启读取。`verify-desktop.mjs` 必须确认加密格式、密钥不以明文落盘、模型设置一致且重启不重写密文。测试失败不得公开新版本。源码开发桌面端也必须执行同样的加密重启验收，不能只验证空配置。初始化失败通过私有运行时通道提供不含原始配置或密钥的原因；AI 设置失败不能引导用户更换知识空间。


## 0.1.9 发布验收（2026-10-29）

修复开发版桌面应用读取既有加密 AI 设置的问题，开发版与正式版均使用主进程钥匙串通道；启动失败返回脱敏提示，AI 设置失败不引导更换知识空间。页面或知识库切换不再自动中断协作任务，任务继续绑定原知识库；浏览器实测覆盖跨页面运行、从历史列表恢复及显式停止。

类型检查、680 项测试与构建通过。源码开发桌面端与最终公证应用的加密设置保存、重启读取、模型及密文保留验收均通过；最终应用首次隔离安装、匿名演示及再次启动通过。应用公证 `f370f430-88f9-448b-9930-eafc7cb6d32c`、DMG 公证 `501fea73-30cd-4509-9a4e-41776afe7f40` 均为 Accepted。DMG 与 ZIP 的真实启动、中英文界面和更新桥接、用户偏好保留，以及真实自动更新替换、自动重启、草稿和偏好保留均通过。

正式发布：https://github.com/lihaozheCharlie/the-way-here/releases/tag/mac-v0.1.9 。DMG 为 230542128 字节，SHA-256 `5e0072f0a122c97bd1879f2f46e002e48d53f4119e9182e7be32a7f6a99ccacd`；ZIP 为 237095702 字节。草稿托管资产摘要核对后公开并切换 latest。公开 DMG 与 ZIP 均完整下载并核对大小及摘要，当前客户端检查为 current，模拟旧版为 available；官网下载 DMG 再次真实安装启动通过。结果见 `.runtime/direct/public-verification-0.1.9.json`。

官网通过 Sites 第 14 版部署成功，源码提交 `e6a06e2a6518dda253c78c24f8cc427235ae39b8`，部署 ID `appgdep_6ae331ec7a3c8191886f6d428cb705c4`，地址 https://the-way-here-support.charlielii.chatgpt.site/download/ 。仅下载页版本、固定下载链接和本次说明变化，其余八个文件摘要一致。客户端源码提交为 `77508ee34431ed610d46848dbbecb5b9af179882`，已推送 main。本次隔离测试的应用、进程、服务、挂载和资料均由验收脚本清理。
