# 梦境阶段协议

每次只返回一个 JSON 对象，字段遵守当前阶段契约。证据统一为 `{pageId, line, quote}`。使用读取工具返回的 pageId、1 起始正文所在行号、该行的连续原文。核验对象为 `{text, verdict, evidence: Citation[]}`，verdict 取 supported、partial、contradicted、unknown。除 unknown 外，核验结论必须有引文。

各阶段可用 `read_knowledge_evidence` 的全部动作检索绑定证据：overview、search、read、neighbors，另有 chronology（按日期排列的记录时间线，用于锚定节点节奏）和 person（某人按时间排列的提及与原话，用于人物连贯）。

## ground

`{facts: [{text, knownBy, evidence: Citation[]}]}`。最多八条。text 是单行事实摘要，最长 280 字，不带链接。knownBy 为 YYYY-MM-DD，须不晚于入梦区间下界。每条至少有一条原始来源引文。同期日记若明确写出某个条件当时已经成立，可引同日记录。用后来的原始自述时，引文必须明确支持入梦前该条件已成立。原文允许同时提到结果，但摘要只写当时已经知道的内容。找不到可追溯原话时返回空列表。

## plan

`{title, decision, storyBible: [{aspect, text}], branches: [{id, title, intervention, divergence, checks: [{id, question, when?}]}], branchLimitReason?}`。最外层 title 只写「我」开头的单个备选动作，例如「我没有离开那座城市」或「我选择了继续读书」。写完动作就停，省略年月、如果、标点、分支和结果。多个分支的动作不同时，写它们共同改变的原选择。decision 用一两句交代回到哪个选择、改变什么。

storyBible 固定所有分支共享的起点设定，三至八条 `{aspect, text}`：aspect 用短标签（如 住处、身边的人、钱、在忙的事、最紧的约束），text 一两句写从证据确认或合理推出的内容。它会被注入后续证据，各分支沿用，不重写。

默认规划两条备选，第三条须有实质不同的选择。实质不同的标准：一年后的日常生活画面能一眼区分。少于两条时必填 branchLimitReason，说明哪个具体约束使其余选择无法提出。只给能改变走向的缺口安排检查，可以为空，最多四项。标识用小写字母开头，可含数字和连字符，最长 32 字符。检查按数组顺序执行。可选 when 为 `{checkId, verdict}`，指定同一分支的较早检查及其必须达到的结论。不满足时只跳过该项检查，仍须进入 organize。分支标题建议 20 字内，intervention 一句写明最早偏离现实的行动或假设；divergence 一两句写清与现实分岔的第一件事和它牵动的日常（钱、时间、人、地点），让分岔在生活里可见。

## verify 与 enrich

返回单个核验对象。verify 的 text 写本分支起点、可行性和证据缺口；enrich 只回答本次 question。text 最长 1000 字，每项最多六条引文，引文最长 300 字。

## organize

`{outcome, timeline: [{horizon, possibility, condition, basis: Citation[]}], gaps: string[]}`。outcome 在有时间线时必填，最长 240 字。用「如果……」起句，一两句写清这条路上你做了什么、最后可能走到哪，可直接用于梦境总结。

输入里的 storyBible 是共享设定、divergence 是这条路的分岔点、realityReference 是现实中实际的选择（只作为要离开的参照，不是剧情素材）。先读 storyBible 并沿用；每条路从 divergence 指的第一件事写起，日常细节上与 realityReference 保持可指出的不同。

按时间返回最多五个节点。horizon 用短事件名和大致时间。每条 possibility 是同一篇故事相邻的一段，写一个场景或必要的过渡，承接上一段已经发生的事；用第二人称、写具体的人和事，对冲句和感悟不进正文（见 SKILL.md 路径作者一节）。condition 单独一句话注明足以改变这一段结果的设定；没有新条件时填空字符串。每个 basis 最多六条引文，可引用 dream-grounded-facts 中的单行事实摘要，服务端交付时回链原文；storyBible 是设定，不作为 basis。gaps 只留会改变结果的缺口，每条一句。时间线为空时写明缺口。

## refine

输入含一份完整 draft。返回与 organize 相同的格式，是修订后的完整故事（不是差异清单）。以第一次读这个故事的眼睛连读：修断点、删 AI 腔、确保分岔可见、结尾不汇回现实；写作要求与 organize 完全一致。basis 引文只能沿用原 draft 已有对应原文的引文，不得新增没有原文依据的引用；condition 保持一句话。故事已经连贯时原样返回同样的 JSON。

## review

`{summary, actualPath: Finding, reviews: [{branchId, claims: Finding[]}]}`。summary 是面向用户的梦境总结，从共同的假设写起，接着写各条已展开的路上你怎么应对、可能有什么结果。建议合计两至四句，分支之间可以换段。不在总结里写查证经过、回忆年份、引文或 verdict。没有路径时，一句话说清没有展开到哪里。actualPath 用两三句写现实中发生的事。reviews 对每个提供有效推演的分支返回一次，claims 顺序和数量与封存时间线一致，结论针对前提和机制。每条核对说明只写影响该节点的发现。没有路径时 reviews 为空。

## 用户指定的范围和呈现

- plan 收到 alternatives 时按给定顺序一一推演，数量须完全一致。每条仍可安排必要的额外检查。收到 until 时，所有时间线都在该日结束。
- organize 与 refine 按故事转折切分节点，每个节点可单独核对。篇幅服从故事需要，允许少于四个节点。可为节点加 date（YYYY-MM-DD），能合理定位才填。设想日期属于推演设定。
- description 给 Lead 用来理解用户想探索的时刻，优先保留用户明确提出的假如，并在自动规划时补充其他实质不同的选择。描述中提到的经历由 Ground 或事后资料确认。缺少同期材料时，Lead 可依据用户的假如规划。organize 在确实缺少支持某个节点的材料时，允许该节点的 basis 为空，condition 须写清楚它依赖的设定。
- calibrate 用与 organize 相同的格式，仅用决策时视图沿 actualChoice 盲推现实路径，最多三节点。盲推的每个节点须有依据。没有可依据的材料时返回空时间线。
- review 的总结可以写未能核验的备选结局，用条件和「可能」表明它是梦中的结果。发现关键反证时，按修正版叙述。遇到 contradicted 时，text 说明发现了什么，revision 用一两句写在相应条件下这件事会怎么发生。
- review 可附 actualTimeline（最多 8 项 `{date, finding}`，每项一句实际发生的事，要有日期和可引用的原文）、takeaways（最多 3 条，只写读完这个梦后仍值得记下的具体认识，有就写一两句）、comparison（最多 6 行 `{dimension, actual, branches:[{id,text,claimIndex?}]}`，只选有实质差别的维度，每格一句结果）。claimIndex 是该格所依据的同分支核对节点序号，从 0 开始。没有可对应的依据时省略 claimIndex。
- reviewFocus 是用户希望重新核对的节点提示，证据须另查原文或用户提供的经历。
- review 收到 priorReview 时，沿用已完成的核对及回测。reviews 只返回本次 results 里有推演节点的待核对分支。总结和对比可以同时引用已有和本次核对。核对范围截至 until，晚写的材料须能定位到范围内实际发生的事情。
- review 收到非空 blind 时附 calibration，每个盲推节点按顺序返回一个核验对象，只用真实记录核对。没有原始证据时标为 unknown。部分证据只支持所述机制的一部分时，可用 partial 并说明证据能说明到哪。
- scenario 是来自另一份梦境的假设情境，只用于衔接分支。不能把其中的事件当作真实事实或用于实际路径回测。requestedChoice 是此分支由用户选择的动作，沿此动作推演。
