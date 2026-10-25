/** Capture stays a short utility title. Preferences and Models share the library suffix. */
export function desktopWindowTitle(pageLabel: string, libraryName: string, utility: "capture" | "preferences" | null): string {
  if (utility === "capture") return pageLabel;
  return `${pageLabel} · ${libraryName}`;
}
