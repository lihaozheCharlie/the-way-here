# iOS UX 当前验收审查

本轮 Xcode 深层流程复查已发现并修复横屏输入区挤压、长文滚动循环和录音／编辑回调竞态；最终 **78/78 项原生回归通过，0 失败、0 跳过；Core 54/54 通过**，当前状态、运行警告与证据见 [Xcode 回归记录](IOS-XCODE-REGRESSION.md)。下文 71/71 属于上一轮布局快照，不能代替本轮最终验证。

上一轮布局优化验证见 [布局复核](IOS-LAYOUT-REVIEW.md)：标准屏 **71/71 原生测试通过，0 失败、0 跳过**，小屏布局 **8/8**、照片专项 **2/2**、Core **50/50**。最终源码摘要 `1c51e6302db9b84db1055614e3ee0a9cc6299c802812e36738426ed4dd85ca18`；该轮历史结果包为 `.runtime/ios/UI-1793387356711.xcresult`。该旧签名包曾安装到 iPhone，但因锁屏未完成启动验收；本轮最新源码仅完成模拟器验证，尚未签名安装到实体 iPhone。系统与视觉边界继续保留。

更新：2026-10-31。用户最新范围：**手机输入与保存、展示已有内容，以及手机能独立完成的功能；不向 Mac 委派、排队或转交任务。** 原稿 102 项为追溯编号，逐项决定见 [覆盖清单](IOS-UX-COVERAGE.md)；不得沿用旧“102 项全部完成”口径。Apple Watch 排除。

## 当前结论

范围调整已落实到源码与测试。**历史 full3：62/62 原生、50/50 Core 通过，仅对应布局优化前的 `27e886d2…` 快照。** 当前匿名原生回归已完成；P1–P4实际系统/设备及可读中文视觉边界仍未全部闭合，不能宣布全物理验收完成。保留的原生能力需要验证实际操作及持久结果；移除项只验证入口消失、无隐式任务写入，不再要求旧生成流程。

| 证据 | 实际结果及适用范围 | 当前不能据此证明 |
|---|---|---|
| 核心 `.runtime/ios-local-core-final.log` | 50/50 通过，含新 `ContentOnlySyncTests`：双向内容正常，两端旧 queue 不互传且原件保留。属于新内容同步核心快照。 | App 按钮、系统宿主、真机同步全部状态。 |
| Studio v10 `.runtime/ios-final-typecheck-v10.log`、`ios-final-all-tests-v10.log`、`ios-final-build-v10.log` | 三项 exit0；809 项=wiki24/life74/run9/server334/web286/desktop82。后续手机 Swift 调整未改这些 Node 源。 | 手机 App 的新行为或系统权限。 |
| `.runtime/ios-phone-only-records-app.log` | 全 App+Shared Swift17 immutable snapshot 类型检查 exit0，摘要与检查时源码一致；导入七项 XCTest 也独立类型检查通过。 | App 原生行为或系统能力已通过。 |
| `.runtime/ios-phone-only-owned-uitests-typecheck.log` | Understanding/Recovery/UXCompletion/RecordsSettings 四份 XCTest 独立类型检查 exit0；相关 UI/fixture 语法检查通过。 | 单独证明当前行为；实际行为证据现以本次统一full3为准。 |
| 当前原生 full3 | 62/62，0失败，exit0；1900.474秒；同轮50 Core通过。完整日志/结果/digest见本节当前结论。 | 真实系统/设备、中文视觉或102原稿全部支路均通过。 |
| Targets5 照片分组专项 | `.runtime/ios-phone-local-targets5.log`，`PhoneLocalTargets5.xcresult`：1/1 PASS，146.549秒，严格断言未弱化；真实切组/模型请求/偏好与重启盘证全部通过。 | 其它61项、真实系统或可读中文视觉已通过。 |

## 新范围专项修复与复核（2026-10-31）

