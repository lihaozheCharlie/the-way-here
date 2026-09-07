export const growthTabs = [["/cards/personal-lines", "个人主线"], ["/cards/cycles", "反复循环"], ["/cards/systems", "现实系统"], ["/mental-models", "思维模型"]] as const;
export const categoryMeta: Record<string, { title: string; intro: string }> = {
  "personal-lines": { title: "个人主线", intro: "这一生反复在解决什么，以及它怎样穿过不同阶段。" },
  cycles: { title: "反复循环", intro: "看见触发、惯性反应、代价与真实有效的中断方式。" },
  systems: { title: "现实系统", intro: "职业、家庭、身体、资产、注意力与表达怎样共同运行。" },
};
