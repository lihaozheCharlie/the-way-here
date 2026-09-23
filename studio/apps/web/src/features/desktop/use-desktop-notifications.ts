import { useEffect } from "react";
import type { WikiRun } from "@the-way-here/shared";
import { api } from "../../api";
import { AgentNotificationTracker, type PredictionNotificationEvent } from "./agent-notifications";

/** Only the main window owns system notifications. Other windows still receive live UI updates. */
export function useDesktopNotifications(pathname: string) {
  useEffect(() => {
    if (!window.desktop || pathname === "/preferences" || pathname === "/capture" || new URLSearchParams(location.search).has("detached")) return;
    const desktop = window.desktop;
    const tracker = new AgentNotificationTracker((message) => {
      if (localStorage.getItem("desktop.notifications") === "false") return;
      void desktop.notify(message);
    });
    let disposed = false;
    const events = new EventSource("/api/events");
    const onRun = (event: Event) => {
      try { tracker.observeRun(JSON.parse((event as MessageEvent).data) as WikiRun); } catch { /* Ignore malformed events. */ }
    };
    const onPrediction = (event: Event) => {
      try { tracker.observePrediction(JSON.parse((event as MessageEvent).data) as PredictionNotificationEvent); } catch { /* Ignore malformed events. */ }
    };
    const onOpen = () => {
      // SSE has no replay. Reconcile runs that ended during a connection gap.
      void api<WikiRun[]>("/api/runs").then((runs) => { if (!disposed) tracker.reconcileRuns(runs); }).catch(() => undefined);
    };
    events.addEventListener("run", onRun);
    events.addEventListener("prediction", onPrediction);
    events.addEventListener("open", onOpen);
    // Remove a Dock count left by earlier versions. Completion notices have no unread count.
    void desktop.setBadge(0);
    return () => { disposed = true; events.close(); };
  }, [pathname]);
}
