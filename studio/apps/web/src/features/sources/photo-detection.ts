import type { PhotoBox } from "@the-way-here/shared";

export type PhotoDetectionPhase = "loading" | "locating" | "grouping";
export type PhotoDetectionStatus = { state: "detecting" | "done" | "failed"; phase?: PhotoDetectionPhase; count?: number; error?: string; groupingError?: string };
export type PhotoFaceResult = { boxes: PhotoBox[]; descriptors?: Array<number[] | undefined>; groupingError?: string };
type DetectPhotoFaces = (url: string, signal: AbortSignal, onProgress?: (phase: PhotoDetectionPhase) => void) => Promise<PhotoBox[] | PhotoFaceResult>;

export function detectionProgressLabel(photos: Array<{ id: string }>, statuses: Record<string, PhotoDetectionStatus>): string | undefined {
  const index = photos.findIndex((photo) => statuses[photo.id]?.state === "detecting");
  if (index < 0) return undefined;
  const phase = statuses[photos[index]!.id]!.phase;
  const action = phase === "grouping" ? "正在比对相似人脸" : phase === "locating" ? "正在识别人脸" : "正在准备识别";
  return `${action} · 第 ${index + 1} / ${photos.length} 张`;
}

// Keep one worker per batch; if feature extraction stalls, retain detected boxes
// and skip grouping for the rest of this batch rather than repeatedly loading it.
function createBatchDetector(groupFaces: boolean) {
  let worker: Worker | undefined;
  let groupingEnabled = groupFaces;
  function release() {
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    worker = undefined;
  }
  const detect: DetectPhotoFaces = (url, signal, onProgress) => {
    if (signal.aborted) return Promise.reject(new DOMException("已取消", "AbortError"));
    return new Promise((resolve, reject) => {
      let settled = false;
      let detectedBoxes: PhotoBox[] | undefined;
      let timeout: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
        if (worker) { worker.onmessage = null; worker.onerror = null; }
      };
      const finish = (result: PhotoFaceResult, discard = false) => {
        if (settled) return;
        if (result.groupingError) groupingEnabled = false;
        cleanup();
        if (discard) release();
        resolve(result);
      };
      const fail = (error: Error) => {
        if (settled) return;
        if (detectedBoxes && error.name !== "AbortError") {
          finish({ boxes: detectedBoxes, groupingError: "自动分组未完成，已保留检测到的人脸，请逐个确认。" }, true);
        } else { cleanup(); release(); reject(error); }
      };
      const cancel = () => fail(new DOMException("已取消", "AbortError"));
      const timedOut = () => fail(new Error("人脸识别超时，可以重试或先讲故事。"));
      timeout = setTimeout(timedOut, 30_000);
      signal.addEventListener("abort", cancel, { once: true });
      try {
        worker ||= new Worker(new URL("./photo-face.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }: MessageEvent<Partial<PhotoFaceResult> & { error?: string; phase?: PhotoDetectionPhase }>) => {
          if (settled) return;
          if (data.phase && ["loading", "locating", "grouping"].includes(data.phase)) {
            if (data.phase === "grouping" && Array.isArray(data.boxes) && !detectedBoxes) {
              detectedBoxes = data.boxes.slice(0, 40);
              clearTimeout(timeout); timeout = setTimeout(timedOut, 15_000);
            }
            onProgress?.(data.phase);
            return;
          }
          if (data.error || !Array.isArray(data.boxes)) { fail(new Error(data.error || "本地检测未完成，请重试。")); return; }
          finish({ boxes: data.boxes.slice(0, 40), descriptors: data.descriptors, groupingError: data.groupingError });
        };
        worker.onerror = () => fail(new Error("人脸识别暂不可用，可以重试或先讲故事。"));
        worker.postMessage({ url: new URL(url, window.location.origin).href, origin: window.location.origin, groupFaces: groupingEnabled });
      } catch { fail(new Error("无法读取照片，请重试。")); }
    });
  };
  return { detect, release };
}

// Only one decoder runs at a time. Read current annotations before both the
// request and its result so a late response never replaces a restored draft.
export async function detectPhotoBatch(photos: Array<{ id: string; url: string }>, options: {
  signal: AbortSignal;
  shouldSkip: (id: string) => boolean;
  onStatus: (id: string, status: PhotoDetectionStatus) => void;
  onDetected: (id: string, boxes: PhotoBox[], descriptors?: Array<number[] | undefined>) => void;
  groupFaces?: boolean;
  detect?: DetectPhotoFaces;
}) {
  const session = createBatchDetector(options.groupFaces ?? photos.length > 1);
  const detect = options.detect ?? session.detect;
  try {
    for (const photo of photos) {
      if (options.signal.aborted) return;
      if (options.shouldSkip(photo.id)) continue;
      options.onStatus(photo.id, { state: "detecting" });
      try {
        const result = await detect(photo.url, options.signal, (phase) => {
          if (!options.signal.aborted) options.onStatus(photo.id, { state: "detecting", phase });
        });
        const { boxes, descriptors, groupingError } = Array.isArray(result) ? { boxes: result } : result;
        if (options.signal.aborted) return;
        if (!options.shouldSkip(photo.id) && boxes.length) {
          if (descriptors) options.onDetected(photo.id, boxes, descriptors);
          else options.onDetected(photo.id, boxes);
        }
        options.onStatus(photo.id, { state: "done", count: boxes.length, ...(groupingError ? { groupingError } : {}) });
      } catch (error) {
        if (options.signal.aborted) return;
        options.onStatus(photo.id, { state: "failed", error: error instanceof Error ? error.message : "本地检测未完成，请重试。" });
      }
    }
  } finally { session.release(); }
}
