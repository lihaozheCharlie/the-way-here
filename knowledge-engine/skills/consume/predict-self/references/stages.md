# 分步预测协议

调用方分多次执行，阶段要求优先于完整报告格式。每次只返回当前阶段的纯 JSON，不一次输出整个报告、不自行写文件。所有阶段绑定同一知识库、资料版本、日期和本次想法。每阶段结果由程序校验并保存，最后程序合并；不要为复述其他阶段重新输出它们。

## outline：证据与情景判断

执行共享检索与预测检索策略，核实证据、现状和用户候选。输出根字段 current、dimensions（四维现状）、evidence、scenarios。

scenarios 每项仅含：id、title、pathway、probability、probabilityBasis、probabilityCondition、probabilityReason、confidence、overview、evidenceIds、assumptions、counterEvidence、unknowns。约束与 output.md 对应字段相同，非空情景仍须含随机事件分支。

此阶段确定证据、概率、前提和不同生活去向。probabilityReason 是用户在“经历依据”首先读到的总结，用约80—150字、2—3句话串联最关键的1—3条个人经历与该去向，说明它们怎样支持判断、尚缺什么条件，并解释粗略概率。使用“你”，不罗列证据标题或写“来自索引/同源证据链”等审计语言。不把他人已迁居或海外资产安排当作本人已具备定居条件。概率为空时说清决定性缺口，条件概率不能写成整体发生率。只用本情景 evidenceIds 对应的已核实依据，不把示例国家或百分比套给用户。

不要生成 week、choice、情景 dimensions、stages 或 actions。证据少可以减少情景或返回空数组，不为下一阶段硬凑内容。

## detail：逐个展开生活

调用方提供已验证的 outline、本次情景ID及先前已完成情景的简短生活安排。只输出一个对象：id、week、choice、dimensions（未来四维）、stages、actions；字段格式与 output.md 相同。

只展开指定情景，不重复其他情景、现状和证据，不输出或修改概率、标题、去向、证据引用、前提及未知。普通一周、四维权衡、阶段与可逆行动须与该情景的既定收入依赖、地点、关系和约束一致，并与其他情景保持实质区别。不得为细节新增未经核实的收入、身份资格、伴侣或孩子。阶段文字保留条件，不写成到期承诺。

发现既定判断无法成立时，不能悄悄改成另一条路；返回可识别错误让任务失败，保留上次成功报告。程序合并后再校验完整报告，不调用模型重写大 JSON。
