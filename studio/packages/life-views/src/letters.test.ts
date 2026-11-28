import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { WikiIndex } from "@the-way-here/wiki-core";
import { buildLetters } from "./collections.js";

test("letter themes contain summaries and never repeat linked page bodies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-letters-"));
  try {
    await mkdir(path.join(root, "wiki/12 近况回信"), { recursive: true });
    await mkdir(path.join(root, "wiki/01 个人主线"), { recursive: true });
    await mkdir(path.join(root, "sources"));
    await writeFile(path.join(root, "wiki/01 个人主线/行动.md"), `# 行动\n\n${"匿名主题正文。".repeat(20_000)}`);
    for (const day of ["01", "02", "03"]) {
      await writeFile(path.join(root, `wiki/12 近况回信/2026-10-${day}.md`), `# 2026-10-${day} 回信\n\n[[行动]]\n\n[[不存在的主题]]`);
    }
    const index = new WikiIndex(root);
    await index.rebuild();
    const view = buildLetters(index);
    expect(view.letters).toHaveLength(3);
    expect(view.threads).toHaveLength(1);
    expect(view.threads[0]?.letters).toHaveLength(3);
    for (const letter of view.letters) {
      expect(letter.themes).toHaveLength(1);
      expect(letter.themes[0]).toMatchObject({ title: "行动", category: "personal-lines" });
      expect(letter.themes[0]).not.toHaveProperty("markdown");
      expect(letter.themes[0]).not.toHaveProperty("renderedMarkdown");
      expect(letter.themes[0]).not.toHaveProperty("sections");
      expect(letter.themes[0]).not.toHaveProperty("incomingLinks");
    }
    expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(20_000);
    expect(index.get(view.letters[0]!.themes[0]!.id)?.markdown).toContain("匿名主题正文。");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("letters carry the lens recorded in their frontmatter and stay silent when none was recorded", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-letters-lens-"));
  try {
    await mkdir(path.join(root, "wiki/12 近况回信"), { recursive: true });
    await mkdir(path.join(root, "sources"));
    const letters: Array<[string, string]> = [
      ["2026-10-01", "---\nlens: \"yanni\"\n---\n"],
      ["2026-10-02", "---\nlens_name: \"导师\"\n---\n"],
      ["2026-10-03", "---\nlens: \"\"\nlens_name: \" \"\n---\n"],
      ["2026-10-04", ""],
    ];
    for (const [day, frontmatter] of letters) await writeFile(path.join(root, `wiki/12 近况回信/${day}.md`), `${frontmatter}# ${day} 回信\n\n匿名回信正文。\n`);
    const index = new WikiIndex(root);
    await index.rebuild();
    const view = buildLetters(index);
    const lenses = Object.fromEntries(view.letters.map((letter) => [letter.letterDate, letter.lens]));
    expect(lenses).toEqual({ "2026-10-01": { id: "yanni" }, "2026-10-02": { name: "导师" }, "2026-10-03": undefined, "2026-10-04": undefined });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
