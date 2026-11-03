import { useState } from "react";
import { readPreference, writePreference } from "./preference-storage";

export function usePanelPreference(key: string, defaultOpen: boolean) {
  const [open, setOpen] = useState(() => {
    try {
      const stored = readPreference(key);
      if (stored === "true" || stored === "false") return stored === "true";
    } catch { /* The panel can still be used without storage. */ }
    return defaultOpen;
  });
  function rememberOpen(next: boolean) {
    setOpen(next);
    try { writePreference(key, String(next)); } catch { /* Keep the current window usable. */ }
  }
  return [open, rememberOpen] as const;
}
