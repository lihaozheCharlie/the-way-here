# The Way Here 简体中文商店材料

方案：macOS、首版免费、中国大陆。以下文案按现有功能编写；如果商店版缩减功能，必须同步删除对应表述。AI 目前需要用户自行配置模型服务，不包含免费模型额度。

## 基础字段

| 字段 | 建议内容 |
| --- | --- |
| 名称 | The Way Here |
| 副标题 | 记录生活，慢慢理解自己 |
| 推广文本 | 把日记、照片和对话中的生活线索放在一起。记录此刻，回看一路走来的变化，让新的理解仍然能找到当时的来源。 |
| 关键词 | 日记,生活记录,个人知识库,笔记,回忆,照片,人生轨迹,自我成长,Markdown |
| 主分类 | 生活 Lifestyle，与当前打包分类一致 |
| 价格 | 免费 |
| 客服邮箱 | 644730894@qq.com |
| 支持 URL | 待发布 site/support.html 后填入真实 HTTPS 地址 |
| 隐私政策 URL | 待发布 site/privacy.html 后填入真实 HTTPS 地址 |
| 版权 | 2026 LiHaozhe（已由用户确认） |

## 描述

The Way Here 是一款在 Mac 上记录生活、整理个人知识的应用。

有些事情，当时只是一段日记、一张照片或一次对话。把它们留下来，再慢慢回看，你会更容易看见自己的变化，以及那些反复出现的重要线索。

记录此刻
用随手记留下正在发生的事，也可以通过系统语音识别转成文字，编辑确认后保存。菜单栏入口和快捷键让记录更顺手。

把资料放在一起
连接已有的日记与笔记文件夹，导入支持的聊天记录、照片或消费账单，按文件夹和时间浏览、搜索生活记录。

回看一路走来的变化
通过已有理解、人生轨迹、近况回信和人物关系等栏目查看整理结果，并沿着来源引用回到原始记录。

选择适合你的 AI 助手
配置支持的模型服务后，可以围绕记录继续对话、整理线索，辅助更新个人知识库。AI 生成内容可能不准确，请结合原始资料核对。

资料由你管理
记录与知识库保存在本机。使用外部 AI 服务时，任务所需的内容可能发送给所选服务商；服务商及发送范围请查看应用内说明和隐私政策。

无需配置 AI 即可浏览和搜索已有资料；随手记的 AI 整理保存需要配置模型服务。AI 功能需要另行配置受支持的模型服务，服务可用性和费用由对应服务商决定，免费下载不包含模型调用额度。首次打开可先浏览匿名演示空间，再创建自己的知识库。

支持与反馈：644730894@qq.com

## 截图顺序

采用 1440 × 900 PNG，五张准备素材由 `pnpm appstore:assets` 生成。Apple 也接受 1280 × 800、2560 × 1600、2880 × 1800 的 Mac 截图。[官方尺寸](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)。

| 文件 | 页面 | 展示重点 |
| --- | --- | --- |
| 01-today.png | 此刻 | 日常入口和最近线索 |
| 02-records.png | 生活记录 | 文件夹、原始记录和阅读 |
| 03-understanding.png | 已有理解 | 从生活记录形成的理解 |
| 04-timeline.png | 人生轨迹 | 阶段和转折 |
| 05-letters.png | 近况回信 | 阅读与回顾 |

截图只使用匿名演示资料。生成后逐张检查，不能出现真实姓名、邮箱、密钥、本机路径、调试面板、错误提示或测试注入文字。最终提交前用商店版本复核；图标 PNG 是品牌母图参考，最终 macOS 图标随应用构建上传。

## 审核说明草稿

以下内容按最终商店包修订后使用。**必须先填好 AI 测试方式，删除未实现的声明。**

The Way Here is a macOS application for personal journaling and knowledge organization. The application opens an anonymous demonstration library on first launch. Reviewers can browse the demo, search records, and create a separate personal library without creating an app account.

Suggested review steps:
1. Launch the app and explore the demonstration library.
2. Open the life records section and read a record.
3. Use the capture entry to create and save a note in a personal library.
4. Explore the knowledge overview, timeline, and letters sections. Existing demonstration content is sample content, not content generated during review.
5. Connect a test folder using the native folder picker, then relaunch the app and verify access to that folder.
6. If testing voice input, start recording explicitly and grant microphone and speech recognition permissions. Review the recognized text before saving.

AI features are optional and use a separately configured model service. Downloading the app does not include model service credits. A review-only testing method for all retained AI features is provided below.

【待填写：最终 AI 测试步骤、服务提供方、可用的受限测试凭据及有效期；在 App Store Connect 的审核专用字段提供，不写入公开描述或代码仓库。】

Support contact: 644730894@qq.com.

## 尚需后台确认

名称是否可用、最终 Bundle ID、版本及构建号、版权人、审核联系人、公开网页地址、中国大陆所需备案、年龄等级和加密声明。不得用占位符送审。
