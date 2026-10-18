import type { CaptureOutputTarget, WikiPageSummary } from "@the-way-here/shared";

const relationshipGroups = [
  ["leader", "领导", "上级", "直属", "主管", "老板", "汇报"],
  ["同事", "同组", "组里", "团队"],
  ["同学", "室友", "老师", "导师"],
  ["爸爸", "父亲", "妈妈", "母亲", "家人", "亲戚"],
  ["朋友", "好友", "闺蜜", "发小"],
  ["妻子", "丈夫", "爱人", "伴侣", "女友", "男友"],
];
const safeName = (name: string) => name.trim().length >= 2 && !/[\[\]|\n]/.test(name) && !["自己", "本人", "我们", "他们", ...relationshipGroups.flat()].includes(name.toLowerCase());

type Binding = NonNullable<CaptureOutputTarget["entityLinks"]>[number];
/** Freeze exact names and bounded relationship evidence; the model resolves contextual identities. */
export function diaryEntityLinks(text: string, pages: WikiPageSummary[], readEntity?: (id: string) => string | undefined): Binding[] {
  const relationshipTerms = relationshipGroups.filter(group => group.some(term => text.toLowerCase().includes(term))).flat();
  const owners = new Map<string, Set<string>>();
  const entities = pages.filter(page => !page.isSource && page.category === "entities");
  for (const page of entities) for (const name of [page.title, ...page.aliases]) {
    if (!safeName(name)) continue;
    const ids = owners.get(name) || new Set<string>(); ids.add(page.id); owners.set(name, ids);
  }
  return entities.flatMap(page => {
    const uniqueNames = [...new Set([page.title, ...page.aliases])].filter(name => owners.get(name)?.size === 1);
    const exactNames = uniqueNames.filter(name => text.includes(name));
    const body = relationshipTerms.length ? readEntity?.(page.id) ?? page.excerpt ?? "" : "";
    const relationshipContext = body.split(/\n\s*\n/).filter(block => relationshipTerms.some(term => block.toLowerCase().includes(term))).slice(0, 3).map(block => {
      const lower = block.toLowerCase();
      const offset = Math.min(...relationshipTerms.map(term => lower.indexOf(term)).filter(index => index >= 0));
      const start = Math.max(0, offset - 180);
      return block.slice(start, start + 600).trim();
    }).join("\n\n");
    if ((!exactNames.length && !relationshipContext) || !uniqueNames.length || /[\[\]|\n]/.test(page.id)) return [];
    return [{ pageId: page.id, title: page.title, matchedNames: relationshipContext ? uniqueNames : exactNames,
      ...(relationshipContext ? { relationshipContext } : {}),
      ...(owners.get(page.title)?.size !== 1 ? { titleIsAmbiguous: true } : {}) }];
  }).sort((a, b) => Number(b.matchedNames.some(name => text.includes(name))) - Number(a.matchedNames.some(name => text.includes(name)))).slice(0, 80);
}

/** Enforce the frozen identity set at save time, including when a model invents a link. */
export function linkDiaryEntities(markdown: string, bindings: Binding[]): string {
  const names = new Map<string, string>();
  const owners = new Map<string, Set<string>>();
  for (const binding of bindings) for (const name of [...binding.matchedNames, ...(binding.titleIsAmbiguous ? [] : [binding.title])]) {
    if (!safeName(name)) continue;
    const ids = owners.get(name) || new Set<string>(); ids.add(binding.pageId); owners.set(name, ids);
  }
  for (const [name, ids] of owners) if (ids.size === 1) names.set(name, [...ids][0]!);
  const pattern = [...names.keys()].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const mention = pattern ? new RegExp(pattern, "g") : undefined;
  // Protect existing Markdown/code; only allow Wiki links to the matched entities.
  return markdown.split(/(```[\s\S]*?```|`[^`\n]*`|\[\[[^\]\n]+\]\]|!?\[[^\]\n]*\]\([^\n)]*\))/g).map((part, index) => {
    if (index % 2) {
      if (!part.startsWith("[[")) return part;
      const [target, label = target] = part.slice(2, -2).split("|");
      const binding = bindings.find(item => item.pageId === target && names.get(label!) === target);
      return binding ? part : label!;
    }
    return mention ? part.replace(mention, name => `[[${names.get(name)}|${name}]]`) : part;
  }).join("");
}
