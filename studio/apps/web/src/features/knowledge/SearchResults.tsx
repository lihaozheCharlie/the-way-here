import { FileListRow } from "../../shared/FileMenu";
import { Fragment } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import type { WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { graphCategoryNames } from "../../shared/categories";
import { PageLink } from "../../shared/routing";
import { Empty, Loading, PageHeader, SectionHeading } from "../../shared/ui";

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const lower = text.toLocaleLowerCase(), search = needle.toLocaleLowerCase();
  const parts = []; let position = 0, found;
  while ((found = lower.indexOf(search, position)) >= 0) {
    parts.push(<Fragment key={position}>{text.slice(position, found)}<mark>{text.slice(found, found + needle.length)}</mark></Fragment>);
    position = found + needle.length;
  }
  return <>{parts}{text.slice(position)}</>;
}

export function SearchResults({ revision }: { revision: number }) {
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const { data, loading, error } = useApi<WikiPageSummary[]>(`/api/search?q=${encodeURIComponent(query)}`, revision);
  if (loading) return <Loading label="正在知识与原始材料中寻找" />;
  if (error || !data) return <Empty>{error || "搜索暂时不可用，请刷新重试。"}</Empty>;
  const knowledge = data.filter((page) => !page.isSource);
  const sources = data.filter((page) => page.isSource);
  return (
    <div>
      <PageHeader title={`“${query}”`} description={`找到 ${data.length} 项结果，已按构建知识与原始材料分组。`} />
      {knowledge.length > 0 && <section className="search-group"><SectionHeading title={`已有理解 · ${knowledge.length}`} action={<NavLink to="/knowledge">进入已有理解</NavLink>} /><div className="search-results">{knowledge.map((page) => <FileListRow key={page.id} page={page}><PageLink page={page} key={page.id} className="search-result"><small>{graphCategoryNames[page.category] || page.category}</small><h2><SearchHighlight text={page.title} query={query} /></h2><p><SearchHighlight text={page.excerpt} query={query} /></p></PageLink></FileListRow>)}</div></section>}
      {sources.length > 0 && <section className="search-group"><SectionHeading title={`生活记录 · ${sources.length}`} action={<NavLink to="/sources">查看全部生活记录</NavLink>} /><div className="search-results">{sources.map((page) => <FileListRow key={page.id} page={page}><PageLink page={page} key={page.id} className="search-result"><small>生活记录 · {page.relativePath}</small><h2><SearchHighlight text={page.title} query={query} /></h2><p><SearchHighlight text={page.excerpt} query={query} /></p></PageLink></FileListRow>)}</div></section>}
      {!data.length && <Empty>没有找到相关内容。换一个关键词，或者先带进一段新的生活记录。</Empty>}
    </div>
  );
}
