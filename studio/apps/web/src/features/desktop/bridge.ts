export type DesktopCommand = "search" | "inspector" | "capture" | "settings" | "detach" | "focus" | "import" | "back" | "forward" | "predict-self" | `knowledge-base:${number}`;
import type { PhotoLibraryAuthorization, PhotoLibraryFilters, PhotoLibraryImage, PhotoLibrarySearchInput, PhotoLibrarySearchResult } from "@the-way-here/shared";
export interface DesktopBridge {
  platform: string;
  isMacAppStore?: boolean;
  connectCodexCLI?: () => Promise<boolean>;
  openPrivacy?: () => Promise<void>;
  photoLibraryStatus?: () => Promise<PhotoLibraryAuthorization>;
  photoLibraryFilters?: () => Promise<PhotoLibraryFilters>;
  authorizePhotoLibrary?: () => Promise<PhotoLibraryAuthorization>;
  searchPhotoLibrary?: (input: PhotoLibrarySearchInput) => Promise<PhotoLibrarySearchResult>;
  photoLibraryImage?: (input: { assetId: string; size: "thumbnail" | "preview"; network: boolean }) => Promise<PhotoLibraryImage>;
  closePhotoLibrary?: () => Promise<void>;
  openPhotoLibrarySettings?: () => Promise<void>;
  pathForDroppedFile?: (file: File) => string;
  requestFolderAccess?: () => Promise<void>;
  chooseSourceDirectory: () => Promise<string | null>;
  pauseSpeech?: (paused: boolean) => Promise<void>;
  startSpeech: () => Promise<void>;
  revealSpeechRecording?: () => Promise<void>;
  onSpeechTranscript?: (callback: (text: string) => void) => () => void;
  onSpeechWarning?: (callback: (message: string) => void) => () => void;
  onSpeechBackup?: (callback: () => void) => () => void;
  onSpeechProgress?: (callback: (percent: number) => void) => () => void;
  onSpeechLevel?: (callback: (level: number) => void) => () => void;
  onSpeechEnded?: (callback: () => void) => () => void;
  stopSpeech: (discard?: boolean) => Promise<string>;
  openWindow: (route: string, kind?: "reader" | "focus" | "settings" | "capture") => Promise<void>;
  onCommand: (callback: (command: DesktopCommand) => void) => () => void;
  notify: (payload: { title: string; body: string; route: string }) => Promise<void>;
  setBadge: (count: number) => Promise<void>;
  revealWorkspace: () => Promise<void>;
}
declare global { interface Window { desktop?: DesktopBridge } }
export function openDesktopWindow(route: string, kind: "reader" | "focus" | "settings" | "capture" = "reader") {
  if (window.desktop) return window.desktop.openWindow(route, kind);
  window.open(route, "_blank", "noopener,noreferrer");
}
