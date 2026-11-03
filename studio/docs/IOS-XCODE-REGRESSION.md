# iOS Xcode 深路径回归

更新：2026-10-31。此次在此前 71 项通过之外，继续检查真实键盘、嵌套弹层、长文大字号与横屏保存。沿用手机输入保存／已有展示／手机独立功能范围；原稿 102 项只是追溯索引，不恢复 Mac 委派。仅使用隔离匿名 fixture，不使用用户私人资料或真实模型 Key。

## 当前验证状态

**最终统一回归已完成：78/78 原生、54/54 Core 通过，原生 0 失败、0 跳过，exit0；原生执行 2288.446 秒。** 日志 `.runtime/ios/edge-complete-78.log`，结果包 `.runtime/ios/UI-1793415831806.xcresult`，summary `.runtime/ios/edge-complete-78-summary.json`；`.runtime/ios/verification.json` 全部验证标记为 true，预期与实际通过均 78，源码摘要 `2e9188a10a69a5eda4330c0be7e6a78a40339000f62f2e321fbfa8c565705e0f` 与最终重算一致。原稿 102 项映射缺失为 0，仅表示保留／改造／移除均可追溯，不表示已做全部物理系统验收。

最终 summary 仍有 **13 条运行时告警：12 条 Internal QoS priority inversion、1 条 `_UIReparentingView`／Hosting 层级告警**；未见 Modifying state 告警，不能称无告警。最新源码对应的新真机包尚未签名安装，iOS 26 中文缺字与真实系统边界保留。临时模拟器及进程已清理、锁为空，用户原有模拟器保留，见 `.runtime/ios/edge-cleanup.json`。

以下保留历史批次与修复过程，不将取消结果改记为通过：

`EdgeFixed-small` 五项实际结果为 **4 通过、1 失败**：逐段冲突合并、精确选择关键句保存、纠正语音子弹层、横屏记录编辑保存及重启均已通过。其长信 AX3 当时已滚到第 18 段末尾并进入纠正页，但旧测试没有滚到懒加载输入框，所以该批次仍保留一项失败。

补齐真实滚动、输入、保存及重启 proof 后，长信完整用例已在 `.runtime/ios/EdgeAX3-final-small.xcresult` **实际通过，161.734 秒**，附件 `.runtime/ios/edge-ax3-final-small-attachments/`。Core **54 项已通过**。此前摘要 `55a385e4d5d62b9584acf28dfca8d40290a5d5be4a9ed7189005ef5f12770ff8` 的完整 76 项已由根智能体主动中断，以纳入照片发送确认的独立断言；中断不是测试失败，也不是全套通过。App 源码未因此变化，测试新增后须绑定最终新摘要。随后的 77 项也已为修复真实阅读恢复回归而主动中断；取消诊断 `.runtime/ios/edge-cancelled-diagnostic-summary.json` 的 raw result 为 `Failed`，源于 SIGINT，不记为功能断言失败或全套通过。不能把取消的 `edge-full-standard`／`edge-full-final` 当当前全套。该摘要 `9e775dadf51796027364c847ccfb1393bcbfd181b7c3af2d9e4d93a5a5417ea2` 的完整 78 项在 **58 项通过、0 断言失败**后，于 AX3 长信再次持续等待 UI 空闲超过 60 秒；根智能体已 SIGINT 中断。日志 `.runtime/ios/edge-full-78.log` 属于取消的历史批次，不是全套通过。容器修复后，SE 与标准屏连续专项均已实际 3/3 通过（见下节）。**新的完整 78 项现已通过**：日志 `.runtime/ios/edge-complete-78.log`，derived 目录 `.runtime/ios-edge-stable-derived`，冻结摘要 `2e9188a10a69a5eda4330c0be7e6a78a40339000f62f2e321fbfa8c565705e0f`；最终结果与耗时见本节首段。

此前 71 项通过是对应旧摘要的有效历史证据，不能覆盖本轮新增源码、测试或失败。最终统一结果与源码摘要见本节首段。

## AX3 在完整批次中再次重现

