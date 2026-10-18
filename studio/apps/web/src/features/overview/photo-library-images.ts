import type { PhotoLibraryImage } from "@the-way-here/shared";

/** Bound native image work and discard queued work when leaving a result set. */
export function photoImageQueue(load: (assetId: string, size: "thumbnail" | "preview", network: boolean) => Promise<PhotoLibraryImage>) {
  let active = 0, closed = false;
  const jobs: Array<{ run: () => void; reject: (error: Error) => void }> = [];
  function drain() {
    while (!closed && active < 4 && jobs.length) { active += 1; jobs.shift()!.run(); }
  }
  return {
    image(assetId: string, size: "thumbnail" | "preview", network: boolean) {
      return new Promise<PhotoLibraryImage>((resolve, reject) => {
        if (closed) { reject(new Error("照片结果已关闭")); return; }
        jobs.push({ reject, run: () => { void load(assetId, size, network).then(resolve, reject).finally(() => { active -= 1; drain(); }); } });
        drain();
      });
    },
    close() { closed = true; for (const job of jobs.splice(0)) job.reject(new Error("照片结果已关闭")); },
  };
}
