---
name: The Way Here
description: 清新蓝白与暖珊瑚色的 macOS 阅读、记录与对话桌面
colors:
  accent: "#0a7cff"
  accent-soft: "#e6f1ff"
  accent-ink: "#08529e"
  canvas: "#f3f7fd"
  paper: "#ffffff"
  surface: "#ffffff"
  surface-tinted: "#eaf2ff"
  ink: "#16233a"
  ink-soft: "#4c5c74"
  muted: "#8493a8"
  faint: "#b4c2d6"
  sidebar: "#ffffff"
  line: "#e2eaf5"
  line-strong: "#c9d6ea"
  attention: "#f0a326"
  attention-soft: "#fef3e1"
  danger: "#c43c43"
  danger-soft: "#fff0f1"
typography:
  headline:
    fontFamily: '"PingFang SC","Helvetica Neue",-apple-system,BlinkMacSystemFont,sans-serif'
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
  title:
    fontFamily: '"PingFang SC","Helvetica Neue",-apple-system,BlinkMacSystemFont,sans-serif'
    fontSize: "17px"
    lineHeight: 1.4
  body:
    fontFamily: '"PingFang SC","Helvetica Neue",-apple-system,BlinkMacSystemFont,sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: '"PingFang SC","Helvetica Neue",-apple-system,BlinkMacSystemFont,sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  reading:
    fontFamily: '"Songti SC","Noto Serif SC",Georgia,serif'
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.85
rounded:
  control: "11px"
  panel: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  gap: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "7px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  navigation-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  keyword:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  understanding-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "18px"
  segmented-tabs:
    backgroundColor: "{colors.surface-tinted}"
    rounded: "{rounded.pill}"
    padding: "4px"
  auxiliary-panel:
    backgroundColor: "{colors.paper}"
    width: "240px"
  source-folder-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "30px"
  source-folder-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  document-outline-floating:
    backgroundColor: "{colors.paper}"
    width: "268px"
    rounded: "14px"
  document-outline-pinned:
    backgroundColor: "{colors.paper}"
    width: "244px"
  reading-body:
    typography: "{typography.reading}"
    textColor: "{colors.ink}"
---
# Design System: The Way Here

## Overview

**Creative North Star: "纸灰上的个人桌面"**

用户提供的桌面 UX 设计稿是视觉依据：纸灰画布、白色内容面与灰绿强调，组织紧凑的中文操作界面和舒展的全文阅读。本文记录已实现的桌面系统，替代旧森林绿、暖纸主题；不把旧样式注释和被覆盖的声明作为新页面依据。

主交付平台为 macOS Electron。标题栏、侧栏、中间工作区和上下文对话组成连续环境；独立阅读、深聊、偏好设置与随手记共享同一视觉语言。实际值来自 archive-theme.css、最后加载的 desktop.css 和共享控件；尺寸缩放针对桌面窗口。

**Key Characteristics:**

- 纸灰分区、白色面板、灰绿状态。
- 中文无衬线操作界面与宋体长文配对。
- 辅助栏折叠为窄轨，保留内容与草稿。
- 面板使用轻阴影，浮层使用更深阴影。
- 对话、来源和完整正文可持续访问。

## Colors

主色为克制的灰绿，中性色接近纸灰；精确值以 frontmatter 为准。

### Primary

- **accent / 灰绿**：主要动作、选择指示、光标和焦点。
- **accent-soft / 浅灰绿**：活动导航、选区与轻量上下文背景。
- **accent-ink / 深灰绿**：浅色底上的活动标签和文字链接。

### Secondary

- **attention / attention-soft**：注意、确认与搜索命中。
- **danger / danger-soft**：错误、危险操作和录音状态，必须配合明确文案。

### Neutral

- **canvas**：标题栏、侧栏与中间工作区底面；**paper**：Inspector 和辅助栏；**surface**：白色卡片、控件与编辑内容面。
- **surface-tinted**：悬停、分段选择底轨和轻分组。
- **ink / ink-soft**：标题、正文和次级说明；**muted / faint**：辅助元信息，不能承担关键操作说明或长文。
- **line / line-strong**：分栏细线与控件边界。

**The Semantic Accent Rule.** 状态不能只靠颜色；选择应同时通过文字、字重、边线或可访问状态表达。

## Typography

界面使用中文优先无衬线字体栈；阅读和正文编辑使用宋体栈。标题仍属操作界面，不沿用旧网页展示大字。

