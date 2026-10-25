import type { AppLocale } from "./locale";
import { translate, translateInterpolated, useActiveLibraryId, useI18n } from "./locale";
import { demoEnglishDocument, demoListExcerpt, type DemoBodyLink } from "./demo-body";

/** Display-only English for the demo library.
 *
 * The Chinese tree on disk stays the source of truth. When the locale is English
 * and the active library id is `demo`, titles and folder segments that still match
 * the Chinese seed are shown in English. A rename no longer matches the seed, so
 * it stays as stored. Nothing here writes to the vault.
 *
 * Titles are provisional stand-ins until a writer title table is supplied.
 * Folder names follow the agreed demo wiki outline.
 */

const demoFolders: Record<string, string> = {
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

const demoTitles: Record<string, string> = {
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
};

const demoLibraries: Record<string, string> = {
  "The Way Here 演示 Wiki": "The Way Here demo",
};

export function isDemoLibrary(id?: string | null): boolean {
  return (id || "").toLowerCase() === "demo";
}

/** Display name for a library. The stored id and name stay as written. */
export function demoLibraryLabel(libraryId: string | null | undefined, locale: AppLocale, name: string): string {
  return overlay(libraryId, locale, name, demoLibraries);
}

function overlay(libraryId: string | null | undefined, locale: AppLocale, value: string, table: Record<string, string>): string {
  if (locale !== "en" || !isDemoLibrary(libraryId) || !value) return value;
  return table[value] ?? value;
}

export function demoFolderLabel(libraryId: string | null | undefined, locale: AppLocale, segment: string): string {
  return overlay(libraryId, locale, segment.trim(), demoFolders);
}

export function demoTitleLabel(libraryId: string | null | undefined, locale: AppLocale, title: string): string {
  const trimmed = title.trim();
  const overlaid = overlay(libraryId, locale, trimmed, demoTitles);
  if (overlaid !== trimmed) return overlaid;
  if (locale === "en" && trimmed === "未命名") return translate(locale, trimmed);
  return translateInterpolated(locale, trimmed);
}

/** Demo seed folders stay Chinese on disk. In English, the demo library shows the seed
 * overlay, and the product capture folder「随手记」shows its catalog name in every library.
 */
export function chromeFolderLabel(libraryId: string | null | undefined, locale: AppLocale, segment: string): string {
  const overlaid = demoFolderLabel(libraryId, locale, segment);
  if (overlaid !== segment.trim()) return overlaid;
  if (locale === "en" && ["随手记", "外部来源", "AI聊天记录", "聊天记录", "消费账单", "知识库"].includes(segment.trim())) return translate(locale, segment.trim());
  const generated = translateInterpolated(locale, segment.trim());
  return generated === segment.trim() ? segment : generated;
}

export function demoFolderPath(libraryId: string | null | undefined, locale: AppLocale, folder: string): string {
  if (!folder || locale !== "en") return folder;
  return folder.split(" / ").map((part) => chromeFolderLabel(libraryId, locale, part)).join(" / ");
}

export function demoFileLabel(libraryId: string | null | undefined, locale: AppLocale, fileName: string): string {
  const generated = translateInterpolated(locale, fileName);
  if (generated !== fileName) return generated;
  const match = /^(.*?)(\.(?:md|txt))$/i.exec(fileName);
  const stem = match?.[1] ?? fileName;
  const ext = match?.[2] ?? "";
  const mapped = demoTitleLabel(libraryId, locale, stem);
  if (mapped !== stem) return `${mapped}${ext}`;
  const folder = chromeFolderLabel(libraryId, locale, stem);
  return folder === stem.trim() ? fileName : `${folder}${ext}`;
}

export function useDemoLabels() {
  const libraryId = useActiveLibraryId();
  const { locale } = useI18n();
  return {
    libraryId,
    locale,
    title: (value: string) => demoTitleLabel(libraryId, locale, value),
    folder: (value: string) => chromeFolderLabel(libraryId, locale, value),
    folderPath: (value: string) => demoFolderPath(libraryId, locale, value),
    library: (value: string) => demoLibraryLabel(libraryId, locale, value),
    file: (value: string) => demoFileLabel(libraryId, locale, value),
    excerpt: (relativePath: string, excerpt: string) => demoListExcerpt(libraryId, locale, relativePath, excerpt),
    libraryName: (id: string | null | undefined, name: string) => demoLibraryLabel(id, locale, name),
    englishDocument: (relativePath: string, fileMarkdown: string, links?: DemoBodyLink[]) => demoEnglishDocument(libraryId, locale, relativePath, fileMarkdown, links),
  };
}
