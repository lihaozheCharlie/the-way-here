/** Versioned file protocol shared by the iOS client and the opt-in Mac worker.
 * Requests are immutable. Only Mac writes receipts; cancellation is a separate file.
 * No executable command, model credential or machine path belongs in this protocol.
 */
export const MOBILE_PROTOCOL_VERSION = 1;
export const MOBILE_TASK_KINDS = ["diary", "build", "photo-story", "chat", "letter", "prediction", "topics", "import"] as const;
export type MobileTaskKind = typeof MOBILE_TASK_KINDS[number];
export interface MobileManifest {
  version: 1;
  knowledgeBaseId: string;
  name: string;
  nickname?: string;
  sourcesPath: string;
  wikiPath: string;
  createdAt: string;
  readOnly: boolean;
}
export interface MobileTaskRequest {
  version: 1;
  id: string;
  knowledgeBaseId: string;
  deviceId: string;
  kind: MobileTaskKind;
  createdAt: string;
  text: string;
  sourcePaths: string[];
  contextId?: string;
  options: Record<string, string>;
}
export interface MobileTaskReceipt {
  version: 1;
  id: string;
  knowledgeBaseId: string;
  status: "queued" | "processing" | "waiting-approval" | "completed" | "failed" | "cancelled" | "interrupted";
  updatedAt: string;
  runId?: string;
  message?: string;
  result?: string;
  phase?: string;
  progress?: number;
  resultPaths?: string[];
  log?: string[];
  pageCount?: number;
}
export function isMobileRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1000 && !/[\\\x00-\x1f:]/.test(value) && !value.startsWith("/") && value.split("/").every(part => part !== "" && part !== "." && part !== "..");
}
export function parseMobileTask(value: unknown): MobileTaskRequest {
  const v = value as Partial<MobileTaskRequest> | null;
  const identifier = (s: unknown) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(s);
  if (!v || v.version !== 1 || !identifier(v.id) || !identifier(v.deviceId) || !identifier(v.knowledgeBaseId)
    || !MOBILE_TASK_KINDS.includes(v.kind as MobileTaskKind) || typeof v.createdAt !== "string" || !Number.isFinite(Date.parse(v.createdAt))
    || typeof v.text !== "string" || v.text.length > 50_000 || !Array.isArray(v.sourcePaths) || v.sourcePaths.length > 100
    || !v.sourcePaths.every(isMobileRelativePath) || (v.contextId !== undefined && (typeof v.contextId !== "string" || v.contextId.length > 1000))
    || !v.options || Array.isArray(v.options) || typeof v.options !== "object" || Object.keys(v.options).length > 20
    || Object.entries(v.options).some(([k, val]) => !identifier(k) || typeof val !== "string" || val.length > 2000)) throw new Error("无效的手机任务文件；原文件已保留");
  if (!v.text.trim() && !v.sourcePaths.length) throw new Error("手机任务没有内容");
  return v as MobileTaskRequest;
}
