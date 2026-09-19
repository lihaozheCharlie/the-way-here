# 预测输出结构

仅返回JSON对象，不加围栏。所有下列字段必填，未列出的字段禁止输出。只接受下述结构。顶层不再生成version/gaps/summary/horizon/presentationVersion/pathwayAssessment/changes/tensions/probabilityMode/probabilityScope；情景不再生成lenses/environment/factors/forks；维度不再生成gain/cost。

## 结构

- 根：`current`（40字内），`dimensions`（四维现状），`evidence`，`scenarios`。
- 现状项：`id`，`current`，`desired`，`constraints`（0—3条），`evidenceIds`（0—8个）。current/desired/constraint各120字内。
- evidence项：`id`（40字内），`pageId`（1000字符内），`quote`（8—200字符连续原文），`cue`（40字内），`interpretation`（100字内），`kind`（fact/wish/plan/action/outcome/hypothesis），`dimensions`（1—4个维度ID）。最多20条，ID及同来源同引文不重复。
- 情景项字段如下（尖括号说明不能原样输出）：

```json
{
  "id":"s1",
  "title":"<20字内具体生活去向>",
  "pathway":"inertia",
  "probability":null,
  "probabilityBasis":"overall",
  "probabilityCondition":null,
  "probabilityReason":"<180字内判断依据或具体缺口>",
  "confidence":"low",
  "overview":"<80字内生活概述>",
  "week":"<140字内普通一周>",
  "choice":"<70字内主要取舍>",
  "dimensions":[{
    "id":"health",
    "future":"<100字内未来状态>",
    "verdict":{"label":"<20字内结论>","tone":"mixed"},
    "gainShare":null,
    "gains":["<60字内收益或缺口>"],
    "costs":["<60字内代价或缺口>"],
    "notes":[{"kind":"condition","title":"<40字内前提>","detail":"<100字内说明>"}]
  }],
  "evidenceIds":["e1"],
  "assumptions":["<120字内条件>"],
  "counterEvidence":[],
  "unknowns":[],
  "stages":[
    {"period":"months0_3","change":"<80字内变化>","condition":"<80字内条件>"},
    {"period":"months3_12","change":"<80字内变化>","condition":"<80字内条件>"},
    {"period":"years1_3","change":"<80字内变化>","condition":"<80字内条件>"},
    {"period":"years3_5","change":"<80字内变化>","condition":"<80字内条件>"}
  ],
  "actions":[{"action":"<80字内可逆试验>","observation":"<80字内反馈>","reviewAfter":"<30字内回看时间>","dimensions":["health"]}]
}
```

## 校验边界

1. 顶层和每条情景的dimensions都必须恰好包含health/work/play/love，ID不重复；证据和行动也只能用这四个ID。财务归health。上面维度示例仅展示一个，实际必须补齐四个。
2. scenarios为0—5条，ID和标题唯一；有情景时至少一条wildcard；没有可引用个人处境时允许空数组。每条引用1—8个存在的证据ID；当前状态引用不得指向hypothesis。
3. pathway仅inertia/willed/wildcard。probability为0—100的5的倍数或null。probabilityBasis仅overall/conditional：overall的probabilityCondition必须null；conditional必须填写1—120字条件。各情景不强制合计100。null不是默认答案。
4. confidence仅low/medium/high；只有愿望、计划或假设的情景必须low，其他情况按证据充分度判断。
5. gainShare只允许20/35/50/65/80/null，含义见Skill。gains/costs各1—2条；verdict.tone仅up/mixed/down；notes为0—2条，仅condition/risk，不能包含action。
6. assumptions为1—3条；counterEvidence和unknowns各0—3条，每条120字内。actions为1—3条；四阶段顺序固定。各引用和维度标签不得重复。
7. 列表可按上述范围为空，文本字段不能用空字符串代替未知；具体缺口写在对应字段，避免反复“资料不足”。