| 实际专项 | 结果与精确范围 |
|---|---|
| Targets1 `.runtime/ios-phone-local-targets1.log` | PDF本机导入、四种厂商错误后本机保存/无任务、缺Key本机保存、文字持久化、真实跨空间复制链接及照片停止盘证共7项PASS；本轮其余2项失败，不能称9/9。 |
| Targets2 `.runtime/ios-phone-local-targets2.log` | 文字模型照片生成保存PASS33.078秒；Writing真实菜单→Conversation、用户作者、流式停止部分稿、全文保存和重启盘证PASS39.171秒。照片分组失败，不能称3/3。 |
| Targets3 `.runtime/ios-phone-local-targets3.log` | 修复共用缩略图尺寸后，照片流式生成/人工确认保存PASS26.159秒，文字模型不发送图片仍可生成保存PASS31.880秒。分组失败定位为测试点到medium sheet底栏遮挡区域，未修改授权值逻辑。 |
| Targets5 `.runtime/ios-phone-local-targets5.log` | 分组1/1 PASS146.549秒：两次真实原生步骤Picker切组、原始A/B线索、每组不同人物/图片/线索发送授权及恢复、实际ModelClient包隔离、原始草稿隔离、无任务写入、重启输入不选内部草稿。 |

缩略图原来的fill绘制超出调用方高度，遮住步骤与日期；共用组件现按父尺寸同时约束绘制与命中，确认页非交互封面不拦截点击。测试继续使用真实Picker，并检查启用与安全可见边界；表单开关只在整个行高于固定底栏时点击。记录器现读取实际 `httpBody` 或 `httpBodyStream`，8MB限制、原样JSON追加、记录失败显式失败；没有删去实际发送包断言，也没有注入step、构造剪贴板链接或复制生产结果充当证据。

Targets5离线附件已实际查看：`.runtime/ios/phone-local-targets5-review/0B998C7A-4C23-4592-BA44-5B9DE29563B4.png` 显示六个盘上/模型交叉check，包括packets/originals/consent隔离、capture恢复及no-task；`AF6F74B8-6477-4BF1-9E97-F6CE1D965C60.png` 显示B线索与B人物/故事，页面控件无前轮封面遮挡。成功结果只保留这两张截图，未导出录像/AX，不能声称逐帧审过该成功轮；两次步骤Picker实际点击见日志69.18/72.19秒与121.02/123.99秒。中文模拟器字形仍异常，这些布局和英文盘证不等于可读中文视觉通过。

这些是分别对应源快照的专项结果。full2曾完整56/61、5失败，Targets4曾在真实UI阶段通过后因fixture未记录请求流而缺packet盘证；失败及修复均保留在`.runtime`，不把重跑前失败擦除。当前full3现已独立完成62/62与同轮50 Core，取代这些专项作为当前匿名原生回归结论。

## 当前验收与系统边界

以下保持当前范围，不增加原稿之外的功能。S0与N1–N9对应的实际测试断言均已在同一full3通过；表中行为描述是范围与执行目标，不能把矩阵截图到达扩大为每页全部支路已验。P1–P4需要实际系统/设备证据，不能用纯投影冒充。任何后续源码变化需按新digest重验受影响检查。

### 匿名模拟器对应检查已通过