完整 78 项运行到 58 项通过、0 断言失败时，AX3 长信再次出现持续 UI idle 等待。`.runtime/ios/edge-letter-final-loop-sample.txt` 仍显示主线程在 `LazySubviewPlacements`、高度估算与锚点布局路径循环；根智能体中断该批次。此前去掉双向滚动锚点后的单次 AX3 成功以及阅读恢复成功都保留为对应运行的历史证据，**不能证明长文布局已稳定**。

根智能体现仅将 `MobileLetterReader`、`DocumentView` 的段落容器从 `LazyVStack` 改为 `VStack`，保留全部正文、被动位置记录、一次布局就绪恢复与原偏好键。目的是让长段落高度稳定，不再由惰性布局反复估算。此实现已在 SE 小屏与标准屏分别连续执行 AX3、实际阅读恢复及照片确认，各 3/3 通过；新的完整 78 项随后已完成 78/78；不能将两批专项无告警扩大为最终完整批次无告警或所有设备均稳定。

## 非惰性容器的两尺寸连续验证

冻结摘要 `2e9188a10a69a5eda4330c0be7e6a78a40339000f62f2e321fbfa8c565705e0f` 的 `EdgeStable-small` 与 `EdgeStable-standard` 均实际执行 3 项，分别 **3/3 通过、0 失败、0 跳过、exit0**，预期与实际数量相等。结果 `.runtime/ios/edge-stable-results.json`；两批 summary 的 `runtimeWarnings` 均为 `[]`，仅代表这两批，无需追溯改写历史告警。

小屏 AX3 用时 163.295 秒；标准屏 AX3 用时 121.404 秒，实际阅读恢复用时 40.288 秒。每批连续覆盖完整 AX3 读到末段→纠正保存与重启证明、真实阅读段落重启恢复、照片发送确认整框与真实响应。完整 78 项使用新日志 `.runtime/ios/edge-complete-78.log`，旧取消日志不能替代它。

已实际离线查看三张新截图：

| 场景 | 实际观察与边界 | 附件 |
|---|---|---|
| 小屏 AX3 末段 | 段落末尾可达，固定纠正／聊天纵排完整；正文仍有 CJK 缺字，不能据此认证中文可读。 | `.runtime/ios/edge-stable-small-attachments/9D3ACBA0-84B0-41E8-8837-CDD2EDF6143E.png` |
| 标准屏阅读恢复 | 重新启动后的 viewport 位于第 15–17 段附近，没有回标题开头；两阅读动作完整。精确恢复的段落 label 由本次真实测试断言支持，不声称恢复到每个像素。 | `.runtime/ios/edge-stable-standard-attachments/0A15BCF0-E070-4134-BCDA-6DE3053A1E0D.png` |
| 标准屏照片确认 | medium 弹层蓝色继续按钮四边完整，底部有空间；Form 内容可继续滚动，固定主操作未被遮挡。对应专项还真实点击并核验匿名结果消息。 | `.runtime/ios/edge-stable-standard-attachments/3BAA4BB0-9A8B-4262-9F20-DBAD92E6606E.png` |

## 照片发送确认的独立补验

Duo iOS 27 的 PHO-9 截图中蓝色「继续确认发送」文案可读，但按钮下沿贴近图像边缘，不能仅凭该图认证全框或底部留白。最初 `EdgePhotoFooter-small` 虽显示 `TEST SUCCEEDED`，trace 实际仅运行旧的照片选择／命名两步骤，没有执行新增 PHO-9 断言；该通过口径已明确撤回，不作为新增路径证据。

根智能体卸载自有 Runner、使用全新 derived 目录并新增独立方法 `testPhotoSendConfirmationActionFitsAndRespondsInInitialSheet` 后，`EdgePhotoFooterFresh-small.xcresult` **实际执行 1/1，通过，0 失败／跳过，7.091 秒**。trace 含新附件 `layout-photos-confirmation-action`、真实点击 PHO-9「继续确认发送」及 `onContinue` 匿名结果消息断言。此新增方法使统一原生预期数量变为 77。

