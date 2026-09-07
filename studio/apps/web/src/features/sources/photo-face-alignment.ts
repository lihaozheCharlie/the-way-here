type Point = { x: number; y: number };
// SFace's 112px template, using BlazeFace's eyes, nose and mouth centre.
const target: Point[] = [{ x: 38.2946, y: 51.6963 }, { x: 73.5318, y: 51.5014 }, { x: 56.0252, y: 71.7366 }, { x: 56.1396, y: 92.2848 }];
export function faceAlignment(points: Point[]): [number, number, number, number, number, number] | undefined {
  if (points.length < 4 || !points.slice(0, 4).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return;
  const source = points.slice(0, 4);
  if (Math.hypot(source[1]!.x - source[0]!.x, source[1]!.y - source[0]!.y) < 12) return;
  const mean = (list: Point[]) => ({ x: list.reduce((s, p) => s + p.x, 0) / 4, y: list.reduce((s, p) => s + p.y, 0) / 4 });
  const s = mean(source), t = mean(target);
  let norm = 0, dot = 0, cross = 0;
  for (let i = 0; i < 4; i++) {
    const x = source[i]!.x - s.x, y = source[i]!.y - s.y;
    const u = target[i]!.x - t.x, v = target[i]!.y - t.y;
    norm += x * x + y * y; dot += x * u + y * v; cross += x * v - y * u;
  }
  if (!norm) return;
  const a = dot / norm, b = cross / norm;
  return [a, b, -b, a, t.x - a * s.x + b * s.y, t.y - b * s.x - a * s.y];
}

export function faceTensorPixels(rgba: Uint8ClampedArray): Float32Array {
  const area = 112 * 112;
  const data = new Float32Array(area * 3);
  // The SFace graph contains input normalization; feed raw RGB in NCHW order.
  for (let i = 0; i < area; i++) for (let channel = 0; channel < 3; channel++) data[channel * area + i] = rgba[4 * i + channel]!;
  return data;
}
