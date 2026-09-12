import { NavLink, useParams } from "react-router-dom";
import type { FocusWorkspaceView, GraphData } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { graphCategoryNames } from "../../shared/categories";
import { PageLink, pageHref, useReturnContext } from "../../shared/routing";
import { Empty, Loading, PageHero, ParentBack, SectionHeading } from "../../shared/ui";
import { signalConversationPrompt } from "./talking-questions";

const evidenceKindLabels = { source: "原始证据", letter: "回信回应", event: "事件记录", wiki: "已有判断" } as const;

function ContextGraph({ data }: { data: GraphData }) {
  const returnContext = useReturnContext();
  const focus = data.nodes.find((node) => node.id === data.focusId) || data.nodes[0];
  const others = data.nodes.filter((node) => node.id !== focus?.id).slice(0, 28);
  const positions = new Map<string, { x: number; y: number }>();
  if (focus) positions.set(focus.id, { x: 320, y: 210 });
  others.forEach((node, index) => {
    const ring = index < 10 ? 1 : 2;
    const ringItems = ring === 1 ? Math.min(10, others.length) : Math.max(others.length - 10, 1);
    const ringIndex = ring === 1 ? index : index - 10;
    const angle = (Math.PI * 2 * ringIndex) / ringItems - Math.PI / 2;
    const radius = ring === 1 ? 108 : 178;
    positions.set(node.id, { x: 320 + Math.cos(angle) * radius, y: 210 + Math.sin(angle) * radius });
  });
  const shown = new Set([focus?.id, ...others.map((node) => node.id)].filter(Boolean));
  return <div className="context-graph">
    <svg viewBox="0 0 640 420" role="img" aria-labelledby="context-graph-title">
      <title id="context-graph-title">当前问题与相关知识页面之间的局部关系</title>
      <g className="graph-links">{data.links.filter((link) => shown.has(link.source) && shown.has(link.target)).map((link) => {
        const source = positions.get(link.source); const target = positions.get(link.target);
        return source && target ? <line key={`${link.source}-${link.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} /> : null;
      })}</g>
      <g>{[focus, ...others].filter(Boolean).map((node) => {
        const position = positions.get(node!.id)!;
        const isFocus = node!.id === focus?.id;
        return <g key={node!.id} className={`context-graph-node ${isFocus ? "focus" : ""}`} transform={`translate(${position.x} ${position.y})`}>
          <circle r={isFocus ? 27 : 8} />
          <text textAnchor="middle" y={isFocus ? 45 : 22}>{node!.title.slice(0, isFocus ? 12 : 8)}</text>
        </g>;
      })}</g>
    </svg>
    <div className="context-graph-list" aria-label="局部关系的可访问列表">{others.slice(0, 12).map((node) => <NavLink key={node.id} to={pageHref(node.id)} state={returnContext}><span>{graphCategoryNames[node.category] || node.category}</span><b>{node.title}</b></NavLink>)}</div>
  </div>;
}

export function FocusWorkspace({ revision }: { revision: number }) {
  const { signalId = "" } = useParams();
  const { data, loading, error } = useApi<FocusWorkspaceView>(`/api/views/focus/${encodeURIComponent(signalId)}`, revision);
  if (loading) return <Loading label="正在把当前问题与证据放到一起" />;
  if (error || !data) return <Empty>{error || "当前没有可展开的问题"}</Empty>;
  const sourceEvents = data.evidenceTimeline.filter((item) => item.kind === "source" || item.kind === "event");
  return <div className="focus-workspace">
    <ParentBack to="/questions" label="返回值得聊聊" />
    <PageHero title={data.signal.name} description={data.signal.judgment} tone="tinted" className="focus-page-hero" aside={<div className="page-hero-rationale"><b>为什么是现在</b><p>{data.signal.reason}</p><span>{data.signal.kind}</span></div>} />
    <nav className="focus-switcher" aria-label="切换当前问题">{data.candidates.map((candidate) => <NavLink key={candidate.id} className={candidate.id === data.signal.id ? "active" : ""} to={`/focus/${encodeURIComponent(candidate.id)}`}><b>{candidate.name}</b><small>{candidate.kind}</small></NavLink>)}</nav>
    <section className="epistemic-board" aria-label="证据、当前理解与仍然未知">
      <article className="evidence"><span>事实证据</span><b>{sourceEvents.length ? `${sourceEvents.length} 条可追溯材料` : "暂未找到直接原始材料"}</b><p>{sourceEvents[0]?.excerpt || "这不等于没有发生，只表示当前知识系统还缺少可追溯证据。"}</p></article>
      <article className="judgment"><span>现在的理解</span><b>{data.signal.judgment}</b><p>这只是一个仍在验证的观察，可以被新的经历和反例修正。</p></article>
      <article className="unknown"><span>还不知道</span><b>{data.signal.observation || "还没有找到最值得继续观察的地方"}</b><p>它需要回到生活里继续看，不是已经成立的结论。</p></article>
    </section>
    <div className="focus-workspace-grid">
      <section className="evidence-history"><SectionHeading title="证据怎样变化" />{data.evidenceTimeline.length ? <ol>{data.evidenceTimeline.map((item) => <li key={`${item.page.id}-${item.kind}`}><time>{item.date.slice(0, 10)}</time><i /><div><span>{evidenceKindLabels[item.kind]}</span><PageLink page={item.page}>{item.label}</PageLink><p>{item.excerpt}</p></div></li>)}</ol> : <Empty>相关页面已经找到，但还没有可排序的证据切片。</Empty>}</section>
      <aside className="focus-relations"><SectionHeading title="它连接到什么" />{data.related.map((group) => <section key={group.category}><h3>{group.label}<span>{group.pages.length}</span></h3>{group.pages.map((page) => <PageLink key={page.id} page={page}><b>{page.title}</b><small>{page.excerpt}</small></PageLink>)}</section>)}</aside>
    </div>
    <section className="local-graph-section"><SectionHeading title="这件事在知识系统里的位置" /><p>只显示与当前问题相距两步以内的页面；下方列表是同一关系的可访问入口。</p><ContextGraph data={data.graph} /></section>
    <PageAgentContext context={{ scope: `值得聊聊 · ${data.signal.name}`, title: data.signal.judgment, summary: `仍在观察：${data.signal.observation}。相关上下文：${data.related.map((group) => `${group.label} ${group.pages.map((page) => page.title).join("、")}`).join("；")}`, defaultMode: "read", suggestions: [signalConversationPrompt(data.signal), `我觉得关于“${data.signal.name}”的理解不完全符合我。请先让我说明哪里不准确，再一起找反例。`, "基于当前证据，给我设计一个未来两周可观察、但不会制造额外压力的验证方式。"] }} />
  </div>;
}
