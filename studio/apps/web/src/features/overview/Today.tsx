import { useApi } from "../../shared/use-api";
import type { VaultInfo } from "@the-way-here/shared";
import { Empty, Icon, Loading } from "../../shared/ui";
import { LifeRecordCapture } from "./LifeRecordCapture";
import { PageAgentContext } from "../desktop/InspectorContext";
import "./today.css";

export function Today({ revision }: { revision: number }) {
  const { data: vault, error } = useApi<VaultInfo>("/api/vault", revision);
  if (error) return <Empty>{error}</Empty>;
  if (!vault) return <Loading label="正在打开此刻" />;
  return <div className="home-overview today-simple">
    <section className="home-intro-card" aria-labelledby="home-intro-title">
      <div className="home-intro-main">
        <span className="friend-mark" aria-hidden="true"><Icon name="message" size={22} /></span>
        <div>
          <div className="home-intro-identity"><h1 id="home-intro-title">The Way Here</h1><span>一个会越来越懂你的朋友</span></div>
          <p>我们聊得越多，我就越懂你。<br />你也可以把日记、聊天记录或账单带给我看，帮我更快跟上你。</p>
        </div>
      </div>
    </section>
    <LifeRecordCapture key={vault.knowledgeBaseId} knowledgeBaseId={vault.knowledgeBaseId} />
    <PageAgentContext context={{ scope: "此刻", title: "从此刻说起", summary: "听听最近发生的事，一起把生活慢慢理清。", defaultMode: "read", suggestions: ["我想聊聊最近发生的一件事。"] }} />
  </div>;
}
