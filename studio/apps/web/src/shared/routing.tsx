import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { WikiPageSummary } from "@the-way-here/shared";

import { subscribeLiveRevision } from "./live-revision";
import { useDemoLabels, tr } from "./i18n";

export type ReturnContext = { returnTo: string; returnLabel: string };

export function useLiveRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeLiveRevision(() => setRevision((value) => value + 1)), []);
  return revision;
}

export function pageHref(id: string): string {
  return `/page/${id.split("/").map(encodeURIComponent).join("/")}`;
}

export function apiPageHref(id: string): string {
  return `/api/pages/${id.split("/").map(encodeURIComponent).join("/")}`;
}

export function pageDestination(page: Pick<WikiPageSummary, "id" | "category"> & { isSource?: boolean }): string {
  if (page.category === "letters") return `/letters?${new URLSearchParams({ letter: page.id })}`;
  return `${pageHref(page.id)}${page.isSource ? "?from=source" : ""}`;
}

function readerPageId(pathname: string): string {
  if (!pathname.startsWith("/page/")) return "";
  return pathname.slice("/page/".length).split("/").map((segment) => {
    try { return decodeURIComponent(segment); }
    catch { return segment; }
  }).join("/");
}

export function isSourceSectionPage(pathname: string, search: string, state: ReturnContext | null | undefined): boolean {
  if (!pathname.startsWith("/page/")) return false;
  const pageId = readerPageId(pathname);
  if (pageId === "sources" || pageId.startsWith("sources/")) return true;
  if (pageId === "wiki" || pageId.startsWith("wiki/")) return false;
  if (new URLSearchParams(search).get("from") === "source") return true;
  return Boolean(state?.returnTo.split("?")[0]?.startsWith("/sources"));
}

export function mentalModelHref(heading: string): string {
  return `/mental-models?${new URLSearchParams({ model: heading })}`;
}

export function returnContextFor(pathname: string, search = ""): ReturnContext {
  return { returnTo: `${pathname}${search}`, returnLabel: returnLabelForPath(pathname) };
}

export function useReturnContext(): ReturnContext {
  const location = useLocation();
  return { returnTo: `${location.pathname}${location.search}`, returnLabel: returnLabelForPath(location.pathname) };
}

export function PageLink({ page, className = "", children }: { page: WikiPageSummary; className?: string; children?: ReactNode }) {
  const returnContext = useReturnContext();
  const demo = useDemoLabels();
  return <NavLink data-overflow-tooltip="off" to={pageDestination(page)} state={returnContext} className={className}>{children || demo.title(page.title)}</NavLink>;
}

function returnLabelForPath(pathname: string): string {
  if (pathname === "/") return tr("返回此刻");
  if (pathname === "/questions" || pathname.startsWith("/focus/")) return tr("返回值得聊聊");
  if (pathname === "/insights") return tr("返回理解自己");
  if (pathname === "/timeline") return tr("返回人生轨迹");
  if (pathname === "/letters") return tr("返回近况回信");
  if (pathname === "/predict-self") return tr("返回看见未来");
  if (pathname === "/capture") return tr("返回随手记");
  if (pathname === "/relationships") return tr("返回人与世界");
  if (pathname === "/mental-models") return tr("返回思维模型");
  if (pathname.startsWith("/sources")) return tr("返回生活记录");
  if (pathname === "/knowledge") return tr("返回已有理解");
  if (pathname === "/search") return tr("返回搜索结果");
  if (pathname.startsWith("/cards/personal-lines")) return tr("返回个人主线");
  if (pathname.startsWith("/cards/cycles")) return tr("返回反复循环");
  if (pathname.startsWith("/cards/systems")) return tr("返回现实系统");
  if (pathname.startsWith("/page/")) return tr("返回上一篇内容");
  return tr("返回上一页");
}
