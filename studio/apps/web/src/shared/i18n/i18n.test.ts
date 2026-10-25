import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLocale, translate } from "./locale";
import { chromeFolderLabel, demoFileLabel, demoFolderLabel, demoLibraryLabel, demoPathTooltip, demoTitleLabel } from "./demo-overlay";

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
    expect(translate("en", "通过“打开照片记忆”修改人物和讲述")).toBe("Edit people and the telling via “Open photo memory”");
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

  it("translates the life-record progress, links, delete, move, and show-more chrome", () => {
    expect(translate("en", "消费账单构建进度")).toBe("Spending-bill build progress");
    expect(translate("en", "账单解析")).toBe("Read the bill");
    expect(translate("en", "对话完善")).toBe("Fill in through chat");
    expect(translate("en", "构建入 Wiki")).toBe("Build into the Wiki");
    expect(translate("en", "查看关联结果 · ${count}", { count: 11 })).toBe("See linked results · 11");
    expect(translate("en", "查看全部 ${count} 个关联页面", { count: 10 })).toBe("See all 10 linked pages");
    expect(translate("en", "删除这份生活记录？")).toBe("Delete this Life record?");
    expect(translate("en", "删除这个文件夹？")).toBe("Delete this folder?");
    expect(translate("en", "其中包含 ${count} 份记录。已有理解不会自动删除，但之后将无法再回到这些原始材料；此操作不能撤销。", { count: 3 })).toBe("This includes 3 records. Understanding isn’t deleted automatically, but you won’t be able to return to these source materials. This can’t be undone.");
    expect(translate("en", "这会删除记忆报告并隐藏人物影像关联，但不会删除隐藏目录中保留的原图。")).toBe("This deletes the memory report and hides people links in the images, but keeps the originals in the hidden folder.");
    expect(translate("en", "沿着这篇记录，留下一封可以从未来回看的信。")).toBe("From this record, leave a letter you can look back on later.");
    expect(translate("en", "移动「${name}」", { name: "note.md" })).toBe("Move “note.md”");
    expect(translate("en", "选择目标文件夹")).toBe("Choose a destination folder");
    expect(translate("en", "移动到这里")).toBe("Move here");
    expect(translate("en", "知识库已切换，请重新选择文件")).toBe("The library changed. Choose the file again.");
    expect(translate("en", "继续显示 ${count} 份", { count: 12 })).toBe("Show 12 more");
    expect(translate("en", "关闭删除确认")).toBe("Close delete confirmation");
    expect(translate("en", "暂时无法删除，请稍后再试")).toBe("Couldn’t delete it. Try again in a moment.");
    expect(translate("en", "让 The Way Here 先认识你的思考方式")).toBe("Let The Way Here learn how you think");
    expect(translate("en", "尚未配置 AI 模型，部分功能不可用")).toBe("No AI model is set up yet, so some features are unavailable");
    expect(translate("en", "去配置")).toBe("Set up");
    expect(translate("zh", "继续显示 ${count} 份", { count: 12 })).toBe("继续显示 12 份");
    expect(translate("zh", "查看关联结果 · ${count}", { count: 11 })).toBe("查看关联结果 · 11");
    expect(translate("zh", "移动「${name}」", { name: "note.md" })).toBe("移动「note.md」");
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
    expect(chromeFolderLabel("personal", "en", "随手记")).toBe("Quick note");
    expect(chromeFolderLabel("personal", "en", "知识库")).toBe("Library");
    expect(demoTitleLabel("personal", "en", "未命名")).toBe("Untitled");
    expect(chromeFolderLabel("demo", "en", "照片记忆")).toBe("Photo memories");
    expect(demoPathTooltip("demo", "en", "/vault/demo/sources/照片记忆/一张新城市餐桌的照片.md")).toBe("/vault/demo/sources/Photo memories/A photo of a table in the new city.md");
    expect(demoPathTooltip("personal", "en", "sources/照片记忆")).toBe("sources/照片记忆");
    expect(chromeFolderLabel("personal", "en", "照片记忆")).toBe("照片记忆");
    expect(demoLibraryLabel("demo", "en", "The Way Here 演示 Wiki")).toBe("The Way Here demo");
    expect(demoLibraryLabel("personal", "en", "The Way Here 演示 Wiki")).toBe("The Way Here 演示 Wiki");
    expect(demoLibraryLabel("demo", "zh", "The Way Here 演示 Wiki")).toBe("The Way Here 演示 Wiki");
    expect(demoTitleLabel("personal", "en", "ChatGPT 对话 2")).toBe("ChatGPT conversation 2");
    expect(translate("en", "无法解码「trip.jpg」，请导出为普通 JPG 后重试")).toBe("Couldn’t decode “trip.jpg”. Export it as a regular JPG and try again.");
  });
});
