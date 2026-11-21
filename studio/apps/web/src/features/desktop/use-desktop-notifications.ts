import { readPreference } from "../../shared/preference-storage";
import { useEffect, useState } from "react";
import type { DreamRun, WikiRun } from "@the-way-here/shared";
import { api } from "../../api";
import { AgentNotificationTracker, dreamNotificationRoute, type AgentNotification, type PredictionNotificationEvent } from "./agent-notifications";

/** Only the main window owns system notifications. Other windows still receive live UI updates. */
export function useDesktopNotifications(pathname: string, knowledgeBaseId?: string) {
  const [notice, setNotice] = useState<AgentNotification>();
  const main = pathname !== "/preferences" && pathname !== "/capture" && !new URLSearchParams(location.search).has("detached");
  useEffect(() => {
    if (!main || !knowledgeBaseId) return;
    const desktop = window.desktop;
    const deletedDreams = new Set<string>();
    const tracker = new AgentNotificationTracker((message) => {
      if (deletedDreams.has(message.route) || readPreference("desktop.notifications") === "false") return;
      if (message.route.startsWith("/dreams/")) setNotice(message);
      void desktop?.notify(message);
    });
    let disposed = false;
    const events = new EventSource("/api/events");
    const onRun = (event: Event) => {
      try { tracker.observeRun(JSON.parse((event as MessageEvent).data) as WikiRun); } catch { /* Ignore malformed events. */ }
    };
    const onPrediction = (event: Event) => {
      try { tracker.observePrediction(JSON.parse((event as MessageEvent).data) as PredictionNotificationEvent); } catch { /* Ignore malformed events. */ }
    };
    const onDream = (event: Event) => {
      try {
        const run = JSON.parse((event as MessageEvent).data) as DreamRun & { deleted?: boolean };
        if (run.deleted && run.id && run.knowledgeBaseId) {
          const route = dreamNotificationRoute(run);
          deletedDreams.add(route);
          setNotice(current => current?.route === route ? undefined : current);
        } else tracker.observeDream(run);
      } catch { /* Ignore malformed events. */ }
    };
    const onOpen = () => {
      // SSE has no replay. Reconcile runs that ended during a connection gap.
      if (desktop) void api<WikiRun[]>("/api/runs").then((runs) => { if (!disposed) tracker.reconcileRuns(runs); }).catch(() => undefined);
      void api<{ runs: DreamRun[] }>("/api/dreams?knowledgeBaseId=" + encodeURIComponent(knowledgeBaseId))
        .then(({ runs }) => { if (!disposed) for (const run of runs) tracker.observeDream(run); }).catch(() => undefined);
    };
    if (desktop) {
      events.addEventListener("run", onRun);
      events.addEventListener("prediction", onPrediction);
      // Remove a Dock count left by earlier versions. Completion notices have no unread count.
      void desktop.setBadge(0);
    }
    events.addEventListener("dream", onDream);
    events.addEventListener("open", onOpen);
    return () => { disposed = true; events.close(); };
  }, [main, knowledgeBaseId]);
  return { notice: main ? notice : undefined, dismiss: () => setNotice(undefined) };
}