- **Headline / Title**：紧凑页面标题与区块标题；文件标题使用（19px、700），卡片标题多为（14px、600）。
- **Body / Label**：常规界面与元信息；卡片说明常用（12.5px、1.7）。
- **Reading**：正文与编辑器保持一致的宋体阅读角色；不得因进入编辑状态压缩字号。
- 快捷键使用 SF Mono / Menlo / ui-monospace，字号（11px）。随手记属于快速输入，现用无衬线（14px、1.7），不是长文编辑器。

**The Reading Continuity Rule.** 紧凑的是操作界面；完整正文保持可读，来源与生成理解始终可区分。

## Layout

主窗口采用（38px）标题栏、（220px）左侧栏、自适应正文与（326px）Inspector。Inspector 默认打开、记住显隐偏好，折叠保留（48px）轨道。标题栏预留原生交通灯，拖动区域内按钮可独立点击。中间工作区和侧栏各自滚动，页面常规内边距（26px 30px 40px）。

窗口宽度不超过（1150px）时，侧栏与 Inspector 分别为（180px / 290px）；当前后置样式仍保持上述常规页面内边距。主窗口最小宽度（760px）属于桌面约束。

来源工作区打开文件夹（272px）和文件列表（276px），单栏折叠轨为（48px），预览区域最小（300px）。没有手动覆盖时，文件夹按工作区可用宽度（940px）决定展开，来源页 Inspector 按窗口宽度（1540px）自动让位，用户仍可手动展开。完整预览保持同一工作区。两栏同时折叠时也保留各自（48px）轨道。

Questions 在页面内放置（6:4）对话和证据，间距（16px），高度受窗口约束且最小（340px）。消息和证据分别滚动；输入区保留在对话容器内。证据折叠后仅保留（48px）轨道；该页不再挂第二个 Inspector。

已有理解卡片默认两列，入口容器不超过（560px）时单列；摘要卡在窗口不超过（1150px）时单列。独立阅读和深聊不显示主侧栏。随手记为原生浮动窗口，内容最大宽度（420px），内边距（20px）；偏好设置独立组织设置分段。

## Elevation & Depth

画布与纸面先通过底色分区，白色摘要和理解卡片再使用轻柔面板阴影。常驻 Inspector 与来源内部分栏不使用浮层阴影。面板阴影为 `0 8px 24px rgba(38,52,64,.07)`；弹窗、菜单和真正浮层使用 `0 16px 40px rgba(38,52,64,.14)`。

宽度、透明度与分段指示过渡通常（200ms），缓动为 `cubic-bezier(.22,.61,.36,1)`。按钮状态过渡（150ms），按下缩放（.97）；尊重减少动态效果设置，取消动画、过渡和平滑滚动。阴影和运动的机器信息记录于 sidecar。

## Shapes

控件采用 control 圆角，卡片和弹窗使用 panel 圆角。关键词、分段底轨和开关使用 pill；消息气泡可以保持对话角色的非对称圆角，不推广为普通卡片。区域边线通常为（1px），选中文件左侧指示为（3px）。

## Components

产品标志使用用户提供的折线与橙点 SVG：极淡浅蓝底 #EAF2FF、粗蓝色折线 #0A7CFF、右上橙色圆点 #FF7A45。统一母版为 apps/desktop/assets/app-icon.svg；侧栏、浏览器和 Apple Touch 图标由同一母版生成，macOS Dock 保留透明安全区，菜单栏使用去背景的单色轮廓。

### Buttons

主按钮灰绿底白字，次按钮白面细边；图标按钮为（32px）方形。主动作通常至少（32px）高，通用按钮底线（28px）。悬停深灰绿，按下轻缩放，禁用透明度（.4）；操作必须有清楚的标签或可访问名称。

### Inputs / Fields

共享 TextInput、TextArea、SelectInput 和 SearchField 保留原生行为。搜索字段由外壳绘制唯一焦点环，内部输入不重复描边；焦点环为 `0 0 0 3px rgba(87,138,131,.16)`。强制颜色模式为文字字段保留系统 Highlight 轮廓。语音确认后插入选区；只读字段不出现可编辑语音入口。

### Navigation

一级导航为紧凑图标文字行，活动项浅灰绿底、深灰绿字与加粗，悬停浅色底。个人空间切换与搜索位于上部，随手记和设置在底部。子导航缩进，避免重新建立顶部网页主导航。

