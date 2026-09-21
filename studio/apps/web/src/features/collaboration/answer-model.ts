// Split only explicit Markdown section headings; never infer updates from prose or code.
export function splitWikiUpdate(answer: string): { prose: string; wiki?: string } {
  const lines = answer.split("\n");
  let fence = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const code = line.match(/^\s*(`{3,}|~{3,})/);
    if (code) { if (!fence) fence = code[1]!; else if (code[1]![0] === fence[0] && code[1]!.length >= fence.length) fence = ""; continue; }
    if (fence) continue;
    const heading = line.trim().match(/^(#{1,6}\s+|\*\*)(?:关于\s*)?Wiki\s*(?:更新|处理|写回|沉淀)(?:\s|[：:·—（(]|\*\*|$)/i);
    if (!heading) continue;
    const depth = heading[1]!.trim().startsWith("#") ? heading[1]!.trim().length : 6;
    let end = lines.length;
    let nestedFence = "";
    for (let next = index + 1; next < lines.length; next += 1) {
      const marker = lines[next]!.match(/^\s*(`{3,}|~{3,})/);
      if (marker) { if (!nestedFence) nestedFence = marker[1]!; else if (marker[1]![0] === nestedFence[0] && marker[1]!.length >= nestedFence.length) nestedFence = ""; continue; }
      if (nestedFence) continue;
      const following = lines[next]!.match(/^(#{1,6})\s+/);
      if (following && following[1]!.length <= depth) { end = next; break; }
    }
    return { prose: [...lines.slice(0, index), ...lines.slice(end)].join("\n").trim(), wiki: lines.slice(index, end).join("\n").trim() };
  }
  return { prose: answer };
}

export function wikiUpdateFields(markdown: string): string[] {
  const fields: string[] = [];
  let current: string[] = [];
  let fence = "";
  const lines = markdown.split("\n");
  if (/^(?:#{1,6}\s+|\*\*)Wiki\s*(?:更新|处理|写回|沉淀)(?:\*\*)?\s*$/i.test(lines[0]?.trim() || "")) lines.shift();
  for (const line of lines) {
    const code = line.match(/^\s*(`{3,}|~{3,})/);
    if (code) { if (!fence) fence = code[1]!; else if (code[1]![0] === fence[0] && code[1]!.length >= fence.length) fence = ""; }
    if (!fence && /^#{3,6}\s+/.test(line) && current.some((entry) => entry.trim())) { fields.push(current.join("\n")); current = []; }
    current.push(line);
  }
  if (current.length) fields.push(current.join("\n"));
  return fields;
}
