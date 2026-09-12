---
name: The Way Here
description: 暖纸与森林绿的 macOS 个人知识桌面
colors:
  forest: "#3f5b4e"
  paper: "#fbfaf8"
  panel: "#f3f1ec"
  sidebar: "#efede7"
  raised: "#ffffff"
  ink: "#221f1b"
  muted: "#6b6862"
  faint: "#77736c"
  line: "#dedad1"
  line-strong: "#c9c4b8"
  forest-tint: "#e1e9e2"
  attention: "#a45c26"
  attention-soft: "#f6e4d2"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "17px"
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "12px"
rounded:
  small-control: "5px"
  control: "6px"
  navigation: "7px"
  card: "10px"
  dialog: "12px"
spacing:
  xs: "6px"
  sm: "8px"
  gap: "12px"
  md: "16px"
  card: "18px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.raised}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  navigation-active:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.raised}"
    rounded: "{rounded.navigation}"
    padding: "7px 9px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px"
  keyword:
    backgroundColor: "{colors.forest-tint}"
    textColor: "{colors.forest}"
    rounded: "{rounded.dialog}"
    padding: "4px 9px"
  understanding-card:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.card}"
    padding: "18px"
---

# Design System: The Way Here

## Overview

**Creative North Star:「暖纸上的个人知识桌面」**

当前世界来自用户明确指定的 Mac 桌面设计稿，并以已实现页面为准。体验模式为 **Operate**：熟悉的窗口结构、紧凑中文信息密度和始终可达的操作，让阅读、整理、追溯与对话在同一工作环境中连续发生。暖纸内容区与森林绿导航建立安静而清晰的层次。

主交付平台为 macOS Electron。浏览器入口用于开发与兼容，不构成另一套视觉产品。产品的长期陪伴承诺通过保留上下文、真实证据和可纠正的理解表达；不使用夸大的展示标题或装饰来代替内容。

实现依据为 `src/styles/desktop.css`、`src/app/AppShell.tsx` 和 `src/features/desktop/`。`desktop.css` 在入口最后加载，负责统一桌面主题；既有样式仍提供各功能的布局与交互。后续变更沿此分工维护，旧样式中残留的品牌值不构成新页面的设计依据。本文刷新替代先前的顶部导航、青绿档案和桌面 Web 视觉方向。

**Key Characteristics:**

- 暖纸画布、白色内容面、森林绿活动导航。
- 标题栏、左侧栏目、中间内容、右侧常驻 Inspector。
- macOS 系统字体，紧凑正文与清晰元信息。
- 普通内容扁平，真正浮层才使用阴影。
- 完整阅读、编辑、来源与任务能力持续可达。

## Colors

主色为沉稳森林绿，中性色带暖纸质感。精确值以 frontmatter 为准，保持与桌面 CSS 对应。

### Primary

- **森林绿 / forest**：活动一级导航、桌面主要动作、链接强调与键盘焦点。
- **浅森林 / forest-tint**：二级导航选中、关键词、图标按钮悬停和轻量上下文状态。

### Secondary

- **暖棕 / attention** 与 **浅暖棕 / attention-soft**：需要注意或确认的局部状态；错误和录音保留各自语义色，不推广为品牌主色。

### Neutral

- **暖纸 / paper**：主内容区与应用底色。
- **浅纸 / panel**：Inspector、偏好设置分段底面和次级面。
- **侧栏纸 / sidebar**：固定导航区域。
- **白纸 / raised**：内容卡片、输入与回复面。
- **深墨 / ink**：正文和标题；**次级墨 / muted**、**弱墨 / faint**：说明、时间与辅助信息。
- **纸边 / line**、**强纸边 / line-strong**：区域分隔与控件边界。

**The Semantic Accent Rule.** 用强调色说明当前位置或可执行动作；状态必须同时提供文字、图标或位置线索。

## Typography

界面、标题与正文统一使用 frontmatter 中的 macOS 系统字体栈，中文优先回退到 PingFang SC。无需加载展示字体。桌面标题不再沿用旧档案主题的巨大衬线层级。

