import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { desktopWindowTitle } from "../../app/window-title";
import { demoListExcerpt } from "./demo-body";
import { demoPathTooltip, demoTitleLabel } from "./demo-overlay";
import { demoTagLabel } from "./demo-titles";
import { demoSeedExcerpts } from "./demo-excerpt-data";

const vault = fileURLToPath(new URL("../../../../../../vault/demo/", import.meta.url));
const scanner = fileURLToPath(new URL("../../../../../scripts/demo-payload-chrome.mjs", import.meta.url));

describe("demo payload chrome", () => {
  it("shows English titles, tags, excerpts, and paths for the demo library", () => {
    const leaks = JSON.parse(execFileSync(process.execPath, [scanner, vault], { encoding: "utf8" })) as string[];
    expect(leaks).toEqual([]);
    expect(demoTitleLabel("demo", "en", "杭州：职业机会与日常生活")).toBe("Hangzhou: career chances and everyday life");
    expect(demoTitleLabel("demo", "en", "南京：工程训练与离开")).toBe("Nanjing: engineering training and leaving");
    expect(demoTagLabel("demo", "en", "wiki/个人主线")).toBe("Wiki/Personal thread");
    expect(demoTagLabel("demo", "en", "系统/家庭系统")).toBe("System/Family system");
    expect(demoTagLabel("demo", "en", "来源/wiki")).toBe("Source/Wiki");
    expect(demoTagLabel("demo", "zh", "系统/家庭系统")).toBe("系统/家庭系统");
    expect(demoPathTooltip("demo", "en", "app/demo/sources/照片记忆/一张新城市餐桌的照片.md")).toBe("app/demo/sources/Photo memories/A photo of a table in the new city.md");
    const person = "wiki/07 人物与城市/人物/认识的人/工作/程工.md";
    const excerpt = demoListExcerpt("demo", "en", person, demoSeedExcerpts[person]!);
    expect(excerpt).toContain("Key evidence");
    expect(excerpt).toContain("Related");
    expect(excerpt).not.toMatch(/[\u3400-\u9fff]/);
    expect(desktopWindowTitle("Preferences", "The Way Here demo", "preferences")).toBe("Preferences · The Way Here demo");
    expect(desktopWindowTitle("Quick note", "The Way Here demo", "capture")).toBe("Quick note");
  });
});