import { afterEach, expect, it, vi } from "vitest";

const vision = vi.hoisted(() => ({ files: vi.fn(), create: vi.fn() }));
const embedding = vi.hoisted(() => vi.fn());
vi.mock("./photo-face-embedding", () => ({ describePhotoFace: embedding }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vision.files },
  FaceDetector: { createFromOptions: vision.create },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it("initializes one model for successive photos and releases each decoded image", async () => {
  const scope = { onmessage: undefined as ((event: unknown) => Promise<void>) | undefined, postMessage: vi.fn() };
  const detect = vi.fn().mockReturnValue({ detections: [{ boundingBox: { originX: 20, originY: 20, width: 20, height: 20 } }] });
  const images = [0, 1].map(() => ({ width: 100, height: 100, close: vi.fn() }));
  vision.files.mockResolvedValue({}); vision.create.mockResolvedValue({ detect });
  vi.stubGlobal("self", scope);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(images[0]).mockResolvedValueOnce(images[1]));
  await import("./photo-face.worker");
  for (const url of ["/one", "/two"]) await scope.onmessage!({ data: { url, origin: "http://localhost" } });
  expect(vision.files).toHaveBeenCalledOnce();
  expect(vision.create).toHaveBeenCalledOnce();
  expect(vision.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ baseOptions: expect.objectContaining({ modelAssetPath: "http://localhost/models/blaze-face-full-range.tflite" }) }));
  expect(detect).toHaveBeenCalledTimes(2);
  expect(scope.postMessage.mock.calls.filter(([result]) => result.boxes && !result.phase)).toHaveLength(2);
  for (const image of images) expect(image.close).toHaveBeenCalledOnce();
});

it("preserves detected faces when feature extraction fails and excludes small faces from grouping", async () => {
  const scope = { onmessage: undefined as ((event: unknown) => Promise<void>) | undefined, postMessage: vi.fn() };
  const detections = [20, 80].map((size) => ({ boundingBox: { originX: 20, originY: 20, width: size, height: size }, categories: [{ score: 0.95 }], keypoints: [] }));
  vision.files.mockResolvedValue({}); vision.create.mockResolvedValue({ detect: () => ({ detections }) });
  embedding.mockRejectedValue(new Error("model unavailable"));
  const bitmap = { width: 200, height: 200, close: vi.fn() };
  vi.stubGlobal("self", scope);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }));
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  await import("./photo-face.worker");
  await scope.onmessage!({ data: { url: "/photo", origin: "http://localhost", groupFaces: true } });
  expect(embedding).toHaveBeenCalledOnce();
  const result = scope.postMessage.mock.calls.at(-1)![0];
  expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ phase: "grouping", boxes: expect.any(Array) }));
  expect(result.boxes).toHaveLength(2);
  expect(result.descriptors).toEqual([undefined]);
  expect(result.groupingError).toContain("仍可逐个确认");
  expect(bitmap.close).toHaveBeenCalledOnce();
});
