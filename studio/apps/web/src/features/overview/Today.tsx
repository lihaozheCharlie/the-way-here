import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import type { TodayView, VaultInfo, WikiPageSummary } from "@the-way-here/shared";
import { pageDestination } from "../../shared/routing";
import { useApi } from "../../shared/use-api";
import { Empty, Icon, Loading } from "../../shared/ui";
import { PageAgentContext } from "../desktop/InspectorContext";
import { companionshipDays } from "./companionship";
import { HomePrompt } from "./HomePrompt";
import { LifeRecordCapture } from "./LifeRecordCapture";
import { PhotoLibraryCard } from "./PhotoLibraryCard";
import { selectHomeQuestion } from "./talking-questions";
import "./today.css";

function RecentLetterCard({ letter }: { letter: WikiPageSummary }) {
  return <article className="today-letter-card">
    <h2>最近的一封近况回信</h2>
    <p>{letter.excerpt || "从过去的记录回望此刻。"}</p>
    <NavLink to={pageDestination(letter)}>读「{letter.title}」 <Icon name="arrow" size={14} /></NavLink>
  </article>;
}

export function Today({ revision }: { revision: number }) {
  const { data: vault, error } = useApi<VaultInfo>("/api/vault", revision);
  const { data: today } = useApi<TodayView>("/api/views/today", revision);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!vault && error) return <Empty>{error}</Empty>;
  if (!vault) return <Loading label="正在打开此刻" />;
  const question = today ? selectHomeQuestion(today) : undefined;
  return <div className="home-overview today-simple">
    {error ? <p className="today-vault-status" role="status">刚才没能刷新知识库，下面仍是上次打开的内容。</p> : null}
    <section className="today-companion-card" aria-labelledby="home-intro-title">
      <span className="today-companion-badge"><Icon name="heart" size={18} />长期陪伴 · 已相处 {companionshipDays(vault.companionshipStartedAt, now)} 天</span>
      <h1 id="home-intro-title">有什么，都可以聊聊</h1>
      <p>我会记得你的来路，也会坦白哪些地方还不懂你。你先说，我们再一起把生活慢慢理清。</p>
    </section>
    <HomePrompt revision={revision} />
    <LifeRecordCapture key={vault.knowledgeBaseId} knowledgeBaseId={vault.knowledgeBaseId} />
    {today?.latestLetter ? <RecentLetterCard letter={today.latestLetter} /> : null}
    <PhotoLibraryCard key={`photos:${vault.knowledgeBaseId}`} knowledgeBaseId={vault.knowledgeBaseId} />
    <PageAgentContext context={{ scope: "此刻", title: question?.question || "从此刻说起", summary: question?.reason || "听听最近发生的事，一起把生活慢慢理清。", defaultMode: "read", suggestions: [question?.agentPrompt || "我想聊聊最近发生的一件事。"] }} />
  </div>;
}
