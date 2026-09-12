import { useEffect } from "react";
import type { TodayView, VaultInfo } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
export function useDesktopNotifications(revision: number, vault?: VaultInfo, pathname = "/") {
  const { data } = useApi<TodayView>("/api/views/today", revision);
  const count = data?.conversationPrompts.filter((item) => item.status === "active").length || 0;
  useEffect(() => {
    if (!window.desktop || !vault || !data) return;
    // Only the main window owns notifications, avoiding one alert per open window.
    if (pathname === "/preferences" || pathname === "/capture" || new URLSearchParams(location.search).has("detached")) return;
    const key = `desktop.seen.${vault.knowledgeBaseId}`;
    const signature = JSON.stringify({ topics:data.conversationPrompts.filter((item) => item.status === "active").map((item) => item.id), letter:data.latestLetter?.id });
    const previous = localStorage.getItem(key);
    localStorage.setItem(key,signature);
    void window.desktop.setBadge(pathname === "/questions" ? 0 : count);
    if (!previous || previous === signature || localStorage.getItem("desktop.notifications") !== "true") return;
    const old = JSON.parse(previous) as { topics: string[]; letter?: string };
    const newTopics = data.conversationPrompts.filter((item) => item.status === "active" && !old.topics.includes(item.id));
    const newLetter = data.latestLetter && old.letter !== data.latestLetter.id;
    if (newLetter || newTopics.length) void window.desktop.notify({ title:newLetter ? "新的近况回信" : "有新的话题值得聊聊", body:newLetter ? "一封新的近况回信已准备好，点击查看。" : `${newTopics.length} 条新线索，想现在接着聊聊吗？`, route:newLetter ? "/letters" : "/questions", count });
  }, [data, vault?.knowledgeBaseId, pathname, count]);
  return count;
}
