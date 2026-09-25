import { pageHref } from "../../shared/routing";

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };

const wikiCitation = /\(\s*\[\[([^\[\]\n]+)\]\]\s*\)|（\s*\[\[([^\[\]\n]+)\]\]\s*）|\[\[([^\[\]\n]+)\]\]/g;

export function citationPageId(raw: string): string | undefined {
  const target = raw.split("|")[0]?.split("#")[0]?.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!target) return undefined;
  const vaultRelative = /(?:^|\/)vault\/[^/]+\/(.+)$/.exec(target)?.[1];
  const pageId = (vaultRelative || target).replace(/\.md(?::\d+(?::\d+)?)?$/i, "").replace(/^\/+/, "");
  if (!pageId || pageId.split("/").some((part) => part === ".." || part === ".") || /[?#\0]/.test(pageId)) return undefined;
  return pageId;
}

export function citationFromHref(href: string | undefined): { pageId: string; fileName: string } | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, "http://local.invalid");
    if (url.origin !== "http://local.invalid" || !url.searchParams.has("agentCitation") || !url.pathname.startsWith("/page/")) return undefined;
    const pageId = decodeURIComponent(url.pathname.slice(6));
    return { pageId, fileName: url.searchParams.get("agentCitation") || pageId.split("/").at(-1) || pageId };
  } catch { return undefined; }
}

function citationNodes(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(wikiCitation)) {
    const raw = match[1] || match[2] || match[3] || "";
    const pageId = citationPageId(raw);
    if (!pageId) continue;
    if (match.index > cursor) nodes.push({ type: "text", value: value.slice(cursor, match.index) });
    const fileName = pageId.split("/").at(-1) || pageId;
    nodes.push({ type: "link", url: `${pageHref(pageId)}?${new URLSearchParams({ agentCitation: fileName })}`, children: [{ type: "text", value: "引用" }] });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes.length ? nodes : [{ type: "text", value }];
}

export function remarkAnswerCitations() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || ["link", "linkReference", "code", "inlineCode"].includes(node.type)) return;
      node.children = node.children.flatMap((child) => child.type === "text" && child.value?.includes("[[") ? citationNodes(child.value) : [child]);
      node.children.forEach(visit);
    };
    visit(tree);
  };
}
