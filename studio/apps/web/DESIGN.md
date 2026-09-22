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

来源工作区打开文件夹（240px）和文件列表（280px），单栏折叠轨为（48px），预览保留至少（360px）。没有手动覆盖时，文件夹按工作区可用宽度（940px）决定展开，来源页 Inspector 按窗口宽度（1540px）自动让位，用户仍可手动展开。完整预览保持同一工作区。两栏同时折叠时也保留各自（48px）轨道。

Questions 在页面内放置（6:4）对话和证据，间距（16px），高度受窗口约束且最小（340px）。消息和证据分别滚动；输入区保留在对话容器内。证据折叠后仅保留（48px）轨道；该页不再挂第二个 Inspector。

已有理解卡片默认两列，入口容器不超过（560px）时单列；摘要卡在窗口不超过（1150px）时单列。独立阅读和深聊不显示主侧栏。随手记为原生浮动窗口，内容最大宽度（420px），内边距（20px）；偏好设置独立组织设置分段。

## Elevation & Depth

画布与纸面先通过底色分区，白色摘要和理解卡片再使用轻柔面板阴影。常驻 Inspector 与来源内部分栏不使用浮层阴影。面板阴影为 `0 8px 24px rgba(38,52,64,.07)`；弹窗、菜单和真正浮层使用 `0 16px 40px rgba(38,52,64,.14)`。

宽度、透明度与分段指示过渡通常（200ms），缓动为 `cubic-bezier(.22,.61,.36,1)`。按钮状态过渡（150ms），按下缩放（.97）；尊重减少动态效果设置，取消动画、过渡和平滑滚动。阴影和运动的机器信息记录于 sidecar。

## Shapes

控件采用 control 圆角，卡片和弹窗使用 panel 圆角。关键词、分段底轨和开关使用 pill；消息气泡可以保持对话角色的非对称圆角，不推广为普通卡片。区域边线通常为（1px），选中文件左侧指示为（3px）。

## Components

产品标志使用用户提供的柔和罗盘圆环 SVG：极淡浅蓝底 #EAF2FF、粗蓝色开口圆环 #0A7CFF、开口处橙色圆点 #FF7A45，像“指向此刻”的指针。统一母版为 apps/desktop/assets/app-icon.svg；侧栏、浏览器和 Apple Touch 图标由同一母版生成，macOS Dock 保留透明安全区，菜单栏使用去背景的单色圆环与圆点。

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

阅读与编辑共用宋体正文；文件标题为无衬线，属性摘要保持轻量，保存反馈靠近标题且成功后淡出。外部连接来源与独立阅读保持只读，不能以视觉统一为由放开修改权限。

### Quick Capture / Preferences

随手记是轻量浮窗：标题、快速输入、显式保存、可用时的原生听写和反馈。草稿按知识库保存，关闭或再次打开不能静默丢失；成功保存后清除草稿。设置使用分段导航和（38×22px）开关，打开态灰绿且滑块位移。

## Do's and Don'ts

### Do:

- Do 使用灰绿说明活动位置与可执行动作，并保留文字、图标或边线线索。
- Do 对正文与编辑器使用同一阅读字号和行高，保留完整原文入口。
- Do 折叠辅助栏时保留挂载内容，避免丢失草稿、上下文和运行状态。
- Do 让对话消息与证据分别滚动，并保持输入区可见。
- Do 保留键盘焦点、可访问名称、减少动态效果以及外部来源只读边界。

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
- 生活记录：筛选、搜索、目录连接、导入和新建集中到工具栏；日期与排序通过展开入口访问。目录连接为浮层，全文后的关联理解默认折叠。照片与账单记忆、批量构建、编辑和原目录只读约束保留。
- 已有理解：四个分类入口各自包含计数与最近更新的真实页面摘要；循环展开与模型校准仍在可展开的摘要区内。
- Agent：每次窗口加载默认折叠，展开后保留当前对话／历史切换、模型设置、任务与审批能力。折叠不卸载组件，不丢失输入或中止任务。
- 导入：620px 弹窗，四类材料两列排列，默认显示材料选择与拖放；连接原目录为附加选项。第二步确认文件夹和摘要，保留照片、账单、聊天平台解析及错误处理。

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

### 产品图标 · 柔和罗盘圆环

图标以用户提供的 concept-3-soft-compass-ring.svg 为准，保留原稿颜色、圆角、线宽与位置，不增加渐变或阴影。浅蓝背景承担 accent-soft 的视觉角色，图标本身固定使用原稿 #EAF2FF。`apps/desktop/assets/app-icon.svg` 是唯一母版；构建同步生成网页与桌面 favicon.svg、包含 16/32/48px 帧的 favicon.ico、Apple Touch、Dock 和菜单栏模板。菜单栏去掉背景，以单色保留圆环和指向此刻的圆点。

### 偏好设置与侧栏精简

侧栏底部仅保留偏好设置入口，去除随手记和本机知识库状态文字。偏好设置只保留通用 / AI 助手；通用按通知与快捷键分组，AI 助手沿用全局模型配置、应用与错误反馈。移除没有功能消费者的对话提示和每日话头开关。设置页面使用独立作用域样式，避免通用按钮规则覆盖模型选择和保存操作。值得聊聊页导入标签使用 10px 间距、6px × 12px 内边距，并与正文保持 12px 间距。

主窗口左侧导航始终展开，不提供标题栏收缩按钮。偏好设置和独立阅读窗口继续使用各自的无侧栏布局。
