import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoBox } from "@the-way-here/shared";
import { detectPhotoBatch } from "./photo-detection";
const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
const photos = [{ id: "a", url: "/a" }, { id: "b", url: "/b" }, { id: "c", url: "/c" }];
const defaults = () => ({ signal: new AbortController().signal, shouldSkip: () => false, onStatus: vi.fn(), onDetected: vi.fn() });
describe("automatic local face detection", () => {
  it("detects a batch sequentially without loading all images at once", async () => {
    let finish!: (boxes: PhotoBox[]) => void;
    const detect = vi.fn().mockImplementationOnce(() => new Promise<PhotoBox[]>((resolve) => { finish = resolve; })).mockResolvedValue([box]);
    const options = { ...defaults(), detect };
    const task = detectPhotoBatch(photos, options);
    expect(detect).toHaveBeenCalledTimes(1);
    finish([box]);
    await task;
    expect(detect.mock.calls.map(([url]) => url)).toEqual(["/a", "/b", "/c"]);
    expect(options.onDetected.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
  });
  it("preserves existing annotations and intentionally empty drafts", async () => {
    const drafts = { a: [box], b: [] };
    const options = { ...defaults(), shouldSkip: (id: string) => Object.hasOwn(drafts, id), detect: vi.fn().mockResolvedValue([box]) };
    await detectPhotoBatch(photos, options);
    expect(options.detect).toHaveBeenCalledTimes(1);
    expect(options.onDetected).toHaveBeenCalledWith("c", [box]);
  });
  it("ignores a late result when annotations were restored during detection", async () => {
    let restored = false;
    const options = { ...defaults(), shouldSkip: () => restored, detect: vi.fn(async () => { restored = true; return [box]; }) };
    await detectPhotoBatch(photos, options);
    expect(options.onDetected).not.toHaveBeenCalled();
  });
  it("reports a failed photo and continues with the rest, including no-face results", async () => {
    const options = { ...defaults(), detect: vi.fn().mockRejectedValueOnce(new Error("检测失败")).mockResolvedValueOnce([]).mockResolvedValueOnce([box]) };
    await detectPhotoBatch(photos, options);
    expect(options.onStatus).toHaveBeenCalledWith("a", { state: "failed", error: "检测失败" });
    expect(options.onStatus).toHaveBeenCalledWith("b", { state: "done", count: 0 });
    expect(options.onDetected.mock.calls).toEqual([["c", [box]]]);
  });
  it("does not apply late results or start the next photo after leaving the batch", async () => {
    const controller = new AbortController();
    const options = { ...defaults(), signal: controller.signal, detect: vi.fn(async () => { controller.abort(); return [box]; }) };
    await detectPhotoBatch(photos, options);
    expect(options.detect).toHaveBeenCalledTimes(1);
    expect(options.onDetected).not.toHaveBeenCalled();
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  respond(data: unknown) { this.onmessage?.({ data }); }
}

describe("batch worker lifecycle", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.useFakeTimers();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("shares one worker across successful photos and releases it only after the batch", async () => {
    const options = defaults();
    const task = detectPhotoBatch(photos, options);
    const worker = FakeWorker.instances[0]!;
    for (let i = 0; i < photos.length; i++) {
      expect(FakeWorker.instances).toHaveLength(1);
      expect(worker.postMessage).toHaveBeenCalledTimes(i + 1);
      expect(worker.terminate).not.toHaveBeenCalled();
      worker.respond({ boxes: i === 1 ? [] : [box] });
      await Promise.resolve();
    }
    await task;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(options.onDetected.mock.calls.map(([id]) => id)).toEqual(["a", "c"]);
  });
  it("creates no worker for skipped or already-cancelled batches", async () => {
    await detectPhotoBatch(photos, { ...defaults(), shouldSkip: () => true });
    const controller = new AbortController(); controller.abort();
    await detectPhotoBatch(photos, { ...defaults(), signal: controller.signal });
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it("cancels the active request, discards late output, and gives a new batch its own worker", async () => {
    const controller = new AbortController();
    const options = { ...defaults(), signal: controller.signal };
    const task = detectPhotoBatch(photos, options);
    const worker = FakeWorker.instances[0]!;
    const lateMessage = worker.onmessage!;
    controller.abort();
    lateMessage({ data: { boxes: [box] } });
    await task;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(options.onDetected).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledOnce();
    const next = detectPhotoBatch(photos.slice(0, 1), defaults());
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1]!.respond({ boxes: [box] });
    await next;
    expect(FakeWorker.instances[1]!.terminate).toHaveBeenCalledOnce();
  });
  it.each(["error", "crash", "timeout"])("replaces a worker after %s and continues with the next photo", async (failure) => {
    const options = defaults();
    const task = detectPhotoBatch(photos.slice(0, 2), options);
    const failed = FakeWorker.instances[0]!;
    if (failure === "error") failed.respond({ error: "图片无法解码" });
    else if (failure === "crash") failed.onerror?.();
    else vi.advanceTimersByTime(30_000);
    await Promise.resolve();
    expect(failed.terminate).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1]!.respond({ boxes: [box] });
    await task;
    expect(options.onStatus).toHaveBeenCalledWith("a", expect.objectContaining({ state: "failed" }));
    expect(options.onDetected.mock.calls).toEqual([["b", [box]]]);
    expect(FakeWorker.instances[1]!.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps boxes when grouping stalls and does not reload the grouping model for later photos", async () => {
    const options = defaults();
    const task = detectPhotoBatch(photos.slice(0, 2), options);
    const first = FakeWorker.instances[0]!;
    first.respond({ phase: "locating" });
    first.respond({ phase: "grouping", boxes: [box] });
    const lateMessage = first.onmessage!;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(options.onDetected).toHaveBeenCalledWith("a", [box]);
    expect(options.onStatus).toHaveBeenCalledWith("a", expect.objectContaining({ state: "done", groupingError: expect.any(String) }));
    const second = FakeWorker.instances[1]!;
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({ groupFaces: false }));
    lateMessage({ data: { boxes: [] } });
    second.respond({ boxes: [box] });
    await task;
    expect(options.onDetected.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels grouping without keeping partial results or starting another image", async () => {
    const controller = new AbortController();
    const options = { ...defaults(), signal: controller.signal };
    const task = detectPhotoBatch(photos, options);
    const worker = FakeWorker.instances[0]!;
    worker.respond({ phase: "grouping", boxes: [box] });
    controller.abort();
    await task;
    expect(options.onDetected).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

});