### Chips / Tags

关键词和属性是透明底细边胶囊，用次级文字；需要更多内容时使用展开入口。对话上下文 chip 保留当前文档或问题线索，折叠和切换不能隐去其真实来源。

### Cards / Containers

白色摘要卡使用（18px）内边距和面板阴影。卡片标题、两行摘要、关键词、明确的展开或阅读全文入口形成稳定层次；不要将被截断内容作为唯一访问路径。

### Segmented Tabs

浅色胶囊底轨包裹白色活动指示，按钮不换行。共享控件用测量后的宽度与横向位移驱动（200ms）滑动；提供 tablist、选中状态、方向键与 Home/End 导航。减少动态效果时直接切换状态。

### Auxiliary Panels / Inspector

共享 AuxPanel 折叠时保留挂载内容，通过 inert 和 aria-hidden 阻止隐藏内容被操作。当前/历史对话在同一实现内切换；一扇窗口只保留一个活跃对话表面。阅读大纲、证据和 Inspector 的展开宽度依角色而定，折叠轨遵循同一语言。

### Reading / Editing

阅读与编辑共用宋体正文；文件标题为无衬线，属性摘要保持轻量，保存反馈靠近标题且成功后淡出。已授权本地目录支持原地编辑，独立阅读窗口保持只读。所有文档宿主均不提供阅读 / 编辑切换按钮或占位栏；正文双击、F2 或 Enter 进入编辑。正文失焦保存并回到阅读，目录交互保留编辑状态；Escape 回到阅读且不撤销已自动保存的内容。

### Source Folder Tree / Import Destination

文件夹栏与导入第二步复用同一棵懒加载目录树。文件夹栏分“已打开的文件夹”和“知识库内”，不按材料类型伪造层级；外部根显示真实名称和缩写路径，空目录保留，文件夹图标统一。缩进通常（16px），超过六层后每层（12px）；长名称中间截断，悬停可读完整路径。选中行浅蓝底深蓝字，祖先加粗，展开图标浅蓝填充；缺失目录以错误色和“重新连接”说明状态。

树使用 roving tabindex、方向键、Home/End、Enter/空格选中、⌘⇧N 原位新建；右键、Shift+F10 或更多按钮打开同一菜单。外部根可新建子目录、Finder 显示、重新读取和从列表移除；普通子目录可重命名或移到废纸篓。移除根明确说明不会删除磁盘文件，移到废纸篓要求确认。展开偏好按知识库保存，恢复时先读取根再逐层读取当前仍存在的路径，避免旧偏好生成幽灵子项。文件列表通过可点击面包屑和“含子文件夹 / 仅此层”表达范围；“全部材料”的仅此层同样只显示知识库来源根目录的直接文件。

只有根读取完成且整棵树没有目录时，显示文件夹图标、标题“打开你放笔记的文件夹”和“打开文件夹…”按钮；有知识库内目录但没有外部连接时不显示空态。不附加灰色解释段落，也不在侧栏底部常驻拖入提示；实际目录拖入交互保持可用。

导入三种材料各自默认指向聊天记录 / 消费账单 / 照片记忆；位置树仅列知识库内目录，可原位创建多级目标，并显示完整选中路径。旧 files 类型偏好回退到 chat。

### Document Outline / Markdown Editor

共享正文最大行宽（720px）、左右边距（24px），进入编辑保持同一位置、宋体（17px / 1.85）与纸面。CodeMirror 保留纯 Markdown 源码，标题 # 标记视觉悬挂在左侧留白，代码围栏内不应用标题装饰。正文标题在阅读与编辑中使用同一宋体层级：H1（28px）、H2（21px）、H3–H6（17px），字重（500）、行高（1.5）；文件名称仍使用独立的界面标题样式。阅读目录跟随滚动，编辑目录跟随光标；点击目录定位标题行末并维持编辑焦点，⌘↑↓ 跳到上下节。

目录主层标题加粗，子层缩进（14px），长标题最多两行且 title 提供完整文字。章节达到（30）时采用主层刻度、最多（14）条，并折叠非当前主节的子项；当前章节保持可见。有关联 / 证据时在同一卡片内切换，无关联不显示切换。无足够章节且无关联时不挂载导航，也不留下空白轨。窄窗口覆盖规则属于桌面窗口缩放，不引入手机导航。

### Quick Capture / Preferences

