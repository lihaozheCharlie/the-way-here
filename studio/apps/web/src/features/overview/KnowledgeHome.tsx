import { UnderstandingDigest } from "../knowledge/UnderstandingDigest";
import { NavLink } from "react-router-dom";
import type { VaultInfo, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { openContextAgent } from "../collaboration/model";
import { Empty, Icon, Loading } from "../../shared/ui";
import { UnderstandingGlyph } from "../knowledge/UnderstandingLayout";
import { useDemoLabels, useI18n, tr } from "../../shared/i18n";

export function KnowledgeHome({ revision }: { revision: number }) {
  const { t } = useI18n();
  const demo = useDemoLabels();
  const { data: vault, loading, error } = useApi<VaultInfo>("/api/vault", revision);
  const { data: pages, loading: pagesLoading, error: pagesError } = useApi<WikiPageSummary[]>("/api/pages?sources=false", revision);
  if (loading) return <Loading label={t("正在整理已有理解")} />;
  if (error || !vault) return <Empty>{error ? t(error) : t("暂时无法读取知识库，请刷新重试。")}</Empty>;
  const selfCount = (vault.categories["personal-lines"] || 0) + (vault.categories.cycles || 0) + (vault.categories.systems || 0) + (vault.categories["mental-models"] || 0);
  const lifeCount = (vault.categories["life-stages"] || 0) + (vault.categories.events || 0);
  const letterCount = vault.categories.letters || 0;
  const peopleCount = (vault.categories.entities || 0) + (vault.categories["relationship-roles"] || 0);
  const groups = [
    { to: "/insights", tone: "self" as const, title: tr("理解自己"), description: tr("把个人主线、反复循环、现实系统与思维模型放在同一张判断地图里。"), count: selfCount, label: tr("条自我理解") },
    { to: "/timeline", tone: "life" as const, title: tr("人生轨迹"), description: tr("沿着阶段与转折，回到一段经历当时真实的处境。"), count: lifeCount, label: tr("个阶段与转折") },
    { to: "/letters", tone: "letter" as const, title: tr("近况回信"), description: tr("从过去的记录回望此刻，让当时的经历与现在重新发生联系。"), count: letterCount, label: tr("封近况回信") },
    { to: "/relationships", tone: "people" as const, title: tr("人与世界"), description: tr("看见具体的人，也看见一段关系在生命中长期承担的功能。"), count: peopleCount, label: tr("个人与关系页面") },
  ];
  return <div className="knowledge-home understanding-overview">
    <header className="understanding-overview-lede">
      <h1>{t("已有理解")}</h1>
      <p>{t("我目前这样理解你：关于你自己的判断、人生轨迹、近况回信，以及身边的人。不像就纠正我。")}</p>
      <span>{t("${pageCount} 条理解 · 来自 ${sourceCount} 份生活记录", { pageCount: vault.pageCount, sourceCount: vault.sourceCount })}</span>
    </header>
    <section className="understanding-entry-grid" aria-label={t("已有理解分类")}>
      {groups.map((group) => {
        const categories = group.tone === "self" ? ["personal-lines", "cycles", "systems", "mental-models"] : group.tone === "life" ? ["life-stages", "events"] : group.tone === "letter" ? ["letters"] : ["entities", "relationship-roles"];
        const latest = pages?.filter(page => categories.includes(page.category) && !page.title.includes("总览")).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))[0];
        return <NavLink className={`understanding-entry understanding-entry--${group.tone}`} to={group.to} key={group.to}>
          <header><UnderstandingGlyph tone={group.tone} size="small" /><h2>{t(group.title)}</h2><b aria-label={`${group.count} ${t(group.label)}`}>{group.count}</b></header>
          <p>{t(group.description)}</p>
          <div className="understanding-latest">{latest ? <><b>{t("最新：${title}", { title: demo.heading(latest.relativePath, latest.excerpt) || demo.title(latest.title) })}</b><p>{(latest.excerpt && demo.excerpt(latest.relativePath, latest.excerpt)) || t("打开分类，回到完整理解与来源。")}</p></> : <p>{pagesLoading ? t("正在读取最新理解…") : pagesError ? t("最新理解暂时无法读取，仍可打开分类。") : t("这类理解还在慢慢积累。")}</p>}</div>
          <footer>{t("查看全部")} <Icon name="arrow" size={15} /></footer>
        </NavLink>;
      })}
    </section>
    <section className="understanding-overview-foot">
      <div><h2>{t("这些理解会继续变化")}</h2><p>{t("新的生活记录可能补充证据，也可能让旧判断失效。你随时可以打开一条理解，说明哪里不像你。")}</p></div>
      <button type="button" onClick={() => openContextAgent({ mode: "read" })}><Icon name="spark" size={16} />{t("一起核对")}</button>
    </section>
    <details className="understanding-detail-disclosure"><summary>{t("展开自我理解摘要与校准")}</summary><UnderstandingDigest revision={revision} /></details>
    <PageAgentContext context={{ scope: tr("已有理解"), title: tr("已有理解总览"), summary: tr("当前有 ${vault.pageCount} 条已有理解，来自 ${vault.sourceCount} 份生活记录。", { "vault.pageCount": vault.pageCount, "vault.sourceCount": vault.sourceCount }), defaultMode: "read", suggestions: [tr("当前哪些理解证据最充分，哪些地方还需要我亲自补充？"), tr("结合最近更新的内容，现在最值得继续聊什么？")] }} />
  </div>;
}
