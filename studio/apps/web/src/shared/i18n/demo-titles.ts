import type { AppLocale } from "./locale";

/** Display names for the demo library. Stored Chinese stays on disk. */

function demoLibrary(id?: string | null): boolean {
  return (id || "").toLowerCase() === "demo";
}

export const demoFolders: Record<string, string> = {
  "00 总入口": "00 Home",
  "01 个人主线": "01 Personal thread",
  "02 人生阶段": "02 Life stages",
  "03 关键事件与决策": "03 Key events & decisions",
  "04 反复循环": "04 Recurring loops",
  "05 人物关系图谱": "05 Relationship map",
  "06 现实系统": "06 Everyday systems",
  "07 人物与城市": "07 People & cities",
  "人物": "People",
  "认识的人": "People I know",
  "同学": "School",
  "家人": "Family",
  "工作": "Work",
  "老师": "Teachers",
  "生活过的城市": "Cities I've lived in",
  "08 来源索引": "08 Source index",
  "09 思维模型": "09 Mental models",
  "12 近况对话": "12 Recent letters",
  "照片记忆": "Photo memories",
  "账单记忆": "Bill memories",
};

export const demoTitles: Record<string, string> = {
  "2013-10-24 大学里的自我要求": "2013-10-24 What I asked of myself at university",
  "2014-05-27 在自习室回想高考": "2014-05-27 Remembering the gaokao in the study room",
  "2015-10-21 在学生组织里被信任": "2015-10-21 Being trusted in the student organization",
  "2018-08-14 绩效前夜的工作复盘": "2018-08-14 Work review the night before a performance review",
  "2022-01-19 离开南京的工作": "2022-01-19 Leaving the job in Nanjing",
  "2022-02-08 到新城市上班": "2022-02-08 Starting work in a new city",
  "2024-04-25 女儿出生的夜晚": "2024-04-25 The night our daughter was born",
  "2026-04-21 搬家后的客厅": "2026-04-21 The living room after the move",
  "2026-05-29 雨天阳台与工作边界": "2026-05-29 A rainy balcony and the edge of work",
  "2026-06-13 雨声里想起奶奶": "2026-06-13 Remembering Grandma in the rain",
  "2026-09-20 让自己的作品走到人前": "2026-09-20 Letting the work meet other people",
  "初中住校与重新投入学习": "Boarding in middle school, and choosing to study again",
  "一张新城市餐桌的照片": "A photo of a table in the new city",
  "支付宝消费旅程 2022-03-11 至 2022-03-12": "Alipay spending journey, 2022-03-11 to 2022-03-12",
  "高中被评价后的冲刺": "The sprint after being ranked in high school",
  "个人操作系统": "Personal operating system",
  "从热血自责到可持续的行动": "From heated self-blame to sustainable action",
  "从证明自己到建设选择权": "From proving yourself to building the freedom to choose",
  "互联网大厂：从被看见到有选择": "Big tech: from being seen to having a choice",
  "初中：从逃避到重新选择": "Middle school: from avoiding to choosing again",
  "大学：从参与者到承担者": "University: from taking part to taking responsibility",
  "通信大厂：从硬扛到主动选择": "Telecom: from enduring to choosing",
  "高中：从被评价到完成考试": "High school: from being ranked to finishing the exam",
  "在学生组织承担责任": "Taking responsibility in the student organization",
  "演示场景：搬到杭州后的周末": "Demo scene: a weekend after moving to Hangzhou",
  "离家住校后重新投入学习": "Studying again after leaving home to board",
  "离开熟悉的职业环境": "Leaving a familiar career",
  "被分层评价后完成一次冲刺": "Finishing a sprint after being ranked",
  "立志中断后又重新开始": "Starting again after a resolution breaks",
  "评价触发后急于证明自己": "Rushing to prove yourself after being judged",
  "反面样本": "A cautionary example",
  "旧伤触发者": "Someone who reopens an old hurt",
  "组织信号源": "Where the organization's signals come from",
  "能力镜子": "A mirror for ability",
  "贵人与支持者": "Mentors and supporters",
  "长期关系支点": "A lasting relationship",
  "家庭系统": "Family system",
  "注意力系统": "Attention system",
  "人物总览": "People overview",
  "林学长": "Senior Lin",
  "奶奶": "Grandma",
  "小禾": "Xiaohe",
  "阿宁": "Aning",
  "周远": "Zhou Yuan",
  "孟主管": "Supervisor Meng",
  "梁工": "Engineer Liang",
  "程工": "Engineer Cheng",
  "邵工": "Engineer Shao",
  "顾老师": "Teacher Gu",
  "南京": "Nanjing",
  "哈尔滨": "Harbin",
  "杭州": "Hangzhou",
  "人物别名合并索引": "Merged index of name aliases",
  "演示故事来源导航": "Demo story source guide",
  "先确认责任链，再补位": "Confirm the chain of responsibility, then step in",
  "思维模型总览": "Mental models overview",
  "把评价当信息，不当判决": "Treat a judgment as information, not a verdict",
  "2026-09-20 芒格视角：别让掌声替你决定投入": "2026-09-20 Munger: don’t let applause decide what you invest in",
  "2026-09-20 费曼视角：保留那个还不知道": "2026-09-20 Feynman: keep the part you still don’t know",
  "2026-09-20 马斯克视角：先找到作品的瓶颈": "2026-09-20 Musk: find the bottleneck in the work first",
  "南京：工程训练与离开": "Nanjing: engineering training and leaving",
  "杭州：职业机会与日常生活": "Hangzhou: career chances and everyday life",
  "哈尔滨：第一次承担共同体": "Harbin: first time carrying a community",
  "一张新城市餐桌的照片 · 虚构演示": "A photo of a table in a new city · fictional demo",
  "从车票到两只杯子 · 虚构消费旅程": "From a train ticket to two cups · fictional spending journey",
  "Wiki 构建日志": "Wiki build log",
  "生活记录导航": "Life records navigation",
  "人物索引": "People index",
  "思维模型": "Mental models",
  "芒格视角：别让掌声替你决定投入": "Munger lens: don't let applause decide what you invest in",
  "费曼视角：保留那个还不知道": "Feynman lens: keep the part you still don't know",
  "马斯克视角：先找到作品的瓶颈": "Musk lens: find the product's bottleneck first",
  "约 2007—2010 年，回顾性记录": "About 2007–2010, written in retrospect",
  "约 2010—2013 年，回顾性记录": "About 2010–2013, written in retrospect",
  "这次移动对你意味着什么？": "What did this move mean to you?",
  "这一天最想留下哪个小片段？": "Which small moment from that day do you most want to keep?",
  "从南京到杭州的一张车票": "A ticket from Nanjing to Hangzhou",
};

