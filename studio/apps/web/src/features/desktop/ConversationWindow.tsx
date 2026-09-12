import { useSearchParams } from "react-router-dom";
import { AgentDock } from "../collaboration/Collaboration";
export function ConversationWindow({ revision }: { revision: number }) {
  const [params] = useSearchParams();
  return <div className="desktop-inspector conversation-window"><AgentDock revision={revision} initialRunId={params.get("run") || ""} context={{ scope:"深入聊聊", title:params.get("title") || "一起往下想", pageId:params.get("pageId") || undefined, summary:"在独立窗口接着聊当前话题。", defaultMode:"read", suggestions:[] }} /></div>;
}
