import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLocale, translate } from "./locale";
import { demoFileLabel, demoFolderLabel, demoTitleLabel } from "./demo-overlay";

describe("translate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps Chinese as the source string", () => {
    expect(parseLocale(null)).toBe("zh");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("zh")).toBe("zh");
    expect(translate("zh", "此刻")).toBe("此刻");
    expect(translate("zh", "已完成")).toBe("已完成");
  });

  it("uses the writer overview copy and the terminology lock", () => {
    expect(translate("en", "此刻")).toBe("Now");
    expect(translate("en", "已有理解")).toBe("Understanding");
    expect(translate("en", "看见未来")).toBe("See ahead");
    expect(translate("en", "近况回信")).toBe("Recent letters");
    expect(translate("en", "随手记")).toBe("Quick note");
    expect(translate("en", "找照片")).toBe("Find photos");
    expect(translate("en", "只存原文、稍后再整理")).toBe("Save raw, organize later");
    expect(translate("en", "整理成日记")).toBe("Turn into a diary entry");
    expect(translate("en", "历史记录")).toBe("History");
    expect(translate("en", "已有理解总览")).toBe("Understanding overview");
    expect(translate("en", "暂时无法读取知识库，请刷新重试。")).toBe("Couldn’t read the library right now. Refresh and try again.");
    expect(translate("en", "娱乐")).toBe("Play");
    expect(translate("en", "3–12 个月 · 扛压期")).toBe("3–12 months · Pressure");
    expect(translate("en", "3–5 年 · 分化期")).toBe("3–5 years · Divergence");
    expect(translate("en", "删除知识库")).toBe("Delete library");
    expect(translate("en", "AI 设置")).toBe("AI settings");
    expect(translate("en", "任务已完成")).toBe("Task finished");
    expect(translate("en", "任务未完成")).toBe("Task not finished");
    expect(translate("en", "已完成")).toBe("finished");
    expect(translate("en", "未完成")).toBe("not finished");
    expect(translate("en", "正在停止")).toBe("Stopping");
    expect(translate("en", "正在停止…")).toBe("Stopping…");
    expect(translate("en", "写于 ")).toBe("Written ");
    expect(translate("en", "依据 … 的材料")).toBe("Based on materials from …");
    expect(translate("en", "你正在查看历史版本")).toBe("You’re viewing a past version");
    expect(translate("en", "近况回信")).toBe("Recent letters");
    expect(translate("en", "语言")).toBe("Language");
    expect(translate("en", "全景")).toBe("Wide");
    expect(translate("en", "暂存失败，当前文字已留在本机")).toBe("Couldn’t park it. Your current text stays on this computer.");
    expect(translate("en", "点选照片即可选中，最多 50 张 · 放大查看请点右下角")).toBe("Click a photo to select it — up to 50. Zoom from the lower-right corner.");
  });

  it("uses stable English for life-record filters and the import hint", () => {
    expect(translate("en", "全部")).toBe("All");
    expect(translate("en", "笔记")).toBe("Notes");
    expect(translate("en", "AI 对话")).toBe("Chats");
    expect(translate("en", "照片")).toBe("Photos");
    expect(translate("en", "账单")).toBe("Bills");
    expect(translate("en", "展开全部属性")).toBe("Expand properties");
    expect(translate("en", "搜索标题或内容…")).toBe("Search titles or text…");
    expect(translate("en", "导入资料")).toBe("Import materials");
    expect(translate("en", "打开照片记忆")).toBe("Open photo memory");
    expect(translate("en", "通过“打开照片记忆”修改人物和讲述")).toBe("Edit people and the telling from “Open photo memory”.");
    expect(translate("en", "让 The Way Here 先认识你的思考方式")).toBe("Let The Way Here learn how you think");
    expect(translate("en", "思考深度关闭")).toBe("Off");
    expect(translate("en", "关闭")).toBe("Close");
    expect(translate("en", "账单从这里导入，在本机按时间聚成线索；故事由你来填，不会自动发给模型。").split("\n")).toEqual([
      "Bills import here, grouped by time on this computer.",
      "You write the story; nothing is sent to a model.",
    ]);
    expect(translate("zh", "笔记")).toBe("笔记");
    expect(translate("zh", "展开全部属性")).toBe("展开全部属性");
    expect(translate("zh", "AI 对话")).toBe("AI 对话");
  });

  it("fills placeholders and falls back to Chinese when English is missing", () => {
    expect(translate("en", "从 ${from}", { from: "2020-01-01" })).toBe("From 2020-01-01");
    expect(translate("en", "${progress} / 100，目标 ${score.threshold} 分", { progress: 40, "score.threshold": 60 })).toBe("40 / 100, target 60");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(translate("en", "这段还没有英文")).toBe("这段还没有英文");
    if (import.meta.env.DEV) expect(warn).toHaveBeenCalledWith("[i18n] missing en: 这段还没有英文");
    expect(translate("en", "这段还没有英文")).toBe("这段还没有英文");
  });
});

describe("demo overlay", () => {
  it("shows English seed titles and folders only for the demo library in English", () => {
    expect(demoTitleLabel("demo", "en", "阿宁")).toBe("Aning");
    expect(demoTitleLabel("demo", "en", "2014-05-27 在自习室回想高考")).toBe("2014-05-27 Remembering the gaokao in the study room");
    expect(demoTitleLabel("demo", "en", "林学长")).toBe("Senior Lin");
    expect(demoTitleLabel("demo", "en", "我改过的标题")).toBe("我改过的标题");
    expect(demoTitleLabel("personal", "en", "阿宁")).toBe("阿宁");
    expect(demoTitleLabel("demo", "zh", "阿宁")).toBe("阿宁");
    expect(demoFolderLabel("demo", "en", "12 近况对话")).toBe("12 Recent letters");
    expect(demoFolderLabel("demo", "en", "07 人物与城市")).toBe("07 People & cities");
    expect(demoFolderLabel("demo", "en", "认识的人")).toBe("People I know");
    expect(demoFolderLabel("demo", "en", "我的文件夹")).toBe("我的文件夹");
    expect(demoFolderLabel("personal", "en", "照片记忆")).toBe("照片记忆");
    expect(demoFileLabel("demo", "en", "奶奶.md")).toBe("Grandma.md");
    expect(demoFileLabel("demo", "zh", "奶奶.md")).toBe("奶奶.md");
  });
});