const tagPrefixes: Record<string, string> = {
  wiki: "Wiki",
  "主线": "Thread",
  "来源": "Source",
  "类型": "Type",
  "循环": "Loop",
  "系统": "System",
  "思维模型": "Mental model",
  "实体": "Entity",
  "人生阶段": "Life stage",
  "人物图谱": "Relationship map",
  "决策": "Decision",
  "索引": "Index",
  "事件": "Event",
};

const tagWords: Record<string, string> = {
  "个人主线": "Personal thread",
  "个人操作系统": "Personal operating system",
  "反复循环": "Recurring loops",
  "现实系统": "Everyday systems",
  "人物别名合并": "Merged name aliases",
  "入口": "Home",
  "日志": "Log",
  wiki: "Wiki",
  "事件": "Events",
  "人物图谱": "Relationship map",
  "人生阶段": "Life stages",
  "决策": "Decisions",
  "实体": "Entities",
  "思维模型": "Mental models",
  "索引": "Index",
};

const FOLD = /[\u2010-\u2015\u2212\uFF1A:]/;

function foldWithMap(value: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (/\s/.test(char) || FOLD.test(char)) {
      if (!text.length || text.endsWith(" ")) continue;
      text += " ";
      map.push(index);
      continue;
    }
    text += char;
    map.push(index);
  }
  return { text, map };
}

let replacementPairs: Array<[string, string]> | undefined;

function replacements(): Array<[string, string]> {
  if (replacementPairs) return replacementPairs;
  const pairs = new Map<string, string>();
  for (const [key, english] of Object.entries(demoTitles)) pairs.set(key, english);
  for (const [key, english] of Object.entries(demoFolders)) if (/[\u3400-\u9fff]/.test(key)) pairs.set(key, english);
  for (const [key, english] of Object.entries(demoTitles)) {
    const datedKey = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(key);
    const datedEnglish = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(english);
    if (datedKey && datedEnglish && !pairs.has(datedKey[2]!)) pairs.set(datedKey[2]!, datedEnglish[2]!);
  }
  replacementPairs = [...pairs.entries()].sort((a, b) => b[0].length - a[0].length);
  return replacementPairs;
}

/** Replace demo titles inside a display string. Hyphens and colons match either form. */
export function localizeDemoTitles(libraryId: string | null | undefined, locale: AppLocale, value: string): string {
  if (locale !== "en" || !demoLibrary(libraryId) || !value || !/[\u3400-\u9fff]/.test(value)) return value;
  const folded = foldWithMap(value);
  const matches: Array<{ start: number; end: number; english: string }> = [];
  let index = 0;
  while (index < folded.text.length) {
    let matched = false;
    for (const [key, english] of replacements()) {
      const needle = foldWithMap(key).text;
      if (!needle || !folded.text.startsWith(needle, index)) continue;
      const start = folded.map[index]!;
      const end = folded.map[index + needle.length - 1]! + 1;
      matches.push({ start, end, english });
      index += needle.length;
      matched = true;
      break;
    }
    if (!matched) index += 1;
  }
  let out = "";
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    out += value.slice(cursor, match.start) + match.english;
    cursor = match.end;
  }
  return out + value.slice(cursor);
}

export function demoTagLabel(libraryId: string | null | undefined, locale: AppLocale, tag: string): string {
  if (locale !== "en" || !demoLibrary(libraryId) || !tag) return tag;
  return tag.split("/").map((part, index) => {
    if (index === 0 && tagPrefixes[part]) return tagPrefixes[part];
    return demoTitles[part] || tagWords[part] || tagPrefixes[part] || localizeDemoTitles(libraryId, locale, part);
  }).join("/");
}