已实际离线查看 `.runtime/ios/edge-photo-footer-fresh-attachments/810507B1-AE56-4C07-B898-D763D5DADA68.png`：普通小屏 medium 弹层的蓝色确认按钮四边完整、底部有留白，未贴图像底边；Form 内容仍可滚动。该小屏几何／点击证据补齐了 Duo 截图不能独立证明的边界，未消除 iOS 26 中文方框限制。

## 阅读恢复的真实重启回归

额外手工核实发现：偏好文件保存了阅读段落 `18`，但同一匿名 fixture 重新启动仍显示标题、日期及开头。证据 `.runtime/ios/edge-reading-restart-proof.json`、`.runtime/ios/edge-letter-restored-position.png`；因此「位置已落盘」不等于「界面已恢复」。

共享被动 tracker 现于首轮 viewport 与段落 geometry 就绪后，在主队列异步通知一次恢复；两阅读页在该通知中读取原有偏好并 `scrollTo(target, anchor: .top)`。目标尚未实际进入 viewport 时，初始段落不得覆盖恢复目标；仍不使用双向滚动锚点、固定延时或改写偏好 key。

新增 `testLetterRestoresTheActualVisibleParagraphAfterFreshLaunch`：真实滚到末段，记录当前 viewport 首个实际可见段落的准确 label，点击纠正使阅读页离开并持久化；同一 fixture fresh launch 后不滑动、不注入偏好，必须该准确段落实际重新出现在 viewport。该独立用例在 `.runtime/ios/EdgeReadingRestore-small.xcresult` **实际 1/1 通过，0 失败／跳过，47.115 秒**。

已实际离线查看 `.runtime/ios/edge-reading-restore-attachments/` 两张整屏图：`3FAAF681-166F-4F1C-9D6B-E72038ED8F30.png` 离开前为第 17 段部分、第 18 段及引用；`A0192B5E-CBBE-4B62-AC42-CE882B370114.png` 重启后仍为第 17／18 段及引用，没有回到开头，底部两操作可见。**这证明段落恢复，不是像素偏移精确还原**；两图中文缺字仍存在。

取消的 77 项在中断前诊断记录两条 Internal priority inversion；此前若干 Modifying-state 告警在该部分运行中未见。此结果不是完整批次无告警的证明，最终仍看 78 项结束后的报告。

## 已确认的产品问题与有界修复

| 问题与证据 | 实现修复 | 当前能证明的范围 |
|---|---|---|
| 横屏键盘下记录编辑器高度变成 0。首轮 AX 显示编辑器 `{{16,107},{635,0}}` 且已获得焦点；标题、状态、帮助文字和工具栏共同挤掉输入区域。 | 紧凑纵向尺寸收起状态／帮助说明，减小间距与工具栏竖向 padding，给正文至少 44 点高度；保存／取消增加独立标识。 | 修复后真实生产「记录→阅读→编辑」路径的横屏键盘、输入区至少 44 点及完整边界、工具与保存、恢复竖屏及重启持久化已通过。 |
| AX3 长信连续滚动后 App 主线程 CPU 接近 99%，自动化持续等待空闲；`.runtime/ios/edge-letter-main-thread-sample.txt` 约 98% 样本位于 SwiftUI `LazySubviewPlacements`、`resolveIndexAndPosition`、`makeAnchorTranslation`、`measureEstimates`。 | 长信与普通记录阅读共享 `FeatureReadingPosition.swift`：被动记录可见首段，移除双向 `.scrollPosition` 与 `.scrollTargetLayout` 自动锚点；先保留懒加载、一次恢复及原位置持久化键；再次重现后，两阅读页段落容器进一步由 `LazyVStack` 改为 `VStack`，以已知完整段落高度避免反复估算，保留所有正文、共享被动位置记录与一次布局就绪恢复。 | 此前独立 AX3 完整单项虽通过 161.734 秒，但后续完整 78 项在该路径再次 CPU／布局循环，证明单次成功不足以确认稳定修复；见下述再次重现记录。最新非惰性容器修复现已两种尺寸各 3/3 专项通过；完整 78 项现已 78/78 通过，仍保留本次 13 条运行时告警。 |
| 根复核指出 UIKit 文本视图在 SwiftUI 更新时回报文字／选区可能重入状态更新。 | `FeatureCaptureEditor.swift`、`FeaturePhotoLibrary.swift` 的 coordinator 在应用视图更新期间禁止反向回报，并仅回报真实变化的文字／选区。 | 记录本次源码修复；不能据此声称所有运行时状态告警均已消失，仍需新统一回归与实际日志。 |
| 录音权限异步返回、取消与后续识别回调存在会话竞态窗口。 | `RecordingSessionLifecycle` 为待开始／激活／停止及识别结果提供会话 token；权限等待后、定时器和回调均检查当前会话；停止后不接纳迟到结果。 | 当前有确定性生命周期用例及已编入源码的会话保护；不代替实体设备上的真实权限弹窗、来电／音频中断与麦克风验证。 |