随手记是轻量浮窗：标题、快速输入、显式保存、可用时的原生听写和反馈。草稿按知识库保存，关闭或再次打开不能静默丢失；成功保存后清除草稿。设置使用分段导航和（38×22px）开关，打开态灰绿且滑块位移。

### Today Capture / 此刻来源切换

Mode: Operate。此刻随手记沿用当前蓝白桌面语言；仅 macOS 主窗口提供“说或写 / 找照片”分段入口，切换保留草稿、筛选、结果和选择，录音时锁定切换。独立随手记仍为文字与语音入口；日历来源和移动端不在本次范围。

- **筛选与结果**：常用筛选采用两列（38px）字段，更多筛选展开为紧凑面板，折叠后保留可单独移除的条件胶囊。结果在最高（372px）的区域内滚动；缩略图负责选择，独立放大按钮负责预览。选中态同时使用蓝色边框、勾选与计数，最多（50）张；底部粘性操作条保留已选缩略图、数量、清空与整理动作。
- **确认与整理**：确认位置复用导入目录树，左侧目录、右侧摘要展示缩略图、标题、数量及真实大小。照片保存位置独立于文字草稿，并贯通确认页与实际导入。后续复用认人、讲故事与历史恢复；整理弹窗仅主体滚动，标题、进度及底部动作不被内容挤出。
- **讲故事**：线索输入与“AI 帮你写”按钮直接可见。照片画廊使用（64×52px）缩略图，默认显示前（14）张，更多照片通过明确的展开全部入口访问；保持故事输入为视觉主区。结果区滚动与外层裁切不能使已选操作条失去粘性定位。
- **恢复反馈**：未确认的构建状态锁定修改并提供重试；认人中断或失败后可继续分组、人物关联与裁剪编辑。完成后先清除恢复状态再关闭弹窗，仅清除本次完成批次的选择，保留其他已选照片。

**The Capture Density Rule.** 来源计数与已选辅助提示（11px）、条件胶囊与历史日期等元信息（12px），以及缩略图、预览按钮和操作条的局部圆角，保留指定设计稿的紧凑层次；不扩展为全局字号或圆角规则。

实现与状态边界见 `../../docs/quick-capture-sources.md`；最终审阅截图位于 `../../.impeccable/review/capture-sources/`。

### Preferences / 偏好设置设计稿落地

偏好设置以用户提供的 `preferences-redesign (1).html` 为局部视觉依据，实际结构与状态以 `Preferences.tsx`、`preferences.css` 和共享 `AgentSettings.tsx` 为准。以下约定仅适用于偏好设置，不推广到对话内的模型设置弹窗；配色沿用当前蓝白语义变量。

- **桌面布局与分组**：内容居中、最大宽度（600px），保留通用 / AI 助手分段导航。通知、快捷键与 AI 配置使用白色细边分组卡、既有卡片圆角及阴影，内边距（26px 28px），组间距（20px）。分组图标底座为（30×30px）、圆角（9px），标题为（15px、600）。通知开关为（38×22px）；快捷键使用等宽字体和圆角（8px）的浅底键帽。
- **运行方式**：Codex 与第三方模型为并排的两张紧凑选择卡，间距（12px）、内边距（16px 14px）；圆点、强调色描边与浅蓝底共同表示选择。标题旁保留状态标签，说明自然换行，不为状态或说明预留大片空白。Codex 显示读取中 / 已就绪 / 不可用；第三方显示读取中 / 待应用 / 已配置 / 待配置，依实际读取、密钥草稿与配置状态变化。“已配置”不等同于已验证连接。
- **字段与说明**：模型和思考深度保持两列，控件高度（38px）；第三方厂商和 API Key 横跨整行。Codex 的无需密钥说明、第三方连接说明和通用页本机存储说明使用浅色提示面；密钥下方保留本机保存提示，已有密钥可移除。模型与可选思考深度来自实际目录。
- **应用与反馈**：应用栏放在 AI 配置卡外、滚动区域底部粘性定位，以画布色承托全局生效说明和应用按钮。保留读取中、读取失败、未应用更改、已更新和当前设置状态；保存时按钮显示“正在应用…”，加载、保存中或无更改时禁用。读取及保存错误在卡内以明确文字和 alert 呈现，状态反馈使用 status；键盘焦点保持可见。

