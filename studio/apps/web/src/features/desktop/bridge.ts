export type DesktopCommand = "search" | "inspector" | "capture" | "settings" | "detach" | "focus" | "import" | "back" | "forward" | `knowledge-base:${number}`;
export interface DesktopBridge {
  platform: string;
  chooseSourceDirectory: () => Promise<string | null>;
  startSpeech: () => Promise<void>;
  stopSpeech: () => Promise<string>;
  openWindow: (route: string, kind?: "reader" | "focus" | "settings" | "capture") => Promise<void>;
  onCommand: (callback: (command: DesktopCommand) => void) => () => void;
  notify: (payload: { title: string; body: string; route: string; count: number }) => Promise<void>;
  setBadge: (count: number) => Promise<void>;
  revealWorkspace: () => Promise<void>;
}
declare global { interface Window { desktop?: DesktopBridge } }
export function openDesktopWindow(route: string, kind: "reader" | "focus" | "settings" | "capture" = "reader") {
  if (window.desktop) return window.desktop.openWindow(route, kind);
  window.open(route, "_blank", "noopener,noreferrer");
}
