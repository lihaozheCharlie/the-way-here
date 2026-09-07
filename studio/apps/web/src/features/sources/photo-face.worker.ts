import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import type { PhotoBox } from "@the-way-here/shared";
import { mergeDetectedFaces, photoFaceTiles, remapDetectedFace, type DetectedFace, type FaceTile } from "./photo-face-candidates";

let detector: Promise<FaceDetector> | undefined;
self.onmessage = async (event: MessageEvent<{ url: string; origin: string; groupFaces?: boolean }>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const { url, origin } = event.data;
    if (!detector) self.postMessage({ phase: "loading" });
    detector ||= FilesetResolver.forVisionTasks(`${origin}/mediapipe`, true).then((files) => FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: `${origin}/models/blaze-face-full-range.tflite`, delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.35 }));
    const faceDetector = await detector;
    self.postMessage({ phase: "locating" });
    const response = await fetch(url);
    if (!response.ok) throw new Error("照片无法读取");
    bitmap = await createImageBitmap(await response.blob());
    const { width, height } = bitmap;
    const fullTile: FaceTile = { x: 0, y: 0, width, height };
    const rawFaces: DetectedFace[] = [];
    const append = (result: ReturnType<FaceDetector["detect"]>, tile: FaceTile) => {
      for (const detection of result.detections) {
        const box = detection.boundingBox;
        if (!box) continue;
        const face: DetectedFace = { box: { originX: box.originX, originY: box.originY, width: box.width, height: box.height }, keypoints: (detection.keypoints ?? []).map(({ x, y }) => ({ x, y })), score: detection.categories?.[0]?.score ?? 0 };
        rawFaces.push(tile === fullTile ? face : remapDetectedFace(face, tile, width, height));
      }
    };
    append(faceDetector.detect(bitmap), fullTile);
    for (const tile of photoFaceTiles(width, height)) {
      const canvas = new OffscreenCanvas(tile.width, tile.height);
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.drawImage(bitmap, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
      const tileBitmap = canvas.transferToImageBitmap();
      try { append(faceDetector.detect(tileBitmap), tile); }
      finally { tileBitmap.close(); canvas.width = 0; canvas.height = 0; }
    }
    const detections = mergeDetectedFaces(rawFaces);
    const boxes: PhotoBox[] = detections.map((d) => {
      const b = d.box;
      const x = Math.max(0, (b.originX - b.width * 0.2) / width);
      const y = Math.max(0, (b.originY - b.height * 0.4) / height);
      return { x, y, width: Math.min(1 - x, b.width * 1.4 / width), height: Math.min(1 - y, b.height * 1.6 / height) };
    });
    const descriptors: Array<number[] | undefined> = [];
    let groupingError: string | undefined;
    if (event.data.groupFaces && detections.length) {
      self.postMessage({ phase: "grouping", boxes });
      try {
        const { describePhotoFace } = await import("./photo-face-embedding");
        for (const face of detections) {
          const box = face.box;
          descriptors.push(box.width >= 48 && box.height >= 48 && face.score >= 0.8
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
