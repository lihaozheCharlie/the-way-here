import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import type { PhotoBox } from "@the-way-here/shared";

let detector: Promise<FaceDetector> | undefined;
self.onmessage = async (event: MessageEvent<{ url: string; origin: string; groupFaces?: boolean }>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const { url, origin } = event.data;
    if (!detector) self.postMessage({ phase: "loading" });
    detector ||= FilesetResolver.forVisionTasks(`${origin}/mediapipe`, true).then((files) => FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: `${origin}/models/blaze-face-short-range.tflite`, delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.5 }));
    const faceDetector = await detector;
    self.postMessage({ phase: "locating" });
    const response = await fetch(url);
    if (!response.ok) throw new Error("照片无法读取");
    bitmap = await createImageBitmap(await response.blob());
    const { width, height } = bitmap;
    const detections = faceDetector.detect(bitmap).detections.filter((d) => d.boundingBox).slice(0, 40);
    const boxes: PhotoBox[] = detections.flatMap((d) => {
      const b = d.boundingBox;
      if (!b) return [];
      const x = Math.max(0, (b.originX - b.width * 0.2) / width);
      const y = Math.max(0, (b.originY - b.height * 0.4) / height);
      return [{ x, y, width: Math.min(1 - x, b.width * 1.4 / width), height: Math.min(1 - y, b.height * 1.6 / height) }];
    });
    const descriptors: Array<number[] | undefined> = [];
    let groupingError: string | undefined;
    if (event.data.groupFaces && detections.length) {
      self.postMessage({ phase: "grouping", boxes });
      try {
        const { describePhotoFace } = await import("./photo-face-embedding");
        for (const face of detections) {
          const box = face.boundingBox!;
          descriptors.push(box.width >= 48 && box.height >= 48 && (face.categories[0]?.score ?? 0) >= 0.8
            ? await describePhotoFace(bitmap, face.keypoints, origin) : undefined);
        }
      } catch { groupingError = "部分照片未能自动分组，仍可逐个确认人物。"; }
    }
    self.postMessage({ boxes, ...(event.data.groupFaces ? { descriptors, groupingError } : {}) });
  } catch (error) {
    detector = undefined;
    self.postMessage({ error: error instanceof Error ? error.message : "本地人脸检测不可用" });
  } finally { bitmap?.close(); }
};
