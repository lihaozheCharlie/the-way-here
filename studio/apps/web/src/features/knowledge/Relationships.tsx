import { SearchField } from "../../shared/form-controls";
import React, { useEffect, useRef, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import type { RelationshipsView } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { ContextualAgentDock } from "../collaboration/Collaboration";
import { PageLink } from "../../shared/routing";
import { Empty, Icon, Loading } from "../../shared/ui";
import { UnderstandingBanner } from "./UnderstandingLayout";
import { filterAndSortPeople, formatRelationshipDate, personRoleIds, primaryPersonRole, rolePersonCount, toggleRelationshipSelection, type RelationshipSort } from "./relationships-model";
import "../sources/photo-memory.css";
import { StructuredExplorer } from "./Cards";
import { EmbeddedPagePreview } from "./PagePreview";

function PersonAvatar({ person }: { person: { title: string; avatarUrl?: string } }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.avatarUrl]);
  return person.avatarUrl && !failed ? <img src={person.avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <>{person.title.slice(0, 1)}</>;
}

function PersonGraphAvatar({ url, radius }: { url: string; radius: number }) {
  const id = React.useId().replace(/:/g, "");
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return failed ? null : <><defs><clipPath id={id}><circle r={radius} /></clipPath></defs><image href={url} x={-radius} y={-radius} width={radius * 2} height={radius * 2} clipPath={`url(#${id})`} preserveAspectRatio="xMidYMid slice" onError={() => setFailed(true)} /></>;
}

