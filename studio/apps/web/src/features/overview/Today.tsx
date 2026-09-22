import { useEffect, useState } from "react";
import { companionshipDays } from "./companionship";
import { useApi } from "../../shared/use-api";
import type { VaultInfo } from "@the-way-here/shared";
import { Empty, Icon, Loading } from "../../shared/ui";
import { LifeRecordCapture } from "./LifeRecordCapture";
import { PageAgentContext } from "../desktop/InspectorContext";
import "./today.css";

export function Today({ revision }: { revision: number }) {
  const { data: vault, error } = useApi<VaultInfo>("/api/vault", revision);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (error) return <Empty>{error}</Empty>;
  if (!vault) return <Loading label="正在打开此刻" />;
  return <div className="home-overview today-simple">
    <section className="today-companion-card" aria-labelledby="home-intro-title">
      <span className="today-companion-badge"><Icon name="heart" size={18} />长期陪伴 · 已相处 {companionshipDays(vault.companionshipStartedAt, now)} 天</span>
      <h1 id="home-intro-title">有什么，都可以聊聊</h1>
      <p>我会记得你的来路，也会坦白哪些地方还不懂你。你先说，我们再一起把生活慢慢理清。</p>
    </section>
    <LifeRecordCapture key={vault.knowledgeBaseId} knowledgeBaseId={vault.knowledgeBaseId} />
    <PageAgentContext context={{ scope: "此刻", title: "从此刻说起", summary: "听听最近发生的事，一起把生活慢慢理清。", defaultMode: "read", suggestions: ["我想聊聊最近发生的一件事。"] }} />
  </div>;
}
