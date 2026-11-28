import { Icon } from "../../shared/ui";

export function PreferenceHeading({ kind, id, title, description }: { kind: "language" | "notification" | "keyboard" | "storage" | "ai"; id: string; title: string; description: string }) {
  return <header className="preferences-group-heading"><span className="preferences-group-icon" aria-hidden="true">
    {kind === "ai" ? <Icon name="spark" size={15} /> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === "language" ? <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9s1.3-6.2 3.8-9Z" /></> : kind === "notification" ? <><path d="M18 8a6 6 0 0 0-12 0c0 3-1 5-2 6h16c-1-1-2-3-2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></> : kind === "storage" ? <><path d="M3 12.5h18" /><path d="M5.6 5.4a2 2 0 0 1 1.8-1.2h9.2a2 2 0 0 1 1.8 1.2L21 12.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M7 16h.01" /></> : <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M7 15h4" /></>}
    </svg>}
  </span><div><h2 id={id}>{title}</h2><p>{description}</p></div></header>;
}
