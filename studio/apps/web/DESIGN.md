---
name: The Way Here
description: 纸灰与灰绿的 macOS 阅读、记录与对话桌面
colors:
  accent: "#578a83"
  accent-soft: "#e7f0ee"
  accent-ink: "#33544f"
  canvas: "#f2f3f1"
  paper: "#fbfbfa"
  surface: "#ffffff"
  surface-tinted: "#f3f6f5"
  ink: "#263440"
  ink-soft: "#4a5a63"
  muted: "#7c8a8a"
  faint: "#a6b0ad"
  line: "#e7e9e7"
  line-strong: "#d7dbd8"
  attention: "#b9874c"
  attention-soft: "#f6ecdd"
  danger: "#b6543f"
  danger-soft: "#f7e8e3"
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
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: '"PingFang SC","Helvetica Neue",-apple-system,BlinkMacSystemFont,sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  reading:
    fontFamily: '"Songti SC","Noto Serif SC",Georgia,serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.85
rounded:
  control: "8px"
  panel: "14px"
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
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
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

产品标志沿用书页与道路的轮廓，使用 accent-soft 浅灰绿底与 accent-ink 深灰绿线条，保持平面质感。侧栏、favicon 与 macOS 应用图标从同一 SVG 母版生成；菜单栏沿用系统单色模板。

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
