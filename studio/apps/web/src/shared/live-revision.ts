/** Re-read server state after missed events; SSE does not replay past updates. */
export function subscribeLiveRevision(refresh: () => void): () => void {
  const events = new EventSource("/api/events");
  for (const event of ["open", "index", "run", "approval", "file", "import", "agent-settings", "prediction"]) {
    events.addEventListener(event, refresh);
  }
  const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    events.close();
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