## 与产品缺陷分开的测试修复

- 纠正的真实来源已包含原输入、语音与原因。阅读页把原因和原话分成不同 Markdown 段落，旧断言要求三项出现在同一个 `StaticText`，导致误失败；现分别真实滚到完整段落并核验，保留重启磁盘证明。
- 冲突合并保存后，旧 `firstMatch` 重新匹配背景 Now 输入框；该次实际文件已保存且冲突已清除。它不是已复现的保存丢失。
- 聊天长关键句超过 XCTest 字符串标识查询的 128 字符限制；改精确谓词查询，不缩短关键句或减少内容断言。
- 记录编辑的 fixture 包装额外提供「完成」，与产品按钮同名。横屏回归改走真实生产入口并使用明确保存／取消标识，避免把包装关闭当保存。
- 该模拟器横屏键盘 AX 曾给出纵向坐标 `{{0,0},{162,667}}`，而 App 为 `667×375`。仅在轴跨度、原点均匹配这一明确签名时归一化为底部 `{{0,213},{667,162}}`；其他情况保留原 frame。没有去掉输入、工具或按钮的整框安全边界断言。
- 长信旧的固定滚动次数不足以证明到达末段；采用有界真实快速拖动及进度截图，仍检查真实末段末尾、固定操作区与真正纠正入口。进入纠正后懒加载输入的定位失败已补真实滚动；单项完整保存与重启 proof 现已通过。

## 实际离线渲染复核

已实际查看下列三张 `XCUIScreen.main.screenshot()` 整屏截图；附件目录 `.runtime/ios/edge-fixed-small-attachments/`，对应 `manifest.json` 绑定测试名。

| 场景 | 实际观察 | 文件 |
|---|---|---|
| 横屏真实编辑及键盘 | 1334×750 横向整屏，没有旧导出图的竖向黑区／横向裁切。正文有蓝色输入光标，标题与正文、五个工具、左右完成／取消均处于键盘上方，未被键盘覆盖。 | `5956A2DB-49A6-4419-ADA7-F2179AD9AA99.png` |
| 竖屏重启 | 重启后可见横屏写入的准确 marker 与原匿名正文；这是持久化读取，非仅保留当前界面文字。 | `B6809684-C201-454C-80E6-878338D1E808.png` |
| AX3 长信末尾 | 已读到正文末尾后的原话引用与署名，底部两项操作纵排且完整显示。此处证明实际内容可滚到及操作可达，不证明中文排印可读。 | `573E130F-A20C-4211-9B1B-47141E9D88A6.png` |

## 最新 AX3 输入与中文单屏观察

已实际离线查看 AX3 新键盘截图及 `.runtime/ios/edge-chinese-visual/` 的五张 iOS 27 Duo 主显示屏 1 截图。下面仅描述捕获到的画面；静态截图不代替按钮点击或跨系统的回归结果。

