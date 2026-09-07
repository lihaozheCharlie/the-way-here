import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import type { SectionedPageView, StructuredCard } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { openContextAgent } from "../collaboration/model";
import { Empty, Icon, Loading } from "../../shared/ui";
import { insightCardDetail, insightCoreJudgment, insightExcerpt, insightSectionText, mentalModelPanels } from "./insights-model";

type InsightSectionKind = "line" | "cycle" | "system" | "model";

function InsightSectionMark({ kind }: { kind: InsightSectionKind }) {
  return <span className={`insights-section-mark insights-section-mark--${kind}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none">
      {kind === "line" ? <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>
        : kind === "cycle" ? <><path d="M17 4h4v4" /><path d="M20 8a8 8 0 0 0-14-2M7 20H3v-4" /><path d="M4 16a8 8 0 0 0 14 2" /></>
          : kind === "system" ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>
            : <><path d="M9.5 3a4 4 0 0 0-3.8 5.2A4 4 0 0 0 5 15v1.5A3.5 3.5 0 0 0 8.5 20h1" /><path d="M14.5 3a4 4 0 0 1 3.8 5.2A4 4 0 0 1 19 15v1.5a3.5 3.5 0 0 1-3.5 3.5h-1M9.5 20h5" /></>}
    </svg>
  </span>;
}

function insightItemHref(route: { to: string; key: string }, item: { id: string }): string {
  return route.key === "mental-models" ? route.to : `${route.to}?item=${encodeURIComponent(item.id)}`;
}

export function GrowthHub({ revision }: { revision: number }) {
  const personalLines = useApi<StructuredCard[]>("/api/views/cards/personal-lines", revision);
  const cycles = useApi<StructuredCard[]>("/api/views/cards/cycles", revision);
  const systems = useApi<StructuredCard[]>("/api/views/cards/systems", revision);
  const models = useApi<SectionedPageView>("/api/views/mental-models", revision);
  const [expandedLines, setExpandedLines] = useState<Set<string>>(() => new Set());
  const [expandedCycles, setExpandedCycles] = useState<Set<string>>(() => new Set());
  const [selectedSystemId, setSelectedSystemId] = useState("");
  const [modelViews, setModelViews] = useState<Record<string, "summary" | "calibration">>({});
  if (personalLines.loading || cycles.loading || systems.loading || models.loading) return <Loading label="正在把经历整理成可用的理解路径" />;
  const modelSections = models.data?.sections.filter((section) => /^[一二三四五六七]、/.test(section.heading)) || [];
  const routes: Array<{ to: string; key: string; title: string; note: string; items: StructuredCard[] }> = [
    { to: "/cards/personal-lines", key: "personal-lines", title: "个人主线", note: "这一生反复在解决什么，以及它怎样穿过不同阶段", items: personalLines.data || [] },
    { to: "/cards/cycles", key: "cycles", title: "反复循环", note: "看见触发、惯性反应、代价与真实有效的中断方式", items: cycles.data || [] },
    { to: "/cards/systems", key: "systems", title: "现实系统", note: "职业、家庭、身体、资产、注意力与表达怎样共同运行", items: systems.data || [] },
    { to: "/mental-models", key: "mental-models", title: "思维模型", note: "带着边界、反例和校准使用的判断工具", items: modelSections.map((section, index) => ({ id: String(index), title: section.heading.replace(/^[一二三四五六七]、/, ""), excerpt: insightExcerpt(section.body, 120), sections: [{ heading: "模型说明", body: section.body }] })) },
  ];
  const total = routes.reduce((sum, route) => sum + route.items.length, 0);
  const datedItems = routes.flatMap((route) => route.items.map((item) => ({ ...item, route }))).filter((item) => item.updatedAt).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const focus = datedItems[0] || routes.flatMap((route) => route.items.map((item) => ({ ...item, route })))[0];
  const focusHref = focus ? insightItemHref(focus.route, focus) : "/insights";
  const lineRoute = routes[0]!;
  const cycleRoute = routes[1]!;
  const systemRoute = routes[2]!;
  const modelRoute = routes[3]!;
  const selectedSystem = systemRoute.items.find((item) => item.id === selectedSystemId);
  const leadingCycle = cycleRoute.items[0];
  const cycleStages = leadingCycle ? [
    { heading: "常见触发", label: "触发" },
    { heading: "惯性反应", label: "惯性反应" },
    { heading: "代价", label: "代价" },
    { heading: "中断点", label: "有效中断" },
  ].map((stage) => ({ ...stage, text: insightExcerpt(insightSectionText(leadingCycle, stage.heading) || leadingCycle.excerpt, 42) })) : [];
  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => setter((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <div className="growth-hub understanding-self-page">
    <header className="insights-page-head">
      <div><h1>理解自己</h1><p>这里不是一组给你下结论的标签，而是能够回到经历、证据与反例继续修正的判断。先看结论，再决定要不要展开证据。</p></div>
      <div className="insights-head-stat"><b>{new Intl.NumberFormat("zh-CN").format(total)}</b><span>条判断与模型</span></div>
    </header>

    <nav className="insights-quick-jump" aria-label="快速跳转到理解分类">
      {[
        { href: "#insights-lines", kind: "line" as const, route: lineRoute },
        { href: "#insights-cycles", kind: "cycle" as const, route: cycleRoute },
        { href: "#insights-systems", kind: "system" as const, route: systemRoute },
        { href: "#insights-models", kind: "model" as const, route: modelRoute },
      ].map(({ href, kind, route }) => <a href={href} className={`is-${kind}`} key={href}><InsightSectionMark kind={kind} />{route.title} · {route.items.length}</a>)}
    </nav>

    {focus ? <section className="insights-spotlight" aria-labelledby="insights-spotlight-title">
      <div className="insights-spotlight-glyph" aria-hidden="true"><svg viewBox="0 0 168 168" fill="none"><circle cx="84" cy="84" r="78" stroke="currentColor" strokeDasharray="3 6" /><circle cx="84" cy="84" r="56" stroke="currentColor" /><circle cx="84" cy="84" r="32" /><path d="M84 84V51M84 84l28 12" /><circle cx="84" cy="84" r="4" /><circle cx="84" cy="51" r="4" /><circle cx="112" cy="96" r="4" /></svg></div>
      <div className="insights-spotlight-copy"><span>最近变化 · {focus.route.title}</span><h2 id="insights-spotlight-title">{focus.title}</h2><p>{insightExcerpt(insightCardDetail(focus, ["核心判断", "系统目标", "循环定义", "模型说明"]), 150)}</p><div>{focus.sections.slice(0, 3).map((section) => <span key={section.heading}>{section.heading}</span>)}{!focus.sections.length ? <span>可继续核对证据</span> : null}</div></div>
      <NavLink className="insights-spotlight-action" to={focusHref} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看完整推理 <Icon name="arrow" size={15} /></NavLink>
    </section> : null}

    <section className="insights-section insights-section--line" id="insights-lines" aria-labelledby="insights-lines-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="line" /><div><h2 id="insights-lines-title">{lineRoute.title}</h2><p>{lineRoute.note}</p></div></div><NavLink to={lineRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {lineRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {lineRoute.items.length ? <div className="insights-line-scroller" aria-label="个人主线摘要">
        {lineRoute.items.slice(0, 4).map((item) => {
          const open = expandedLines.has(item.id);
          const detailId = `line-detail-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          return <article className={`insights-line-card${open ? " is-open" : ""}`} key={item.id}>
            <span>{item.sections.length ? `${item.sections.length} 个证据切面` : "待继续补充"}</span><h3>{item.title}</h3><small>{item.updatedAt ? `更新于 ${item.updatedAt}` : "可以回到原文继续核对"}</small>
            <button type="button" onClick={() => toggleInSet(setExpandedLines, item.id)} aria-expanded={open} aria-controls={detailId}>{open ? "收起判断" : "看核心判断"}<Icon name="arrow" size={12} /></button>
            <p className="insights-card-detail" id={detailId}>{insightExcerpt(insightCoreJudgment(item), 220)}</p>
            {open ? <NavLink to={insightItemHref(lineRoute, item)} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>打开完整主线</NavLink> : null}
          </article>;
        })}
      </div> : <Empty>还没有形成个人主线。</Empty>}
    </section>

    <section className="insights-section insights-section--cycle" id="insights-cycles" aria-labelledby="insights-cycles-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="cycle" /><div><h2 id="insights-cycles-title">{cycleRoute.title}</h2><p>{cycleRoute.note}</p></div></div><NavLink to={cycleRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {cycleRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {cycleStages.length ? <div className="insights-cycle-flow" aria-label={`以“${leadingCycle?.title}”为例的循环路径`}>
        {cycleStages.map((stage, index) => <React.Fragment key={stage.label}><div><span><InsightSectionMark kind="cycle" /></span><b>{stage.label}</b><small>{stage.text}</small></div>{index < cycleStages.length - 1 ? <Icon name="arrow" size={17} /> : null}</React.Fragment>)}
      </div> : null}
      {cycleRoute.items.length ? <div className="insights-loop-grid">
        {cycleRoute.items.slice(0, 3).map((item) => {
          const open = expandedCycles.has(item.id);
          const detailId = `cycle-detail-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const trigger = insightSectionText(item, "常见触发");
          const cost = insightSectionText(item, "代价");
          return <article className={`insights-loop-card${open ? " is-open" : ""}`} key={item.id}>
            <div><InsightSectionMark kind="cycle" /><h3>{item.title}</h3></div><p>{insightExcerpt(insightCardDetail(item, ["循环定义"]), 130)}</p>
            <div className="insights-loop-tags">{trigger ? <span>触发 · {insightExcerpt(trigger, 22)}</span> : null}{cost ? <span>代价 · {insightExcerpt(cost, 22)}</span> : null}</div>
            <button type="button" onClick={() => toggleInSet(setExpandedCycles, item.id)} aria-expanded={open} aria-controls={detailId}>{open ? "收起详情" : "展开详情"}</button>
            <div className="insights-card-detail" id={detailId}>{insightExcerpt(insightCardDetail(item, ["中断点", "有效部分", "新证据"]), 250)} <NavLink to={insightItemHref(cycleRoute, item)} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看完整循环</NavLink></div>
          </article>;
        })}
      </div> : <Empty>还没有形成反复循环。</Empty>}
    </section>

    <section className="insights-section insights-section--system" id="insights-systems" aria-labelledby="insights-systems-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="system" /><div><h2 id="insights-systems-title">{systemRoute.title}</h2><p>{systemRoute.note}</p></div></div><NavLink to={systemRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {systemRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {systemRoute.items.length ? <div className="insights-system-grid">
        {systemRoute.items.slice(0, 6).map((item) => {
          const selected = selectedSystemId === item.id;
          return <button type="button" className={selected ? "is-selected" : ""} key={item.id} onClick={() => setSelectedSystemId(selected ? "" : item.id)} aria-expanded={selected} aria-controls="insights-system-detail"><InsightSectionMark kind="system" /><b>{item.title}</b><span><i />{item.sections.length} 个切面</span></button>;
        })}
        {selectedSystem ? <article className="insights-system-detail" id="insights-system-detail"><div><h3>{selectedSystem.title} · 关键要点</h3><NavLink to={insightItemHref(systemRoute, selectedSystem)} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>打开完整系统 <Icon name="arrow" size={13} /></NavLink></div><ul>{selectedSystem.sections.slice(0, 3).map((section) => <li key={section.heading}><b>{section.heading}</b><span>{insightExcerpt(section.body, 150)}</span></li>)}</ul>{!selectedSystem.sections.length ? <p>{insightExcerpt(selectedSystem.excerpt, 220)}</p> : null}</article> : null}
      </div> : <Empty>还没有形成现实系统。</Empty>}
    </section>

    <section className="insights-section insights-section--model" id="insights-models" aria-labelledby="insights-models-title">
      <header className="insights-section-head"><div><InsightSectionMark kind="model" /><div><h2 id="insights-models-title">{modelRoute.title}</h2><p>{modelRoute.note}</p></div></div><NavLink to={modelRoute.to} state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>查看全部 {modelRoute.items.length} 条 <Icon name="arrow" size={14} /></NavLink></header>
      {modelSections.length ? <div className="insights-model-grid">
        {modelSections.slice(0, 3).map((section, index) => {
          const id = `model-${index}`;
          const view = modelViews[id] || "summary";
          const panels = mentalModelPanels(section.body);
          return <article className="insights-model-card" key={section.heading}><div><InsightSectionMark kind="model" /><h3><NavLink to="/mental-models" state={{ returnTo: "/insights", returnLabel: "返回理解自己" }}>{section.heading.replace(/^[一二三四五六七]、/, "")}</NavLink></h3></div><p>{insightExcerpt(panels.summary, 145)}</p>
            <div className="insights-model-toggles" role="group" aria-label={`${section.heading}的查看方式`}><button type="button" className={view === "summary" ? "is-active" : ""} aria-pressed={view === "summary"} onClick={() => setModelViews((current) => ({ ...current, [id]: "summary" }))}>核心要点</button><button type="button" className={view === "calibration" ? "is-active" : ""} aria-pressed={view === "calibration"} onClick={() => setModelViews((current) => ({ ...current, [id]: "calibration" }))}>边界与反例</button></div>
            <div className="insights-model-panel" aria-live="polite">{insightExcerpt(view === "summary" ? panels.summary : panels.calibration, 240)}</div>
          </article>;
        })}
      </div> : <Empty>还没有形成思维模型。</Empty>}
    </section>

    <section className="insights-foot-cta"><div><h2>这些理解会继续变化</h2><p>新的生活记录可能补充证据，也可能让旧判断失效。你随时可以打开一条理解，说明哪里不像你。</p></div><button type="button" onClick={() => openContextAgent({ mode: "read", prompt: "我想一起核对这页已有的理解。请先问我哪一条最不像我，再结合证据和反例继续聊。" })}><Icon name="spark" size={15} />一起核对</button></section>
    <ContextualAgentDock revision={revision} context={{ scope: "理解自己", title: "个人主线、反复循环、现实系统与思维模型", summary: "从当前问题出发，结合已有的长期命题、循环、系统和判断工具。", defaultMode: "read", launcherLabel: "一起理解", suggestions: ["结合我的个人主线、反复循环和近期状态，现在最值得理解的一个问题是什么？", "最近发生的事更像哪一种旧模式？请给出证据和竞争解释。", "我有一个新的自我观察，帮我判断它应该补充到哪条路径。"] }} />
  </div>;
}
