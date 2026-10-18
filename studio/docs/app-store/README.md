# The Way Here Mac App Store 上架操作手册

本目录保存商店发布的通用步骤、文案与公开政策源文件。发布状态以实际构建和后台核对为准；账号、证书私钥、非公开审核记录及凭据仅保存在本机，不提交仓库。

## 已准备的材料

- [商店文案和审核说明](metadata.zh-Hans.md)，含可复制的简体中文描述。
- [隐私政策源文件](site/privacy.html)和[支持页源文件](site/support.html)，已通过公开网站上线。
- [工程改造和验收清单](engineering.md)，包含具体代码位置。
- 在 `studio/` 运行 `pnpm appstore:assets`，生成匿名演示截图、1024 像素图标和尺寸/哈希清单，输出到 `.runtime/app-store-preparation/`。这些是当前功能的准备素材，最终商店版完成后需重新截图核对。

## 第一步 让朋友完成账号设置

1. 朋友登录 [Apple Developer](https://developer.apple.com/account/)，确认付费会员有效，处理待签协议。免费下载不等于无需开发者会员。
2. 朋友登录 [App Store Connect](https://appstoreconnect.apple.com/)，在“用户和访问”邀请你的 Apple 账号，分配 App Manager 角色，以管理文案、构建和提交；App 创建后将访问范围限制到本 App。
3. 你接受邀请，用自己的 Apple 账号登录后台。不要把朋友的密码、验证码或证书私钥发到聊天或仓库。
4. **个人账号的邀请只授予 App Store Connect 权限，不会让你加入其开发者团队。** Bundle ID、证书、描述文件等开发者门户操作仍由朋友完成；最省事的方式是在朋友控制的 Mac 上完成最终签名。其设备需安装项目依赖和 Xcode。签名材料通过受控方式使用，不放进代码仓库。
5. 你们先约定好后续更新、会员续费、客服处理和未来转移 App 的配合方式。个人账号的销售方显示朋友的法定姓名；商店 App 名仍可用 The Way Here。[账号角色](https://developer.apple.com/help/account/access/roles)、[个人账号销售方](https://developer.apple.com/help/account/membership/program-enrollment)。

## 第二步 建立 App 记录

朋友先在开发者门户的 Certificates, Identifiers & Profiles 注册显式 App ID。当前代码 Bundle ID 是 `com.thewayhere.desktop`，先确认可注册并最终确定；不要临时注册另一个 ID 后忘记同步代码。

在 App Store Connect →“我的 App”→“+”→“新建 App”填写：

| 字段 | 内容 |
| --- | --- |
| 平台 | macOS |
| 名称 | The Way Here，后台需确认未被占用 |
| 主要语言 | 简体中文 |
| Bundle ID | 最终注册并与包内一致的 ID |
| SKU | 建议 TWH-MAC-001，仅内部使用 |
| 用户访问 | 限制到实际协作者 |

名称占用需另选；**上传首个构建后 Bundle ID 不能随意改**。[创建 App](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app)、[App 信息字段](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)。

## 第三步 发布网页并准备大陆信息

1. 将 `site/` 两个网页发布为稳定的公开 HTTPS 地址。域名可用现有域名，不必为此新建复杂网站；必须能从中国大陆和审核网络打开，无登录要求。
2. 隐私政策中带 `【待填写】` 的运营者、最终模型提供方说明、生效日期必须补齐，并按最终版本核对。现阶段保留“草稿”提示，不能原样当正式政策上线。
3. 在商店“支持 URL”填支持页地址，“隐私政策 URL”填政策页地址，并在 App 内提供可访问的隐私入口。
4. “价格与供应范围”选择免费，只选中国大陆。
5. 打开 App 信息中的中国大陆供应信息，核对本 macOS App 是否被要求提供 ICP 备案或其他文件。Apple 文档说明部分 App 需要，不能由“免费”或“桌面版”推导免除；当前未取得针对本 App 的判定。若后台要求，先完成对应备案并确保主体、App 名称、Bundle ID 等一致，再提交。网页域名备案与 App 备案不是同一件事。官方支持入口：[联系 Apple Developer](https://developer.apple.com/contact/)。

[Apple 中国大陆供应要求](https://developer.apple.com/cn/help/app-store-connect/reference/app-information/app-information/)。不把欧盟交易者声明作为只在中国大陆首发的前置步骤。

## 第四步 完成商店版并签名

按 [MAS 构建与验收](mas-validation.md) 使用 `appstore:check`、`appstore:dev`、`appstore:release`。已实现代码适配仍需真正的签名沙盒测试；不能把 DMG 改后缀为 PKG，也不能只给现有包做公证就提交。

朋友在开发者门户准备与 Bundle ID 对应的开发/分发描述文件、应用签名证书及 Mac 安装包分发证书。Electron 的 MAS 版本、主程序、辅助进程、原生语音组件和 Python 内的可执行代码都需要匹配的签名与权限。Development 沙盒构建用于本机验收，Distribution 构建用于商店提交；分发包不能按普通 DMG 的方式验证运行。证书名称以 Apple 门户和当前打包工具识别结果为准。

先跑通 MAS 开发包，再产出签名的商店 `.pkg`。这里需要 **Mac App Store 分发签名**；现有桌面文档中的 Developer ID 和公证流程用于商店外分发。[Electron 商店指南](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)。

## 第五步 上传和测试

1. 在签名机器安装 Apple 的 Transporter，使用有上传权限的 Apple 账号登录。
2. 拖入最终签名 `.pkg`，先验证，再交付。等待后台处理结束，处理失败时按邮件及上传日志修复；重复上传需递增构建号。
3. 在 App Store Connect 的 TestFlight 检查构建状态。可用的测试分发方式依 Apple 对该 macOS 构建的支持及处理结果决定；至少完成 MAS 开发包在干净用户环境中的验收。外部 TestFlight 测试可能需要 Beta 审核。
4. 验收不能要求安装 Node、Python、Homebrew、Codex CLI 或进入终端。真实语音、文件夹重启后访问和 AI 请求都要测试；普通 Web 构建通过不代表商店版通过。

[上传构建](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)、[Transporter 接受 macOS PKG](https://support.apple.com/en-gb/guide/transporter-app/welcome/mac)。

## 第六步 填写并送审

1. 选择 macOS 版本，使用材料中的描述、副标题、关键词和截图。版本以最终包内值为准；当前桌面代码版本是 0.1.2，尚未改成 1.0.0。
2. 填真实版权主体、审核联系人姓名/电话/邮箱。这些由你们在 Apple 后台填写；客服邮箱不自动等于审核联系人邮箱。
3. 如实填写年龄分级问卷、内容权利和加密出口合规问卷，不预先保证某个年龄等级或无需出口材料。
4. 完成 App 隐私问卷。仅本地处理与发送至 AI 提供方要分开判断；不能直接勾选“未收集数据”。详见工程清单中的数据流核对项。[Apple 隐私定义](https://developer.apple.com/app-store/app-privacy-details/)。
5. 选择处理完成的构建，补充审核说明。保留 AI 功能时提供可供审核使用的受限测试方式，不让审核员自行购买 API 服务；凭据只放审核专用字段，不随 App 发布。
6. 选择“手动发布此版本”，点击“添加以供审核”，在提交页确认后送审。审核通过后，你们再决定上线时间；被拒时在审核沟通中针对具体问题回复并上传修复版本。

## 提交前必须全部完成

- [ ] 中国大陆供应资格及后台所需备案信息已确认。
- [ ] 隐私和支持页有真实公开网址，运营者和数据流程准确。
- [ ] MAS 沙盒构建在干净环境完成验收。
- [ ] 最终签名 PKG 上传并处理成功。
- [ ] AI 发送前同意、审核测试方式、第三方隐私声明已完成。
- [ ] 商店文案、截图、隐私问卷均与最终包一致。
- [ ] 联系人、年龄分级、内容权利、加密问卷无待填写项。

完成这些步骤才达到可提交状态。本次准备不包含账号登录、外部网页发布或 Apple 实际提交。
