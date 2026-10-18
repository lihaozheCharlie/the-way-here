/** Capture history is scoped to one knowledge base and persisted by the local server. */
export interface CaptureEntry {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  text: string;
  folder: string;
  diaryDate: string;
  status: "draft" | "saved";
  content?: string;
  originalText?: string;
  pageId?: string;
  storedPath?: string;
  fileHash?: string;
  savedRunId?: string;
  versions?: Array<{ savedAt: string; text: string; content: string }>;
}
export interface CaptureHistory {
  entries: CaptureEntry[];
  defaultFolder: string;
}