**The Preferences Comp Rule.** 状态标签（11.5px）、密钥与应用栏辅助提示（12px），以及图标（9px）和键帽（8px）圆角，是本次指定设计稿的局部例外。它们保留偏好设置的紧凑层次，不替代全局正文、说明字号或通用控件圆角。

### Desktop Updates / 侧栏更新（2026-10-27）

本次为既有蓝白桌面的局部交互补充。更新入口与底部偏好设置共处一行并位于其右侧，不增加全局更新横幅。偏好设置保持（13px）；更新按钮按用户提供的参考改为 40px 蓝色圆形按钮，白色云下载图标（22px），不再显示“下载”文字。两者间距（8px），更新按钮不收缩；偏好设置保持单行，空间不足时省略文字且图标不收缩。

自动检查新版；用户点击“下载 / Download”后在应用内下载，随后自动等待安全时机重启安装。侧栏下载中显示百分比（11px、600、等宽数字），忙碌时使用 accent-ink 深蓝底保证数字对比；待安装显示勾号，安装中及失败重试使用刷新图标。完整动作名称通过可访问名称提供，悬停说明补足下载、自动安装与等待状态。忙碌状态禁用动作，保留可见状态与辅助技术反馈；请求失败时恢复可见重试入口。偏好设置提供版本、更新说明、完整进度、错误及重试动作，并说明录音、保存、任务或未完成编辑会推迟安装。

此记录依据 AppUpdates、AppShell 与更新样式及中英文状态截图；验收范围为界面与状态反馈，不代表已验证真实原生应用替换。

## Do's and Don'ts

### Do:

- Do 使用灰绿说明活动位置与可执行动作，并保留文字、图标或边线线索。
- Do 对正文与编辑器使用同一阅读字号和行高，保留完整原文入口。
- Do 折叠辅助栏时保留挂载内容，避免丢失草稿、上下文和运行状态。
- Do 让对话消息与证据分别滚动，并保持输入区可见。
- Do 保留键盘焦点、可访问名称、减少动态效果以及本地目录授权边界。

### Don’t:

- Don’t 恢复森林绿实心一级导航、旧巨幅网页标题或浮动抽屉作为桌面主结构。
- Don’t 把摘要、截断预览或生成理解当成完整来源的替代品。
- Don’t 为桌面缩放引入未经要求的手机导航或另一套视觉世界。
- Don’t 把低对比辅助文字、旧样式残留或偶发布局缺陷推广为组件规则。

## 看见未来与 main 功能整合

看见未来保持四维现状、未来路径、经历依据、整体节奏和可逆行动的完整内容，加入桌面侧边栏及命令搜索；页面上下文进入常驻 Inspector，不另挂对话抽屉。Agent 回答的 Wiki 更新和执行详情默认折叠，模型设置复用全局控制器并注明续聊下一轮生效。生活记录采用类型、月份、时间排序与搜索，同时保留桌面新建记录、导入、原目录连接和可收起分栏。

## 2026-09 桌面交互更新

Mode: Operate。以本次用户提供的桌面 HTML 设计稿为此刻、值得聊聊、生活记录、已有理解总览、右侧对话和导入弹窗的交互依据；看见未来不在本次范围。

- 此刻：一句话输入后展开右侧对话；三个紧凑入口提供话题、随手记与已有理解。保留导入、近期线索与理解，后者默认折叠。
- 值得聊聊：两列卡片、真实类型筛选、每次显示四条；点击高亮并恢复该话题的历史对话。全窗口只有一个对话面板。
- 生活记录：筛选、搜索、打开文件夹、导入和新建集中到工具栏；日期与排序通过展开入口访问。打开文件夹使用原生目录选择器，关联理解与目录在同一张导航卡内切换。照片与账单记忆、批量构建、编辑和真实磁盘目录层级保留。
- 已有理解：四个分类入口各自包含计数与最近更新的真实页面摘要；循环展开与模型校准仍在可展开的摘要区内。
- Agent：每次窗口加载默认折叠，展开后保留当前对话／历史切换、模型设置、任务与审批能力。折叠不卸载组件，不丢失输入或中止任务。
- 导入：620px 弹窗，聊天记录、消费账单、照片三类材料一行排列，每类附格式说明；日记与笔记通过底部提示直达“打开文件夹”。第二步使用共享文件夹树选择知识库内保存位置，保留摘要、解析与错误处理。

最后加载的 `src/styles/desktop-redesign.css` 定义以上表面，沿用纸灰、白色、灰绿与现有字体令牌。

