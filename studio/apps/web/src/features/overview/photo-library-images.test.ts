import { describe, expect, it } from "vitest";
import { photoImageQueue } from "./photo-library-images";
describe("photo image work", () => {
  it("bounds native work and rejects queued requests when the result set closes", async () => {
    const completions: Array<() => void> = [];
    const queue = photoImageQueue(() => new Promise(resolve => completions.push(() => resolve({ cloudOnly: true }))));
    const jobs = Array.from({ length: 6 }, (_, i) => queue.image(String(i), "thumbnail", false));
    const queued = jobs.slice(4).map(job => expect(job).rejects.toThrow("已关闭"));
    expect(completions).toHaveLength(4);
    queue.close();
    completions.forEach(finish => finish());
    await Promise.all([...jobs.slice(0, 4), ...queued]);
    await expect(queue.image("later", "thumbnail", false)).rejects.toThrow("已关闭");
  });
});
