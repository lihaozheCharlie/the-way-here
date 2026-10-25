import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoBodies } from "./demo-body-data";
import { demoEnglishDocument, demoEnglishHeading, demoExcerptFromMarkdown, demoFingerprint, demoListExcerpt } from "./demo-body";
import { demoLibraryLabel } from "./demo-overlay";
import { demoSeedExcerpts } from "./demo-excerpt-data";
import { demoJsonStrings } from "./demo-json-data";
import { demoJsonText, overlayDemoJson } from "./demo-json";

const vault = new URL("../../../../../../vault/demo/", import.meta.url);

function readVault(relativePath: string): string {
  return readFileSync(new URL(relativePath, vault), "utf8");
}

describe("demo markdown overlay", () => {
  it("covers every seeded source and wiki page without touching other libraries", () => {
    expect(Object.keys(demoBodies).filter((key) => key.startsWith("sources/"))).toHaveLength(15);
    expect(Object.keys(demoBodies).filter((key) => key.startsWith("wiki/"))).toHaveLength(46);
    const source = "sources/2013-10-24 大学里的自我要求.md";
    const wiki = "wiki/00 总入口/个人操作系统.md";
    const sourceMarkdown = readVault(source);
    const wikiMarkdown = readVault(wiki);
    expect(demoFingerprint(sourceMarkdown)).toBe(demoBodies[source]!.fingerprint);
    expect(demoFingerprint(wikiMarkdown)).toBe(demoBodies[wiki]!.fingerprint);
    const englishSource = demoEnglishDocument("demo", "en", `vault/demo/${source}`, sourceMarkdown);
    const englishWiki = demoEnglishDocument("demo", "en", wiki, wikiMarkdown, [
      { target: "杭州", resolvedId: "wiki/07 人物与城市/生活过的城市/杭州" },
    ]);
    expect(englishSource).toContain("Standards for myself in college");
    expect(englishWiki).toContain("Personal operating system");
    expect(englishWiki).toContain("](/page/wiki/07%20%E4%BA%BA%E7%89%A9%E4%B8%8E%E5%9F%8E%E5%B8%82/%E7%94%9F%E6%B4%BB%E8%BF%87%E7%9A%84%E5%9F%8E%E5%B8%82/%E6%9D%AD%E5%B7%9E)");
    expect(demoEnglishDocument("demo", "en", source, `${sourceMarkdown}\nedited`)).toBeUndefined();
    expect(demoEnglishDocument("personal", "en", source, sourceMarkdown)).toBeUndefined();
    expect(demoEnglishDocument("demo", "zh", source, sourceMarkdown)).toBeUndefined();
  });

  it("overlays a demo list excerpt only when the indexed opening still matches", () => {
    const path = "sources/照片记忆/一张新城市餐桌的照片.md";
    const markdown = readVault(path);
    expect(demoSeedExcerpts[path]).toBe(demoExcerptFromMarkdown(markdown));
    expect(demoFingerprint(markdown)).toBe(demoBodies[path]!.fingerprint);
    const english = demoListExcerpt("demo", "en", path, demoSeedExcerpts[path]!);
    expect(english.startsWith("This is a fully fictional demo photo memory.")).toBe(true);
    const letter = "wiki/12 近况对话/2026-09-20 芒格视角：别让掌声替你决定投入.md";
    expect(demoEnglishHeading("demo", "en", letter, demoSeedExcerpts[letter])).toBe("Munger lens: don't let applause decide what you invest in");
    expect(demoListExcerpt("demo", "en", letter, demoSeedExcerpts[letter]!)).not.toMatch(/[\u4e00-\u9fff]/);
    expect(demoEnglishHeading("demo", "en", letter, "我改过的摘要")).toBeUndefined();
    expect(english).not.toMatch(/[\u4e00-\u9fff]/);
    expect(demoListExcerpt("personal", "en", path, demoSeedExcerpts[path]!)).toBe(demoSeedExcerpts[path]);
    expect(demoListExcerpt("demo", "zh", path, demoSeedExcerpts[path]!)).toBe(demoSeedExcerpts[path]);
    expect(demoListExcerpt("demo", "en", path, "我改过的摘要")).toBe("我改过的摘要");
    expect(demoLibraryLabel("demo", "en", "The Way Here 演示 Wiki")).toBe("The Way Here demo");
    expect(demoLibraryLabel("personal", "en", "The Way Here 演示 Wiki")).toBe("The Way Here 演示 Wiki");
    expect(demoLibraryLabel("demo", "zh", "The Way Here 演示 Wiki")).toBe("The Way Here 演示 Wiki");
    expect(demoLibraryLabel("demo", "en", "改过的库名")).toBe("改过的库名");
    const windowLibrary = (id: string, locale: "en" | "zh", name?: string) => demoLibraryLabel(id, locale, name || "The Way Here");
    expect(`Life records · ${windowLibrary("demo", "en", "The Way Here 演示 Wiki")}`).toBe("Life records · The Way Here demo");
    expect(`生活记录 · ${windowLibrary("demo", "zh", "The Way Here 演示 Wiki")}`).toBe("生活记录 · The Way Here 演示 Wiki");
    expect(`Life records · ${windowLibrary("personal", "en", "我的生活")}`).toBe("Life records · 我的生活");
    expect(`Life records · ${windowLibrary("demo", "en")}`).toBe("Life records · The Way Here");
  });
});