## 清晰纸面 · 分层阅读体系

页面底色使用 #f3f7fd，侧栏使用 #ffffff，卡片、阅读面板与弹层使用白色。背景明度差、清晰细边线与轻微投影共同建立空间层次。

主文字使用 ink；说明、摘要、操作标签与占位文字使用 ink-soft（#4c5c74）；时间戳、计数等需要阅读的元数据使用 ink-soft；muted（#8493a8）用于弱化的非必要状态；faint（#b4c2d6）仅用于装饰，不用于文字。正文、说明与占位文字须满足 4.5:1。保留深绿主按钮以保证白字对比度。

保留 PingFang SC UI 与 Songti / Noto Serif 阅读字体体系。说明文字为 13–14px，部分说明使用 450 字重，摘要和对话为 15px，长文为 17px / 1.85；紧凑标签与数字可以保留 12px。保持现有布局、工作流和清晰键盘焦点。

## 2026-09-22 配色设计稿落地

以用户提供的 desktop-color-redesign.html 为配色依据：明亮纸灰画布、白色卡片、浅描边与轻阴影共同分层。卡片阴影为 `0 1px 2px rgba(20,30,24,.05), 0 8px 22px rgba(20,30,24,.06)`，浮层为 `0 12px 32px rgba(20,30,24,.14)`；交互卡片悬停或选中使用强调色描边。accent-hover 为 #0868d6。保留现有字号、内容和布局，Agent 仍为可拖宽、记忆宽度及 Esc 关闭的悬浮窗，不恢复设计稿中的旧对话提示。

## 2026-09-22 蓝白 v2 色调规范（当前视觉依据）

按用户提供的 desktop-ux-redesign-v2.html 还原色调；此前纸灰、灰绿描述由本节取代。页面结构、文案、功能、字体和浮动 Agent 交互维持现状。

所有组件通过 `src/styles/theme-tokens.css` 消费语义变量，不在组件样式中写颜色字面量。画布 #f3f7fd，白色侧边栏和卡片，正文 #16233a，次级文字 #4c5c74，分隔线 #e2eaf5。#0a7cff 用于主操作及实心导航选中，hover 为 #0868d6，文字链接可用 #08529e。珊瑚色 #ff7a45、浅底 #fff0e8、文字 #c65021 用于书信、关系和陪伴标识。成功绿 #16a870 与关注黄 #f0a326 仅表达状态，错误单独使用 danger；状态保留文字说明。读数分类允许使用集中定义的紫色分类变量。

卡片圆角 18px，紧凑卡片 12px，控件 11px；阴影与设计稿一致，卡片 `0 1px 2px rgb(22 46 84 / 4%), 0 14px 34px rgb(22 46 84 / 7%)`，浮层 `0 18px 44px rgb(22 46 84 / 16%)`。首页介绍卡采用浅蓝至白渐变。提示、代码阅读和独立窗口使用明亮表面，不使用近黑背景。

新增或修改样式必须使用语义变量；构建时的 design contract 阻止组件重新引入硬编码色值。原生窗口启动底色与画布保持一致。

### 此刻陪伴卡

顶部介绍卡按用户截图采用浅蓝渐变、白色爱心标签“长期陪伴 · 已相处 N 天”、标题“有什么，都可以聊聊”及原样说明文案。N 由服务端保留的当前空间首次交互时间按本地自然日计算（首日为 1），不使用示例中的固定 128。首页下方生活记录输入保持原有功能。

### 产品图标 · 蓝色折线与橙点

图标以用户提供的 app-icon (5).svg 为准，保留浅蓝圆角底、蓝色折线和右上橙点的颜色、路径及比例，不增加渐变或阴影。图标背景固定使用原稿 #EAF2FF。`apps/desktop/assets/app-icon.svg` 是唯一母版；构建同步生成网页与桌面 favicon.svg、包含 16/32/48px 帧的 favicon.ico、Apple Touch、Dock 和菜单栏模板。菜单栏去掉背景，从图形实际边界裁切后生成单色轮廓。

### 偏好设置与侧栏精简

侧栏底部仅保留偏好设置入口，去除随手记和本机知识库状态文字。偏好设置只保留通用 / AI 助手；通用按通知与快捷键分组，AI 助手沿用全局模型配置、应用与错误反馈。移除没有功能消费者的对话提示和每日话头开关。设置页面使用独立作用域样式，避免通用按钮规则覆盖模型选择和保存操作。值得聊聊页导入标签使用 10px 间距、6px × 12px 内边距，并与正文保持 12px 间距。

