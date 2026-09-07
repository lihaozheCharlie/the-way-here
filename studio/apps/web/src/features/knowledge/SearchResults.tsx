import { NavLink, useSearchParams } from "react-router-dom";
import type { WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { graphCategoryNames } from "../../shared/categories";
import { PageLink } from "../../shared/routing";
import { Empty, Loading, PageHeader, SectionHeading } from "../../shared/ui";

export function SearchResults({ revision }: { revision: number }) {
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const { data, loading } = useApi<WikiPageSummary[]>(`/api/search?q=${encodeURIComponent(query)}`, revision);
  if (loading || !data) return <Loading label="正在知识与原始材料中寻找" />;
  const knowledge = data.filter((page) => !page.isSource);
  const sources = data.filter((page) => page.isSource);
  return (
    <div>
      <PageHeader title={`“${query}”`} description={`找到 ${data.length} 项结果，已按构建知识与原始材料分组。`} />
      {knowledge.length > 0 && <section className="search-group"><SectionHeading title={`已有理解 · ${knowledge.length}`} action={<NavLink to="/knowledge">进入已有理解</NavLink>} /><div className="search-results">{knowledge.map((page) => <PageLink page={page} key={page.id} className="search-result"><small>{graphCategoryNames[page.category] || page.category}</small><h2>{page.title}</h2><p>{page.excerpt}</p></PageLink>)}</div></section>}
      {sources.length > 0 && <section className="search-group"><SectionHeading title={`生活记录 · ${sources.length}`} action={<NavLink to="/sources">查看全部生活记录</NavLink>} /><div className="search-results">{sources.map((page) => <PageLink page={page} key={page.id} className="search-result"><small>生活记录 · {page.relativePath}</small><h2>{page.title}</h2><p>{page.excerpt}</p></PageLink>)}</div></section>}
      {!data.length && <Empty>没有找到相关内容。换一个关键词，或者先带进一段新的生活记录。</Empty>}
    </div>
  );
}