| 画面 | 实际观察与边界 | 文件 |
|---|---|---|
| 小屏 AX3 纠正键盘 | 已输入的英文原话在编辑区自然大字号换行，长输入下部需要编辑区内部滚动；保存与稍后再说纵排且完整位于键盘上方。中文仍是方框，不能据此确认小屏中文可读。 | `.runtime/ios/edge-ax3-final-small-attachments/359D9980-E7E6-4BA1-82C0-B4994B647E96.png` |
| 中文对话 CHT-4 | 中文提示、助手回复、摘录提示均可读；三个摘录操作完整，底部输入、语音与发送位置可见。横向快捷回复第三项部分露出，属于横向滚动条目，不代表该截图已验证其点击。中部留白是短对话剩余区域，未见内容加载占位。 | `.runtime/ios/edge-chinese-visual/CHT-4.png` |
| 理解卡片 UND-2 | 分类、卡片标题／正文／依据、两项底部操作均完整可读；最右分类部分露出，为横向分类条。短卡片至分页点之间有较大空白，不能把这片空白当正文缺失。 | `.runtime/ios/edge-chinese-visual/UND-2.png` |
| 长信 UND-11 | 标题、日期、人物视角、正文前三段中文可读并自然换行；底部纠正与聊天完整，正文继续向下滚动。此图只覆盖开头，不替代 AX3 最后段与保存用例。 | `.runtime/ios/edge-chinese-visual/UND-11.png` |
| 纠正 UND-18 | 原理解、原因、语音入口及两项固定动作中文完整；空编辑框是未输入状态，不能据此宣称已验证输入。页脚上方说明末尾需要滚动后查看，固定按钮自身无裁切。 | `.runtime/ios/edge-chinese-visual/UND-18.png` |
| 想法 FUT-4 | 想法类型、语音、已有摘要、时间跨度、了解度与保存按钮均中文可读；输入区域为空白待输入。固定保存按钮完整，后续摘要内容仍需滚动。 | `.runtime/ios/edge-chinese-visual/FUT-4.png` |

## 最终统一批次关键截图复核

已实际离线查看 `.runtime/ios/edge-complete-78-attachments/` 的五张最终整屏图，均由本轮 manifest 绑定用例：

| 最终图 | 实际观察 | 文件 |
|---|---|---|
| 横屏编辑键盘 | 全横向画面无旧竖向黑区裁切，正文有实际蓝色光标；标题、输入、五个工具、保存与取消完整位于键盘上方。中文及系统键盘仍缺字。 | `C0646D34-C38D-40EC-89FB-B8DA89BE5ED5.png` |
| 阅读重启恢复 | 第 15–17 段附近实际重新出现在 viewport，没有回到标题开头；底部两操作完整。对应测试核验先前捕获的准确段落，而非只查偏好。 | `80A186F6-399F-45D1-94B5-F133F6AEFDF1.png` |
| 照片发送确认 | medium 弹层继续按钮完整且有底部留白；对应本轮真实点击与 onContinue 消息通过，滚动 Form 不影响固定主操作。 | `1D8762C2-7E43-4F04-8D91-D76EC6B282D7.png` |
| AX3 长信末尾 | 已到末段后的原话引用与署名，固定两操作纵排完整，未复现本轮被取消运行的 idle 阻塞。 | `E5185E88-2114-438D-AD2F-AD6C244BE89F.png` |
| AX3 纠正输入键盘 | 实际英文输入大字号换行，长文本仍需内部滚动；保存与稍后再说完整位于键盘上方，后续保存及重启 proof 已在同轮通过。 | `A35D9D19-05D5-4B5E-893B-C0E07C97369D.png` |

## 保留边界

另一智能体补充复核的中文 REC-7 图出现两个「完成」，来自 verification 包装额外按钮；它不代表已验证的真实生产编辑入口重复。上述 EdgeFixed 横屏测试经真实「记录→阅读→编辑」进入，并明确断言产品保存动作唯一，二者不能混同为新产品缺陷。

iOS 26 小屏模拟器仍有 CJK 字库缺字／方框，不能称中文全页视觉验收通过。另一 iOS 27 Duo 运行时的中文可读截图不自动替代这台小屏的实际视觉证据。AX3 内容需要真实滚动，不能称全页无需滚动。此次匿名模拟器证据不替代真实 iCloud、系统 Keychain、录音中断或新签名包的实体 iPhone 安装验收；现有验收文档的系统边界继续适用。

最终完整 78 项已完成，历史 AX3 再次循环与取消记录继续保留。两尺寸各 3/3 与最终 78/78 支持本次已测路径通过，不能扩写为所有设备均稳定或全部物理系统／中文视觉验收完成。