主窗口左侧导航始终展开，不提供标题栏收缩按钮。偏好设置和独立阅读窗口继续使用各自的无侧栏布局。

### Shared document continuity

Markdown reading, editing, embedded previews, immutable versions and detached readers share `DocumentFrame` and `document.css`. The content column owns its 720px maximum text measure and 24px gutters; document identity, metadata and body align to that column. Body reading and editing use the same 17px/1.85 serif typography, color and padding. Business pages must not override prose geometry or fonts.

Editable documents have no reading/editing switch or reserved mode toolbar. Save feedback appears only while saving, after saving, or on errors. Double-click and F2/Enter enter editing; blur saves and returns to reading, except outline interactions preserve editing, and Escape returns to reading without reverting autosaved changes. Source block positions restore the corresponding paragraph instead of reusing a scroll pixel offset. Reading and editing headings share H1 28px, H2 21px, H3–H6 17px, weight 500 and line-height 1.5. Plain Markdown syntax and images can still differ in height between modes.

The shared document navigation owns outline and optional evidence/relations. Its default tick rail occupies zero layout width; hover or keyboard focus opens a 268px floating card (14px corners, 140ms opacity/translation). Explicit pinning reserves a 244px sidebar and persists the preference. Below 980px of window width the rail opens by activation, the card overlays the text, selection closes it, and pinning is disabled. Read-only contexts share the paper and navigation, show the reason, and acquire no edit or save action.

## 2026-10-10 生活记录新版（当前页面依据）

Mode: Operate。以 `source-tree-and-document-outline (2).html` 为生活记录的当前视觉和交互依据，取代此前该页 272/276px、零宽默认目录轨和显式阅读/编辑切换的说明。其他文档宿主保持已有行为。

- 生活记录沿用全应用的白色窗口标题栏与主侧栏、蓝色选中导航，不随路由修改全局背景、侧栏宽度或导航尺寸；页面工具栏为全部、笔记、AI 对话、照片、账单、待构建，随后是最大 340px 搜索和右侧蓝色导入按钮。导入按钮直接打开导入窗口，在窗口内选择聊天记录、消费账单或照片，不再弹出中间菜单。三类材料区与下方打开文件夹提示保持 16px 间距，提示仅保留标题和操作按钮。
- 单个 12px 圆角容器内，文件夹 216px、文件列表 252px，两栏收起均为 40px 竖排入口。栏头 44px，列表行只含文件名和一行摘要；更多按钮在悬停、键盘焦点或打开菜单时出现。
- 目录默认只显示当前层文件，全部材料显示全部后代。“含子文件夹”保留在筛选与排序菜单中；选择目录重置月份。新建操作必须有实际选中目录。打开原目录后选中新根；根移除只断开连接。
- 正文顶部为可持续看到的路径与状态栏。正文标题 24px UI 字体，正文 16px/1.85 宋体，H2 为 20px、H3 为 16.5px。默认阅读，双击编辑、Esc 完成，不显示阅读/编辑按钮；保存反馈集中到状态栏。
- 小标题使用同一个组件，默认 150px 文本目录，收起为 28px 短刻度，悬停/聚焦展开 184px 浮卡。当前章节强调，子层缩进 12px。展开偏好和其他文档的固定目录偏好分开。没有二级或更深标题时不占位，编辑时才提示输入 `##`；一个小标题也可导航。目录定位必须避开 44px 栏头并额外留 24px。
- 阅读区域在宽屏居中，正文与小标题导航相隔 16px，不把导航固定到最右边。正文通常最大 500px，预览可用宽度达到 1000px 时最大 680px，收起左侧分栏后利用回收空间。来源预览不显示额外的目录/关联切换面板；关联结果恢复为来源正文下方的可展开/收起卡片，包含相关日记及知识页面，支持跳转与返回上下文。所有文档宿主不再显示只读徽标或目录只读标签，编辑权限和历史版本选择保持原样。既有属性、照片/账单记忆、任务与错误提示仍然可用。品牌图标沿用独立确认过的母版。首次使用和各层空态均有独立处理，不复制设计稿演示数据或假操作提示。

细项及验证边界见 `../../docs/source-tree-and-outline-checklist.md`。