- **Headline**：页面标题，使用已定义的紧凑主标题角色。
- **Title**：区块标题；桌面卡片中的标题通常收紧到（14–15px）。
- **Body**：界面常规正文；卡片说明与 Inspector 正文多使用（12px），较长说明行高（1.7）。
- **Label**：按钮和辅助信息；日期、关键词、快捷键提示可降到（11px），不可承担长篇阅读。
- 标题栏文字为（12px、600），Inspector 标题为（13px、600）。

**The Reading Continuity Rule.** 紧凑的是操作界面，完整正文仍需可读；省略内容可通过悬停、键盘聚焦或进入完整阅读恢复，不用摘要替代原文。

## Layout

窗口占满视口，采用（44px）标题栏、（206px）左侧栏、自适应中间内容与（326px）常驻 Inspector。标题栏为原生窗口拖动区，按钮不参与拖动；原生交通灯预留空间与浏览器兼容入口有区别。侧栏和 Inspector 可由用户显隐，Inspector 显隐状态保留。常驻表示默认占据布局列，不覆盖内容；不再使用右下角浮动入口作为桌面主导航。

中间工作区独立滚动，默认页面内边距为（26px 28px 48px），不再套用居中的网页最大宽度。侧栏可独立滚动，Inspector 管理自身对话滚动；不要让文档正文出现重复滚动视口。

已有理解默认两列卡片，间距（12px）；当其**内容容器**宽度不超过（560px）时改为一列，卡片最小高度从（150px）收紧为（110px）。依据可用正文宽度决定列数，避免常驻两侧栏挤出极窄卡片。

较小桌面窗口（1150px 及以下）使用（180px）侧栏、（290px）Inspector 和（22px 20px 40px）内容边距；问题与关系区域按已实现规则改为一列。来源页保留文件夹、文件列表、完整预览结构，较小窗口将预览移至下一行。主窗口实现最小宽度为（760px）；这些规则用于桌面窗口缩放，不表示交付手机版。

偏好设置与随手记采用不带侧栏的独立工具窗口，正文最大宽度分别为（760px）与（640px）；随手记工具窗口保留较小窗口规则。独立阅读和深聊使用专用窗口布局，继续共享字体、纸色和操作样式。

## Elevation & Depth

普通内容通过暖纸、浅纸、白纸和单像素边界分层。卡片、来源面板和常驻 Inspector 不采用悬浮阴影；Inspector 没有遮罩、圆角外壳或入场滑动。

命令面板与语音确认使用真实浮层阴影 `0 24px 64px rgba(30,26,20,.25)`，遮罩为 `rgba(34,31,27,.2)`。标题栏保留轻微纵向纸色渐变，不能据此扩展玻璃或炫光材质。

已有控件的短时状态过渡继续复用；桌面主题不新增展示性入场动效。尊重 `prefers-reduced-motion`，禁用动画、过渡和平滑滚动。

## Shapes

控件采用小圆角，导航采用稍柔和的矩形，白纸内容卡片采用 card 圆角；具体尺寸以 frontmatter 为准。关键词可为小胶囊，语音入口和发送控件沿用圆形。圆形或胶囊用于明确的控件角色，不推广为所有容器外形。

命令面板与语音弹窗采用 dialog 圆角。照片记忆仍保留自己的既有尺寸体系与交互结构，不因桌面壳替换而批量改成全局卡片。

## Components

### Navigation

一级栏目为左侧纵向行：图标、标签与必要的状态徽标同列。活动项使用森林绿实心底和白字，悬停使用暖灰面；子导航缩进，活动项使用浅森林底和森林绿文字。个人空间切换位于顶部，搜索、随手记与偏好设置位于底部。不得恢复旧版顶部横向导航和底部青绿指示线。

### Buttons

桌面主要按钮使用森林绿，次要按钮使用白纸面和细边界；小图标按钮为（28px）方形，透明底，悬停或选中时使用浅森林面。全局可见键盘焦点为森林绿（2px）外轮廓、偏移（3px）。禁用按钮降低透明度并取消可操作光标。保留现有对话发送／停止控件的专用行为，不将每个功能按钮强行替换成同一形状。

### Inputs / Fields

普通输入使用白纸、细边界和小圆角。单行、多行与下拉继续复用共享表单控件，搜索继续使用共享 SearchField，保留原生标签、提交与 ref 行为。字段聚焦由 `form-controls.css` 管理，以边界和内描边表达；带图标或发送按钮的输入外壳是唯一焦点所有者，内部输入不叠加第二个方框。高对比模式保留系统色焦点。

