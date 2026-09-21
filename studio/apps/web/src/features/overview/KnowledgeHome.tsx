import { UnderstandingDigest } from "../knowledge/UnderstandingDigest";
import { NavLink } from "react-router-dom";
import type { VaultInfo, WikiPageSummary } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { openContextAgent } from "../collaboration/model";
import { Empty, Icon, Loading } from "../../shared/ui";
import { UnderstandingGlyph } from "../knowledge/UnderstandingLayout";

export function KnowledgeHome({ revision }: { revision: number }) {
  const { data: vault, loading, error } = useApi<VaultInfo>("/api/vault", revision);
  const { data: pages, loading: pagesLoading, error: pagesError } = useApi<WikiPageSummary[]>("/api/pages?sources=false", revision);
  if (loading) return <Loading label="正在整理已有理解" />;
  if (error || !vault) return <Empty>{error || "暂时无法读取知识库，请刷新重试。"}</Empty>;
  const selfCount = (vault.categories["personal-lines"] || 0) + (vault.categories.cycles || 0) + (vault.categories.systems || 0) + (vault.categories["mental-models"] || 0);
  const lifeCount = (vault.categories["life-stages"] || 0) + (vault.categories.events || 0);
  const letterCount = vault.categories.letters || 0;
  const peopleCount = (vault.categories.entities || 0) + (vault.categories["relationship-roles"] || 0);
  const groups = [
    { to: "/insights", tone: "self" as const, title: "理解自己", description: "把个人主线、反复循环、现实系统与思维模型放在同一张判断地图里。", count: selfCount, label: "条自我理解" },
    { to: "/timeline", tone: "life" as const, title: "人生轨迹", description: "沿着阶段与转折，回到一段经历当时真实的处境。", count: lifeCount, label: "个阶段与片段" },
    { to: "/letters", tone: "letter" as const, title: "近况回信", description: "从过去的记录回望此刻，让当时的经历与现在重新发生联系。", count: letterCount, label: "封近况回信" },
    { to: "/relationships", tone: "people" as const, title: "人与世界", description: "看见具体的人，也看见一段关系在生命中长期承担的功能。", count: peopleCount, label: "个人与关系页面" },
  ];
  return <div className="knowledge-home understanding-overview">
    <header className="understanding-overview-lede">
      <h1>已有理解</h1>
      <p>这里汇总系统从你的生活记录中持续读出的理解：关于你自己的判断、人生轨迹、近况回信，以及关于身边人与关系的记录。</p>
      <span>{vault.pageCount} 条理解 · 来自 {vault.sourceCount} 份生活记录</span>
    </header>
    <section className="understanding-entry-grid" aria-label="已有理解分类">
      {groups.map((group) => {
        const categories = group.tone === "self" ? ["personal-lines", "cycles", "systems", "mental-models"] : group.tone === "life" ? ["life-stages", "events"] : group.tone === "letter" ? ["letters"] : ["entities", "relationship-roles"];
        const latest = pages?.filter(page => categories.includes(page.category) && !page.title.includes("总览")).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))[0];
        return <NavLink className={`understanding-entry understanding-entry--${group.tone}`} to={group.to} key={group.to}>
          <header><UnderstandingGlyph tone={group.tone} size="small" /><h2>{group.title}</h2><b aria-label={`${group.count} ${group.label}`}>{group.count}</b></header>
          <p>{group.description}</p>
          <div className="understanding-latest">{latest ? <><b>最新：{latest.title}</b><p>{latest.excerpt || "打开分类，回到完整理解与来源。"}</p></> : <p>{pagesLoading ? "正在读取最新理解…" : pagesError ? "最新理解暂时无法读取，仍可打开分类。" : "这类理解还在慢慢积累。"}</p>}</div>
          <footer>查看全部 <Icon name="arrow" size={15} /></footer>
        </NavLink>;
      })}
    </section>
    <section className="understanding-overview-foot">
      <div><h2>这些理解会继续变化</h2><p>新的生活记录可能补充证据，也可能让旧判断失效。你随时可以打开一条理解，说明哪里不像你。</p></div>
      <button type="button" onClick={() => openContextAgent({ mode: "read" })}><Icon name="spark" size={16} />一起核对</button>
    </section>
    <details className="understanding-detail-disclosure"><summary>展开自我理解摘要与校准</summary><UnderstandingDigest revision={revision} /></details>
    <PageAgentContext context={{ scope: "已有理解", title: "已有理解总览", summary: `当前有 ${vault.pageCount} 条已有理解，来自 ${vault.sourceCount} 份生活记录。`, defaultMode: "read", suggestions: ["当前哪些理解证据最充分，哪些地方还需要我亲自补充？", "结合最近更新的内容，现在最值得继续聊什么？"] }} />
  </div>;
}