export function Relationships({ revision }: { revision: number }) {
  const { data, loading, error } = useApi<RelationshipsView>("/api/views/relationships", revision);
  const [params, setParams] = useSearchParams();
  const [roleId, setRoleId] = useState("all");
  const [sort, setSort] = useState<RelationshipSort>("recent");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  const people = data?.groups.flatMap((item) => item.people.map((person) => ({ person, group: item.name }))) || [];
  const filtered = data ? filterAndSortPeople(people, data.roles, roleId, query, sort) : [];
  const selected = filtered.find(({ person }) => person.id === params.get("person"));
  useEffect(() => {
    if (selected) selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected?.person.id]);
  if (loading) return <Loading label="正在整理人物与关系" />;
  if (error || !data) return <Empty>{error || "暂无人物"}</Empty>;
  const relationshipRoles = data.roles;
  function selectPerson(id?: string, replace = false) { setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("person", id); else next.delete("person"); return next; }, { replace }); }
  function changeRole(nextRoleId: string) { setRoleId(nextRoleId); setVisibleCount(50); selectPerson(undefined, true); }
  function choosePerson(id: string) {
    const item = people.find(({ person }) => person.id === id);
    const primaryRole = item ? primaryPersonRole(item.person, relationshipRoles) : undefined;
    setRoleId(primaryRole?.id || "all");
    selectPerson(id);
  }
  function closePerson() {
    const trigger = selectedCardRef.current;
    selectPerson(undefined);
    requestAnimationFrame(() => trigger?.focus());
  }
  function togglePersonCard(id: string) {
    const nextId = toggleRelationshipSelection(selected?.person.id, id);
    if (!nextId) {
      closePerson();
      return;
    }
    choosePerson(nextId);
  }
  if (!people.length && data.roles.length) return <div className="understanding-people-page"><UnderstandingBanner tone="people" title="人与世界" description="具体人物还没有形成页面，可以先从已经整理出的关系角色继续阅读。" count={data.roles.length} countLabel="个关系角色" /><StructuredExplorer cards={data.roles} revision={revision} contextScope="人与世界 · 关系角色" /></div>;
  const networkRoles = data.roles.slice(0, 6);
  const networkRoleIds = new Set(networkRoles.map((role) => role.id));
  const networkPeople = people.filter(({ person }) => { const role = primaryPersonRole(person, data.roles); return role && networkRoleIds.has(role.id); }).sort((a, b) => b.person.mentionCount - a.person.mentionCount).slice(0, 12);
  const rolePositions = networkRoles.map((role, index) => ({ role, tone: index % 4 + 1, x: 190 + Math.cos((Math.PI * 2 * index) / Math.max(networkRoles.length, 1) - Math.PI / 2) * 104, y: 190 + Math.sin((Math.PI * 2 * index) / Math.max(networkRoles.length, 1) - Math.PI / 2) * 104 }));
  const personPositions = networkPeople.map((item, index) => {
    const primaryRole = primaryPersonRole(item.person, data.roles);
    return { ...item, primaryRole, tone: Math.max(0, data.roles.findIndex((role) => role.id === primaryRole?.id)) % 4 + 1, x: 190 + Math.cos((Math.PI * 2 * index) / Math.max(networkPeople.length, 1) - Math.PI / 2) * 164, y: 190 + Math.sin((Math.PI * 2 * index) / Math.max(networkPeople.length, 1) - Math.PI / 2) * 164 };
  });
  const activeRole = data.roles.find((role) => role.id === roleId);
  const selectedRole = selected ? primaryPersonRole(selected.person, data.roles) : activeRole;
  const selectedRoleTone = selectedRole ? Math.max(0, data.roles.findIndex((role) => role.id === selectedRole.id)) % 4 + 1 : 0;
  const selectedIndex = selected ? filtered.findIndex(({ person }) => person.id === selected.person.id) : -1;
  const renderCount = Math.max(visibleCount, selectedIndex + 1);
  return <div className="understanding-people-page">
    <header className="relationships-page-head"><div><h1>人与世界</h1><p>找到一个具体的人，也看见一段关系在生命里承担的功能；左侧的关系网络与右侧的人物列表始终保持同步。</p></div><div className="relationships-head-stat"><b>{data.totalPeople + data.roles.length}</b><span>个人与关系角色</span></div></header>
    <div className="relationships-workspace">
      <div className="relationships-graph-col">
        <section className="relationships-graph-card" aria-labelledby="relationship-web-title">
          <header><h2 id="relationship-web-title">关系网络</h2><span>{networkPeople.length} 个高关联人物</span></header>
          <p>线条来自人物页已记录的关系角色；点击任意节点，右侧列表会自动高亮并展开对应的人。</p>
          <svg viewBox="0 0 380 380" role="group" aria-label="人物与关系角色网络">
            <g className="relationships-edges">{rolePositions.map(({ role, x, y, tone }) => <line key={`self-${role.id}`} className={`tone-${tone}${roleId === role.id ? " is-active" : ""}`} x1="190" y1="190" x2={x} y2={y} />)}{personPositions.map(({ person, primaryRole, x, y, tone }) => { const linkedRole = rolePositions.find(({ role }) => role.id === primaryRole?.id)!; return <line key={`person-${person.id}`} className={`tone-${tone}${selected?.person.id === person.id ? " is-active" : ""}`} x1={linkedRole.x} y1={linkedRole.y} x2={x} y2={y} />; })}</g>
            <g className="relationships-center"><circle cx="190" cy="190" r="26" /><text x="190" y="194">我</text></g>
            {rolePositions.map(({ role, x, y, tone }) => <g className={`relationships-role-node tone-${tone}${roleId === role.id ? " is-selected" : ""}`} role="button" tabIndex={0} aria-label={`筛选关系角色：${role.title}`} aria-pressed={roleId === role.id} key={role.id} transform={`translate(${x} ${y})`} onClick={() => changeRole(role.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); changeRole(role.id); } }}><circle r="22" /><text y="4">{role.title.slice(0, 6)}</text></g>)}
            {personPositions.map(({ person, x, y, tone, primaryRole }) => { const dimmed = roleId !== "all" && !personRoleIds(person, data.roles).includes(roleId); const isSelected = selected?.person.id === person.id; const radius = person.avatarUrl ? 18 : Math.min(11, 5.5 + person.mentionCount / 8); return <g className={`relationships-person-node tone-${tone}${isSelected ? " is-selected" : ""}${dimmed ? " is-dim" : ""}`} role="button" tabIndex={0} aria-label={`查看 ${person.title}${primaryRole ? `，${primaryRole.title}` : ""}`} aria-expanded={isSelected} key={person.id} transform={`translate(${x} ${y})`} onClick={() => choosePerson(person.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePerson(person.id); } }}><circle r={radius} />{person.avatarUrl ? <PersonGraphAvatar url={person.avatarUrl} radius={radius} /> : null}<text y={radius + 12}>{person.title.slice(0, 7)}</text></g>; })}
          </svg>
          <footer>{networkRoles.map((role, index) => <button type="button" className={`tone-${index % 4 + 1}${roleId === role.id ? " is-active" : ""}`} aria-pressed={roleId === role.id} key={role.id} onClick={() => changeRole(role.id)}><i />{role.title}</button>)}</footer>
        </section>
        <aside className={`relationships-bridge tone-${selectedRoleTone}`} aria-live="polite"><Icon name="route" size={17} /><div><div><span>我</span><i>→</i>{selectedRole ? <><span>{selectedRole.title}</span><i>→</i></> : null}<span>{selected ? selected.person.title : activeRole ? "正在筛选右侧列表" : "点击左侧节点"}</span></div><p>{selected ? `已在右侧展开 ${selected.person.title} 的完整人物页。` : activeRole ? `右侧只显示与“${activeRole.title}”有明确连接的人。` : "图谱与列表共用同一套颜色，选中后会自动联动。"}</p></div></aside>
      </div>
      <section className="relationships-list-col" aria-label="人物列表">
        <div className="relationships-toolbar"><SearchField name="people-search" autoComplete="off" aria-label="搜索人物" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); selectPerson(undefined, true); }} placeholder="搜索姓名、别名或人物线索…" trailing={<span aria-live="polite">{filtered.length} 人</span>} /><div role="group" aria-label="人物排序">{[["recent", "最近影响"], ["connected", "关联最多"], ["name", "按姓名"]].map(([value, label]) => <button type="button" key={value} className={sort === value ? "active" : ""} aria-pressed={sort === value} onClick={() => { setSort(value as RelationshipSort); setVisibleCount(50); selectPerson(undefined, true); }}>{label}</button>)}</div></div>
        <div className="relationships-role-filters" aria-label="按关系角色筛选"><button type="button" className={roleId === "all" ? "active tone-0" : "tone-0"} aria-pressed={roleId === "all"} onClick={() => changeRole("all")}><i />全部 <span>{data.totalPeople}</span></button>{data.roles.map((role, index) => <button type="button" className={`tone-${index % 4 + 1}${roleId === role.id ? " active" : ""}`} aria-pressed={roleId === role.id} key={role.id} onClick={() => changeRole(role.id)}><i />{role.title} <span>{rolePersonCount(people, role, data.roles)}</span></button>)}</div>
        {filtered.length ? <div className="relationships-people-grid">{filtered.slice(0, renderCount).map(({ person, group: groupName }, index) => { const primaryRole = primaryPersonRole(person, data.roles); const tone = primaryRole ? Math.max(0, data.roles.findIndex((role) => role.id === primaryRole.id)) % 4 + 1 : 0; const isSelected = selected?.person.id === person.id; return <React.Fragment key={person.id}><button ref={isSelected ? selectedCardRef : undefined} type="button" className={`relationships-person-card tone-${tone}${isSelected ? " is-selected" : ""}`} aria-expanded={isSelected} onClick={() => togglePersonCard(person.id)}><span className="relationships-avatar"><PersonAvatar person={person} /></span><span className="relationships-person-body"><span className="relationships-person-title"><b>{person.title}</b><time dateTime={person.lastMention}>{formatRelationshipDate(person.lastMention)}</time></span><span className="relationships-role-chip"><i />{primaryRole?.title || groupName} · {person.mentionCount} 处关联</span><span className="relationships-person-excerpt">{person.excerpt || "这个人物页还没有可以展示的摘要。"}</span></span></button>{isSelected ? <article className={`relationships-person-detail tone-${tone}${index % 2 ? " detail-from-right" : ""}`} aria-live="polite"><button type="button" className="relationships-detail-close" aria-label={`收起 ${person.title}`} onClick={closePerson}><Icon name="close" size={14} /></button><header><span className="relationships-avatar"><PersonAvatar person={person} /></span><div><h2>{person.title}</h2><p>{person.aliases.length ? `别名 · ${person.aliases.join(" · ")}` : "暂无别名记录"}</p></div></header><div className="relationships-detail-links">{person.relatedStages.map((page) => <PageLink key={page.id} page={page}>阶段 · {page.title}</PageLink>)}{person.relatedRoles.map((page) => <PageLink key={page.id} page={page}>角色 · {page.title}</PageLink>)}{person.relatedSystems.map((page) => <PageLink key={page.id} page={page}>系统 · {page.title}</PageLink>)}</div>{person.photos?.length ? <section aria-label="人物影像"><h3>影像</h3><div className="relationships-photo-gallery">{person.photos.map((photo) => <NavLink key={photo.imageUrl} to={`/sources?file=${encodeURIComponent(photo.reportPageId)}`}><img src={photo.imageUrl} alt={photo.title} loading="lazy" /><span>{photo.title} · 回到照片与讲述</span></NavLink>)}</div></section> : null}<EmbeddedPagePreview key={person.id} page={person} revision={revision} onRenamed={(renamed) => selectPerson(renamed.id, true)} /></article> : null}</React.Fragment>; })}{renderCount < filtered.length ? <button type="button" className="relationships-load-more" onClick={() => setVisibleCount((value) => Math.max(value, renderCount) + 50)}>继续显示 {Math.min(50, filtered.length - renderCount)} 人</button> : null}</div> : <Empty>没有匹配的人物。可以换一个关键词，或清除当前角色筛选。</Empty>}
      </section>
    </div>
    <ContextualAgentDock revision={revision} context={{ scope: `人与世界 · ${selectedRole?.title || "全部人物"}`, title: selected?.person.title || "补充一个重要人物", pageId: selected?.person.id, summary: selected?.person.excerpt || "当前还没有选中的人物。", defaultMode: "write", launcherLabel: selected ? "补充这个人物" : "补充重要人物", suggestions: [selected ? `我想补充一段与${selected.person.title}有关的经历，请更新人物页和受影响的关系结构。` : "我想起了一个重要人物还没有记录，请帮我创建人物页并连接到合适的关系角色。", "请检查当前人物记录是否遗漏了别名、关系功能或关键经历。"] }} />
  </div>;
}