### Chips

关键词使用浅森林底与森林绿文字、紧凑横向内边距。状态徽标必须附带可理解的标签或上下文；不把来源证据状态简化为颜色点。

### Cards / Containers

今日内容、问题和已有理解以白纸卡片承载，细边界、低阴影和统一间距保持密度。已有理解卡片内边距采用 card spacing，说明保持紧凑；列数遵守内容容器规则。连续来源、任务与文档目录继续使用列表，不为了视觉统一转换为卡片墙。

### Inspector

右侧 AI Inspector 复用现有上下文 Agent 能力，保留当前个人空间和页面、上下文附加、新话题、历史线程、运行详情与输入。建议纵向排列；用户消息为森林绿白字，回复为带边界的白纸面。运行中发送位替换为停止位，保留补充说明、失败重试和验证阶段限制。实际修改、验证结果及必要确认持续可见。

### Desktop Utilities

命令面板使用顶部输入、键盘可选结果和底部快捷键说明；选中结果以浅森林底表达。偏好设置使用分段标签和有分隔线的设置行。随手记保持标题、正文和底部动作。语音先显示可编辑转写并确认，再进入后续动作，不用录音状态替代明确确认。

### Reading, Evidence & Import

桌面迁移保留双击编辑、自动保存、完整阅读、大纲与证据关联；来源原文仍按现有权限只读。回信多个版本时才显示来源标注的版本切换，原文与生成对话可追溯。内容切换不能重置已提交的编辑或运行上下文。

导入继续保留类型与材料、位置确认两步流程，以及照片认人／讲故事、账单线索确认与构建能力。记忆弹窗保持已有关闭、Escape、焦点返回、草稿恢复和运行状态；人物浮卡、照片组叙述与账单证据不因视觉迁移被省略。用户确认内容和原话继续保留，不将消费推断显示成已确认经历。

任务进度、失败、变更与验证保留原有入口。多知识库切换继续清楚标明空间，不以静态设计稿内容替代真实记录；所有运行沿用绑定知识库的上下文。

## Do's and Don'ts

### Do:

- **Do** 使用最后加载的桌面主题统一颜色、字体和外壳，复用现有功能布局。
- **Do** 以真实知识库内容验收今日、已有理解、来源、Inspector 和偏好设置。
- **Do** 同时检查常规与较小 Mac 窗口，特别确认已有理解在窄内容区切为单列。
- **Do** 保留键盘导航、可见焦点、完整文本恢复、原文、编辑与任务状态。
- **Do** 将视觉变更与功能验证结合，运行设计检查、类型检查、测试和生产构建。

### Don't:

- **Don't** 恢复旧版大衬线标题、顶部网页导航或已废弃的档案品牌色。
- **Don't** 把常驻 Inspector 改回遮挡内容的桌面主抽屉。
- **Don't** 为普通卡片增加大阴影、玻璃模糊、强位移或独立品牌 token。
- **Don't** 将桌面缩窗规则扩展为手机、平板或触控交付承诺。
- **Don't** 为匹配设计稿移除原有编辑、来源、导入、照片、账单、任务和多知识库能力。

## 产品标志：书页成路

Web 与 macOS 使用同一枚书页与弧线路径标志。唯一矢量母版为 `apps/desktop/assets/app-icon.svg`，保留设计稿的路径与比例；封面采用浅色修订稿的奶油纸面渐变 `#fdf7ea → #f3e4bf → #e9d3a6`，线条为深咖色 `#4a3826`，边缘高光为 70% 白色。浅色应用图标在深浅桌面背景下均保持轻盈；菜单栏继续使用系统单色模板。这组颜色仅用于品牌图标，不替换界面状态色。

`scripts/build-brand-assets.mjs` 从母版生成侧栏标志、SVG/ICO favicon、Apple Touch 图标、macOS 多尺寸图标和菜单栏模板图。小尺寸加粗描边；macOS 图标保留外侧透明留白，菜单栏使用透明底单色 1×/2× 模板，由系统适配明暗。Web 开发与构建、Mac 原生构建均自动生成资源，无需手工同步。
