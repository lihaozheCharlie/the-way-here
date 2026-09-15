# v5 输出契约

仅返回 JSON，不带前言或 Markdown 围栏。字段如下，尖括号为说明，不能原样输出。

```json
{
  "version":5,
  "presentationVersion":1,
  "summary":"<100字内供后续讨论使用，页面不展示空泛引言>",
  "horizon":"未来五年",
  "current":"<24字内当前处境>",
  "dimensions":[{"id":"health","current":"<当前事实或未知>","desired":"<明确愿望或未知>","constraints":["<限制或不愿牺牲的东西>"],"evidenceIds":["e1"]}],
  "evidence":[{"id":"e1","kind":"wish","dimensions":["health"],"pageId":"<冻结页面ID>","cue":"<40字内线索>","quote":"<8—240字符连续原文>","interpretation":"<100字内与推演的联系及边界>"}],
  "probabilityMode":"independent",
  "probabilityScope":"<180字内说明范围与是否依赖用户假设；可并存的情景不相加>",
  "scenarios":[{
    "pathway":"willed",
    "id":"s1","title":"<20字内具体生活安排>","probability":null,"probabilityReason":"<180字内估计依据或无法估计的原因>","confidence":"low",
    "week":"<240字内第4—5年的普通一周>",
    "lenses":{"work":"<140字内工作视角>","life":"<140字内生活视角>"},
    "environment":"<140字内居住及环境条件，缺资料写未知>",
    "choice":"<90字内取舍>",
    "dimensions":[{"id":"health","future":"<140字内未来状态或未知>","gain":"<90字内得到什么或未知>","cost":"<90字内代价或未知>","verdict":{"label":"<20字内结论>","tone":"mixed"},"gainShare":null,"gains":["<收益短语或未知>"],"costs":["<代价短语或未知>"],"notes":[{"kind":"condition","title":"<80字内前提>","detail":"<240字内具体解释>"}]}],
    "evidenceIds":["e1"],"assumptions":["<成立条件>"],
    "stages":[
      {"period":"months0_3","change":"<近期探索>","condition":"<继续条件>"},
      {"period":"months3_12","change":"<验证安排>","condition":"<继续条件>"},
      {"period":"years1_3","change":"<调整与积累>","condition":"<继续条件>"},
      {"period":"years3_5","change":"<具体生活状态>","condition":"<维持条件>"}
    ],
    "factors":[{"label":"<30字内因素>","direction":"support","strength":1,"mechanism":"<140字内怎样影响>"}],
    "counterEvidence":["<具体反例或检索局限>"],"unknowns":["<尚未知>"],
    "actions":[{"action":"<140字内一步实验>","observation":"<140字内看什么反馈>","reviewAfter":"<30字内回看时间>","dimensions":["health"]}],
    "forks":[{"condition":"<140字内真实分岔条件>","then":"<条件成立时>","otherwise":"<不成立时>"}]
  }],
  "gaps":["<覆盖缺口>"],"tensions":["<跨情景的资源或价值矛盾>"],"changes":["<哪条新证据或假设影响了哪个判断；首次可空>"]
}
```

顶层 dimensions 与每条 scenarios.dimensions 都必须恰好包含 health/love/play/finance 四个唯一ID，示例仅展示一个字段形状。每个情景四阶段必须按例子顺序完整提供。所有引用ID需对应顶层 evidence，不能重复堆同一事件；顶层最多40条证据，各引用列表最多12个唯一ID，每条情景至少一个。

情景最多5条，不足3条说明 gaps；0条时 gaps 必须非空。情景ID和标题唯一。probability 为 null 或0—100且是5的倍数。exclusive 模式每条必须有数值且总和100，independent 不要求和为100。

current/desired、probabilityReason、scope、其余普通字符串最多180字符；id最多40字符；stage.change/condition、fork各字段最多140字符。constraints最多5条；assumptions为1—8条；counterEvidence最多5条；unknowns最多8条；actions为1—3条；forks为0—2条；factors为1—5条，direction仅support/risk、strength仅1/2/3。每个非空文本必须具体、必要，未知可以明确写“资料不足，尚不清楚”。证据kind仅fact/wish/plan/action/outcome/hypothesis，dimensions为四维中1—4个唯一ID。confidence仅low/medium/high。actions[].dimensions必须给出，为四维中1—4个唯一ID，标注该实验主要验证或推动哪些维度。


## 页面展示字段（新生成报告必填）

`presentationVersion` 固定为1。`pathway` 仅允许 `inertia`（按惯性走）、`willed`（按意愿改变）、`wildcard`（小概率事件），不可输出中文或自定义走法；具体行动和偶发条件放入 assumptions、stages、notes。每条未来各自标注，不要求三类齐全，不限制为三个未来。

每个情景的四个维度均须显式包含 verdict、gainShare、gains、costs、notes，同时保留 future/gain/cost。verdict.label 为1—20字符，tone仅up/mixed/down。gainShare 为0—100整数或null：收益相对代价比重，代价由100减去收益得出，不是发生概率。null 时 gain/cost 写明缺少什么信息，不能省略字段或为了图表编造比例。gains/costs 各1—5条非空短语，每条不超过180字符；notes 为0—8条，kind仅action/condition/risk，title不超过80字符、detail不超过240字符。行动 notes 与 actions 应保持一致，不重复堆叠。

旧存档缺少展示字段、使用work维度或三阶段仅用于兼容读取；本次生成不得沿用旧结构。