| 包 | 对应编号 | 对应范围与验证目标 | 现有测试定位；本轮状态 |
|---|---|---|---|
| S0 无委派入口 | 移除的13项；全部混合改造页面 | 记录页无待构建/构建确认/任务；无聊天/账单分析表单；无生成信/预测/人物合并/Handoff/换话题；无 Mac 心跳/版本依赖/任务通知；关闭直连、缺 Key、离线均不出现“排队/转交”。保存、失败、重启后原空间 requests 不新增。 | full3已通过：`testRetiredTaskLinksCannotExposeRemoteExecution`、`testLegacyFailedHistoryHasNoRemoteRetryActionsAfterRestart`、`testImportFormOffersOnlyPhoneExecutableActions`、`testDailyLocalReminderChoicePersistsWithoutTaskCategories`及no-task盘证；静态S0复核未发现生产新任务入口。 |
| N1 引导与空间安全 | ONB-1…6、SET-8、STA-7/8 | 本机开始/可选云/只读演示；权限跳过；切库先保草稿；坏目标回滚、身份冲突组隔离，合法新副本可选且重启恢复；缺失/坏验收 UUID fail closed；复制/改名、撤销旧删除申请/恢复已有归档只影响绑定匿名空间；手机不新建远端删除申请。 | `ActivationSafetyAcceptanceTests`；引导矩阵；空间生命周期核心。full3对应检查已通过。 |
| N2 文字与历史 | NOW-1…9、STA-1/6/9 | 原文保存/目录/草稿/恢复；离线或无模型仍能存，不提交任务；模拟失败不清原文；模型成功须人工确认；已有草稿/标题/目录重启保留；长按菜单直达正确入口。 | `MobileFlowTests`、`CapturePhotoAcceptanceTests`、`RecoveryAcceptanceTests`。full3对应检查已通过。 |
| N3 照片本机流程 | PHO-1…12、STA-5/6 | 排序/封面/人脸命名/本机相似候选/手圈；原图不改；线索与故事分离；A/B 两组不同线索/人物及发送偏好不串；仅手机实际请求含被确认材料；流式失败/停止保留当前输入、部分稿和最初原话；保存与删除重启正确。 | `CapturePhotoAcceptanceTests`、`CaptureSafetyRegressionTests`、`UXCompletionAcceptanceTests.testPhotoGroupsKeepSeparateCluesAndPhoneConsentAfterRestartWithoutTasks`、`testStoppingPhotoStreamRestoresCurrentInputAndKeepsPartialAfterRestart`。full3全部对应检查通过，含分组144.212秒、停止24.053秒、流式/确认保存23.981秒、文字模型31.542秒。 |
| N4 话题与手机对话 | CHT-1…8 | 读已有话题、按明确方向筛选、屏蔽/恢复重启；无模型可读但无新聊；有模型才新发/续聊；用户上下文标 user；停止后的部分 AI 回复可重开；摘录为独立草稿；全文角色正确；保存关键句；无 build 选项或桌面失败兜底。 | `UnderstandingAcceptanceTests` 与 `UXCompletionAcceptanceTests.testUserContextAndStoppedPartialReplyKeepTheirAuthorsAfterRestart`。full3全部对应检查通过，含真实Writing→Conversation、作者/停止/全文重启38.452秒。 |
| N5 记录/链接/搜索 | REC-1…8、SRC-1…3 | 编辑标题正文/撤销/取消/重启；移动/复制/删除/冲突保留正确版本；真实复制链接后切到 B，打开仍精确恢复 A 的原记录；搜索历史/所有匹配/无结果；缺 Key 不显示聊天。 | `RecordsSettingsAcceptanceTests`、`UXCompletionAcceptanceTests.testCopiedRecordLinkReopensOriginalSpaceAfterSwitchAndRestart`。full3全部对应检查通过，真实复制链接→切库→精确A原记录及重启19.131秒。 |
| N6 本机导入 | REC-12/15；验证 REC-13/14 入口消失 | Markdown 精确保存；文本与可提字 PDF 保留原文件且生成可读记录；位置与重启正文正确；扫描 PDF、不支持 JSON、>50MB 在写文件/任务前拒绝；只展示手机可执行格式。 | `ImportFormCompletionTests` 七项：Markdown/Text/TextPDF、ScannedPDF/UnsupportedJSON/Over50MB、OnlyPhoneExecutableActions。full3七项全部通过，含PDF真实提字、准确正文重开及拒绝前零写入/任务。 |
| N7 已有理解及原话补充 | UND-1…11/16…18、FUT-1…3/6 | 既有分类/来源/循环/时间线/转折/人生线显示开关/回信/人物/预测摘要均可读；分块/人物/纠正/想法只新增绑定原话，不改已有理解、不写任务、不称已吸收；回信无生成按钮；想法空态可输入，类型/语音/草稿/保存重启正确；已有路径、依据、不确定性和导出仍可用。 | `UnderstandingAcceptanceTests`：SectionVoice、Correction、SavedLetters、NewIdea/TurningPoint、Cards、WithoutPhoneModel 与三组 native matrix。full3对应检查已通过。 |
| N8 设置/隐私/错误/语言 | SET-1…9、STA-1/3…9 | 手机直连开关/Key 状态刷新门槛；401/403/429/503 分因并保留原话可本机存；本机提醒替代旧任务类别；中英文实时切换、兄弟弹层/根错误框与重启保留；App 锁前无内容；后台嵌套弹层遮罩；同步错误仍留本机资料；导出/最近删除/诊断准确。 | `RecoveryAcceptanceTests`、`RecordsSettingsAcceptanceTests`、`MobileFlowTests` 及核心队列/隐私/文件同步测试。full3对应检查已通过。 |
| N9 系统数据及深链 | SYS-1…6 | AppGroup 投影仅已有内容与采集；无任务/心跳统计；精确空间/路径、未读和锁门禁；分享收件与照片草稿本机保存。此包只证明 App 内路由/数据，不替代 P4。 | `CapturePhotoAcceptanceTests.testSharedPayloadCreatesPhotoDraftAndSavedSource`、`testSystemProjectionTracksUnreadLettersAndBoundRoutes`。full3对应App内路由/投影/分享收件检查已通过；不代替P4。 |

