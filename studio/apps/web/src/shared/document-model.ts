export type MarkdownOutlineItem = { id: string; label: string; level: number; line: number };

export function shouldEnterDocumentEditMode({ clickCount, insideControl }: { clickCount: number; insideControl: boolean }): boolean {
  return clickCount === 2 && !insideControl;
}

export function documentHeadingPrefix(pageId: string): string {
  return `document-${pageId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function markdownOutline(markdown: string, headingPrefix: string): MarkdownOutlineItem[] {
  const items: MarkdownOutlineItem[] = [];
  let inFence = false;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const label = match[2]!
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_~`]/g, "")
      .trim();
    if (!label) continue;
    items.push({ id: `${headingPrefix}-heading-${items.length}`, label, level: match[1]!.length, line: index + 1 });
  }
  return items;
}

export function markdownWithoutFrontmatter(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown);
  return match ? markdown.slice(match[0].length).trimStart() : markdown;
}

function markdownDocumentParts(markdown: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown);
  return match ? { frontmatter: match[0], body: markdown.slice(match[0].length) } : { frontmatter: "", body: markdown };
}

export function editableMarkdownDocument(markdown: string, isSource: boolean): { prefix: string; body: string } {
  const { frontmatter, body } = markdownDocumentParts(markdown);
  if (!isSource) return { prefix: frontmatter, body };
  const legacyTitle = /^(?:[ \t]*\r?\n)*#\s+[^\r\n]*(?:\r?\n|$)(?:[ \t]*\r?\n)?/.exec(body);
  return legacyTitle
    ? { prefix: `${frontmatter}${legacyTitle[0]}`, body: body.slice(legacyTitle[0].length) }
    : { prefix: frontmatter, body };
}

export function markdownWithoutSourceRelations(markdown: string): string {
  const result: string[] = [];
  let hiddenLevel = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading && hiddenLevel && heading[1]!.length <= hiddenLevel) hiddenLevel = 0;
    if (heading && /^(相关日记|关联)$/.test(heading[2]!.trim())) {
      hiddenLevel = heading[1]!.length;
      continue;
    }
    if (!hiddenLevel) result.push(line);
  }
  return result.join("\n").trimEnd();
}

export function documentIdentity(relativePath: string): { folder: string; fileName: string } {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = (parts.pop() || "未命名.md").replace(/\.(md|txt)$/i, "");
  const logicalRoot = parts.findIndex((part) => /^(wiki|原始知识库|sources?)$/i.test(part));
  const logicalParts = logicalRoot >= 0 ? parts.slice(logicalRoot + 1) : parts;
  return { folder: logicalParts.join(" / ") || "知识库", fileName };
}
