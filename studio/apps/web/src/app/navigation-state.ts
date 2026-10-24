import { navigation } from "./config";

const knowledgeChildren = navigation.find((item) => item.to === "/knowledge")?.children ?? [];

export type LoadedReader = { pageId: string; isSource: boolean; category: string };

export function pageIdFromPathname(pathname: string): string {
  if (!pathname.startsWith("/page/")) return "";
  return pathname.slice("/page/".length).split("/").map((segment) => {
    try { return decodeURIComponent(segment); }
    catch { return segment; }
  }).join("/");
}

function pathOnly(value: string | undefined): string {
  return value?.split("?")[0] || "";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  if (!pathname || prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

/** Which sidebar section a full-page reader belongs to, before and after the page loads. */
export function isSourceDocument(pathname: string, loaded: LoadedReader | undefined, returnTo?: string, search = ""): boolean {
  if (!pathname.startsWith("/page/")) return false;
  const pageId = pageIdFromPathname(pathname);
  if (loaded?.pageId === pageId) return loaded.isSource;
  if (pageId === "sources" || pageId.startsWith("sources/")) return true;
  if (pageId === "wiki" || pageId.startsWith("wiki/")) return false;
  if (new URLSearchParams(search).get("from") === "source") return true;
  return pathOnly(returnTo).startsWith("/sources");
}

export function understandingSectionForCategory(category: string): string {
  if (["personal-lines", "cycles", "systems", "mental-models"].includes(category)) return "/insights";
  if (["life-stages", "events"].includes(category)) return "/timeline";
  if (category === "letters") return "/letters";
  if (["entities", "relationship-roles"].includes(category)) return "/relationships";
  return "/knowledge";
}

/** Subnav target while reading a wiki page. Arrival path wins over the page category. */
export function activeKnowledgeChild(pathname: string, returnTo: string | undefined, loaded: LoadedReader | undefined): string | undefined {
  if (!pathname.startsWith("/page/") || isSourceDocument(pathname, loaded, returnTo)) return undefined;
  const fromReturn = knowledgeChildren.find((child) => child.active.some((prefix) => matchesPrefix(pathOnly(returnTo), prefix)));
  if (fromReturn) return fromReturn.to;
  const pageId = pageIdFromPathname(pathname);
  if (!loaded || loaded.pageId !== pageId) return undefined;
  return understandingSectionForCategory(loaded.category);
}
