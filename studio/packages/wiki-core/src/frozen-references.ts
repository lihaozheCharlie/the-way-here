import { extractSections, extractWikiLinks } from "./markdown.js";

export interface FrozenSourceReference { path: string; title: string; markdown: string }
/** Mechanical citation boundary for frozen-source products; does not judge the author's interpretation. */
export function validateFrozenSourceReferences(text: string, pages: FrozenSourceReference[]): FrozenSourceReference[] {
  const canonical = (value: string) => value.replace(/\.md$/i, "");
  const targets = new Map(pages.map(page => [canonical(page.path), page]));
  // Shared letter output uses Wiki links. Reject alternate destinations rather than silently ignoring them.
  if (/\]\s*\(|<(?:a|img)\b|\b(?:href|src)\s*=|<(?:https?|file):/i.test(text)) throw new Error("回信只能使用冻结来源的 Wiki 链接，不能包含其他链接或附件");
  if ((text.match(/\[\[/g) || []).length !== extractWikiLinks(text).length) throw new Error("回信包含不完整或伪造的来源链接");
  const used = new Map<string, FrozenSourceReference>();
  for (const link of extractWikiLinks(text)) {
    const page = targets.get(canonical(link.target));
    if (!page || /(?:^|\/)\.{1,2}(?:\/|$)|\\|%[a-f\d]{2}/i.test(link.target)) throw new Error("回信引用了冻结范围之外或无法识别的来源");
    const anchor = link.raw.slice(2, -2).split("|", 1)[0]!.split("#").slice(1).join("#").trim();
    if (anchor && !(anchor.startsWith("^") ? page.markdown.split("\n").some(line => line.trim().endsWith(" " + anchor) || line.trim() === anchor) : extractSections(page.markdown).some(section => section.heading === anchor))) throw new Error("回信引用的来源段落在冻结原文中不存在");
    if (link.raw.includes("|") && link.label !== page.title) throw new Error("回信的来源标签与冻结来源不一致");
    used.set(page.path, page);
  }
  if (!used.size) throw new Error("回信未列出可核对的冻结来源引用");
  // Block quotes and explicitly quoted words must be continuous original text in a source actually cited.
  // This is the same exact-substring boundary used by structured prediction evidence, without semantic inference.
  const withoutLinks = text.replace(/\[\[[\s\S]*?\]\]/g, "");
  const quotes = [...withoutLinks.matchAll(/^\s*>\s?(.+)$/gm)].map(match => match[1]!.trim())
    .concat([...withoutLinks.matchAll(/“([^”\n]+)”|「([^」\n]+)」|"([^"\n]+)"/g)].map(match => (match[1] || match[2] || match[3])!.trim()));
  for (const quote of quotes) {
    if (quote && ![...used.values()].some(page => page.markdown.includes(quote))) throw new Error("回信引文不是所引用冻结来源中的连续原话");
  }
  return [...used.values()];
}