### 系统/实际设备边界

| 包 | 当前必须区分的行为 | 现有证据与尚未闭环的部分 |
|---|---|---|
| P1 可选 iCloud 内容同步 | 仅 UUID 测试资料：手机原话/附件与已有内容跨端往返、再次同步、冲突、离线恢复；unlink 保留两份原件；空间复制/删除/恢复按绑定空间。队列/控制标记不参与新范围同步。 | e9 历史实测已有双向 source；其 worker receipt 已退休。最后 combined script 未 completed，末尾 Mac 系统账户读 marker 失败，不能标整轮通过。当前需按内容同步范围收口；不再追任务、心跳、控制标记或用户账户配合。50 Core 内容同步已过不替代系统往返。 |
| P2 本机语音与权限 | 真实录音→识别→编辑/保存；暂停、系统中断/切后台/返回、取消/撤销/音频保留；麦克风与识别分别拒绝、键盘出口；真实受限照片管理返回刷新。 | fixture 语音/照片授权计数仅模拟层证据。以上真实系统行为未形成完整当前闭环；只验证设备实际支持能力，资源不可用须有可用键盘出口。 |
| P3 钥匙串与隐私验证 | 匿名 UUID Key 的保存/读取/移除与设置刷新；锁前无私密内容、真实认证失败/返回及后台预览。无需真实 provider Key 或模型计费请求。 | e9 已有匿名双向 Key 读写及两端删除后读取确认；属于该系统专项快照，不等于新 UI 门槛/移除确认全过。原 combined script 仍不可称整体 completed。 |
| P4 系统宿主与可读视觉 | 实际 Widget/Siri/控制入口、录音 Live Activity、本机通知/日记提醒、Photos/文件/URL 分享、Springboard 冷启动/锁后准确落点；中英文可读截图检查表单、遮罩与长内容。设备/OS 不支持的入口按能力隐藏。 | Photos 真实宿主保存/下次正常启动恢复已有证据；Continue 被宿主拒绝时安全保存+恢复通过，URL 分享未验。快捷菜单 warm：精确信件→已读移除→不重开已过，cold 未单独验。小组件/Siri/控件/真实录音活动/本机通知投递及当前 UI 视觉仍未齐；旧模拟器 CJK 字形异常截图不可作为视觉通过。 |

不为 P 包再向用户追加账户/硬件配合请求。已有设备、匿名环境能执行的继续验证；不能执行的精确记为未验，不能用任务兜底或投影测试替代。

## 当前统一62项实际通过索引

以下每一项均来自同一full3日志、同一冻结digest，不拼接历史专项。Core50同轮通过另见原日志。

| 测试类 | 实际通过数 |
|---|---|
| `ActivationSafetyAcceptanceTests` | 4 |
| `CapturePhotoAcceptanceTests` | 15 |
| `CaptureSafetyRegressionTests` | 2 |
| `ImportFormCompletionTests` | 7 |
| `MobileFlowTests` | 4 |
| `RecordsSettingsAcceptanceTests` | 11 |
| `RecoveryAcceptanceTests` | 3 |
| `UXCompletionAcceptanceTests` | 4 |
| `UnderstandingAcceptanceTests` | 12 |

