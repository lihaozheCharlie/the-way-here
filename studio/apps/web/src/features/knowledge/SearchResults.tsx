import { FileListRow } from "../../shared/FileMenu";
import { Fragment } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import type { WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { graphCategoryNames } from "../../shared/categories";
import { PageLink } from "../../shared/routing";
import { Empty, Loading, PageHeader, SectionHeading } from "../../shared/ui";
import { useDemoLabels, useI18n } from "../../shared/i18n";

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
  const { t } = useI18n();
  const demo = useDemoLabels();
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const { data, loading, error } = useApi<WikiPageSummary[]>(`/api/search?q=${encodeURIComponent(query)}`, revision);
  if (loading) return <Loading label={t("正在知识与原始材料中寻找")} />;
  if (error || !data) return <Empty>{error ? t(error) : t("搜索暂时不可用，请刷新重试。")}</Empty>;
  const knowledge = data.filter((page) => !page.isSource);
  const sources = data.filter((page) => page.isSource);
  return (
    <div>
      <PageHeader title={`“${query}”`} description={t("找到 ${count} 项结果，已按构建知识与原始材料分组。", { count: data.length })} />
      {knowledge.length > 0 && <section className="search-group"><SectionHeading title={t("已有理解 · ${count}", { count: knowledge.length })} action={<NavLink to="/knowledge">{t("进入已有理解")}</NavLink>} /><div className="search-results">{knowledge.map((page) => <FileListRow key={page.id} page={page}><PageLink page={page} key={page.id} className="search-result"><small>{t(graphCategoryNames[page.category] || page.category)} · {demo.path(page.relativePath)}</small><h2><SearchHighlight text={demo.heading(page.relativePath, page.excerpt) || demo.title(page.title)} query={query} /></h2><p><SearchHighlight text={demo.excerpt(page.relativePath, page.excerpt)} query={query} /></p></PageLink></FileListRow>)}</div></section>}
      {sources.length > 0 && <section className="search-group"><SectionHeading title={t("生活记录 · ${count}", { count: sources.length })} action={<NavLink to="/sources">{t("查看全部生活记录")}</NavLink>} /><div className="search-results">{sources.map((page) => <FileListRow key={page.id} page={page}><PageLink page={page} key={page.id} className="search-result"><small>{t("生活记录")} · {demo.path(page.relativePath)}</small><h2><SearchHighlight text={demo.heading(page.relativePath, page.excerpt) || demo.title(page.title)} query={query} /></h2><p><SearchHighlight text={demo.excerpt(page.relativePath, page.excerpt)} query={query} /></p></PageLink></FileListRow>)}</div></section>}
      {!data.length && <Empty>{t("没有找到相关内容。换一个关键词，或者先带进一段新的生活记录。")}</Empty>}
    </div>
  );
}
