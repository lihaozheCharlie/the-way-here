export function OutlineGlyph({ panel }: { panel?: "left" | "right" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{panel ? <><rect x="3" y="3" width="18" height="18" rx="2" /><path d={panel === "left" ? "M9 3v18" : "M15 3v18"} /></> : <path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13" />}</svg>;
}