关键磁盘/权限断言已经包含在下列四项中：复制链接19.131秒、照片分组144.212秒、照片停止24.053秒、对话作者/停止/全文重启38.452秒。更多单项方法名和时长可直接检索统一日志。

## 当前截图离线复核与视觉边界

已实际查看full3同轮附件目录`.runtime/ios/phone-local-full3-attachments`中的英文NOW-1（`BEA9B941-5058-4770-A84C-BE161FB67C9E.png`）、NOW-4（`8CD6E919-27BF-42E7-9225-E23F1E83AB96.png`）、PHO-9（`7587B5F6-E7AB-4B82-961A-3FC0A9E9A052.png`）、SYS-2（`D77E7F87-2BF0-418B-9F0E-2A77CF01DAEE.png`）及分组重启盘证（`87DFA3BD-BE75-4A5D-9379-D5327044FA17.png`）。

英文标题/主要按钮与系统说明可读；Writing工具真实位于键盘上方；最终分组截图显示所有隔离/no-task/恢复盘证。**英文也不是全页视觉通过**：NOW-1部分同步状态、资料目录，以及PHO-9部分静态label/中文资料仍是方框。即便English资源已存在（如人物标注开关），该截图的运行时展示仍不完整；不能把资源检查或语义断言通过当作所有文案实际翻译/可读。中文系统字形异常继续保留为recapture边界。此轮没有扩源修改或以此重写已完成测试结论；当前交付必须明确系统与视觉验收尚未齐全。

## 系统专项与历史快照索引

当前签名包已在全部修复后重建、strict校验，父任务记录的IPA证明与上述full3源码digest一致。这里只记构建/签名一致性，不将其记为全物理验收或公开发布已完成。

- `.runtime/system-native-acceptance/share-cua-report.json` 与同目录 exact-file proof：真实 Photos→扩展→下一次正常 App 恢复，导入来源 SHA 匹配。系统 Continue 不可用时安全恢复通过；URL 分享没有证据。不是所有 SYS-6 状态通过。
- `.runtime/system-native-acceptance/cua-shortcut-report.json`：warm 长按菜单、准确回信、已读移除及不再重开通过；cold 单独启动未验。不是当前所有 SYS-5 状态通过。
- `.runtime/ios-full-ux-final6.log`：旧范围完整 52/52、同轮36 Core，0运行器重启；digest `40d1d2df8baa27cc74399da889aab229be9e6f93327fde0361580d1e4e5c54ab`，xcresult `.runtime/ios/UI-1793365931209.xcresult`。信生成、Mac fallback 等旧断言已移除或替换，不能继承此套通过。
- `.runtime/ios-locale-final2.log`：旧增强英文两专项通过。新文案/新路由仍须当前原生及本地化检查。
- `.runtime/ux-completion-third.log`：旧照片停止专项实际 PASS 43.070秒，只证明当时该项；新组请求隔离/对话/复制链接改动不借用此通过。
- 旧 v8 807项、核心36/41/49项、桌面 adhoc preflight 与中断轮留在 `.runtime` 历史日志；当前核心以实际50项为准，Node以v10 809项为准。中断轮不计失败或通过；桌面 preflight 不是新发布、公证或原生菜单验收。

## 旧审查结论归档

此前 R1–R6 涉及激活失败回滚、验收 UUID fail closed、范围绑定、异步重验及冲突组恢复；对应修复已纳入源码与历史专项，不再逐轮复制“等待修复”文字。F1–F9 的原文/部分稿/按组线索/角色/精确链接等仍适用部分已转入 N2–N7；生成信视角、范围、附件与 Mac 能力/版本/委派项随用户新范围退休。

目前没有依据把旧 invalidPath、单向 Key 或未做 Photos 分享等历史描述继续列成当前全部阻断。当前判断只以本文件的证据边界和待验包为准；不读取私人 vault、实际模型 Key 或真实笔记，不修改其内容。