describe("demo json overlay", () => {
  it("replaces seeded prediction and photo strings by path and jsonpath", () => {
    const fields = Object.values(demoJsonStrings).flatMap((rows) => Object.values(rows));
    expect(fields).toHaveLength(280);
    expect(fields.some((row) => /[\u4e00-\u9fff]/.test(row.en))).toBe(false);
    const state = JSON.parse(readVault("predictions/state.json")) as {
      report: { current: string; scenarios: Array<{ title: string }> };
      assessment: { facets: Array<{ label: string; reason: string }> };
      thoughts: string;
    };
    const report = overlayDemoJson("demo", "en", "vault/demo/predictions/state.json", state.report, "$.report");
    const assessment = overlayDemoJson("demo", "en", "predictions/state.json", state.assessment, "$.assessment");
    expect(report.current).toContain("Hangzhou");
    expect(report.current).not.toMatch(/[\u4e00-\u9fff]/);
    expect(report.scenarios[0]!.title).toBe("Stay at a Hangzhou internet big-tech");
    expect(assessment.facets[2]!.label).toBe("Play");
    expect(demoJsonText("demo", "en", "predictions/state.json", "$.thoughts", state.thoughts)).toContain("None of these paths has happened yet.");
    expect(overlayDemoJson("demo", "en", "predictions/state.json", { ...state.report, current: "我改过的现状" }, "$.report").current).toBe("我改过的现状");
    expect(overlayDemoJson("personal", "en", "predictions/state.json", state.report, "$.report").current).toBe(state.report.current);
    expect(overlayDemoJson("demo", "zh", "predictions/state.json", state.report, "$.report")).toBe(state.report);

    const memoryPath = "sources/.photo-memories/demo-hangzhou-photo-2022/memory.json";
    const generationPath = "sources/.photo-memories/demo-hangzhou-photo-2022/generation.json";
    const memory = JSON.parse(readVault(memoryPath)) as { title: string; reportPath: string; draft: string; photos: Array<{ name: string; people: Array<{ name: string }> }> };
    const generation = JSON.parse(readVault(generationPath)) as { identitySource: string };
    expect(demoJsonText("demo", "en", memoryPath, "$.title", memory.title)).toContain("fictional demo");
    expect(demoJsonText("demo", "en", memoryPath, "$.photos[0].name", memory.photos[0]!.name)).toContain("Hangzhou");
    expect(demoJsonText("demo", "en", memoryPath, "$.photos[0].people[0].name", memory.photos[0]!.people[0]!.name)).toBe("Aning");
    expect(demoJsonText("demo", "en", memoryPath, "$.draft", memory.draft)).toContain("Aning");
    expect(demoJsonText("demo", "en", memoryPath, "$.reportPath", memory.reportPath)).not.toBe(memory.reportPath);
    expect(demoJsonText("demo", "en", generationPath, "$.identitySource", generation.identitySource)).toContain("alias");
    expect(demoJsonText("demo", "en", memoryPath, "$.title", "一张改过的标题")).toBe("一张改过的标题");
  });
});
