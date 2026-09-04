import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await mkdir(new URL('public/mediapipe/', root), { recursive: true });
await cp(fileURLToPath(new URL('node_modules/@mediapipe/tasks-vision/wasm/', root)), fileURLToPath(new URL('public/mediapipe/', root)), { recursive: true });
await mkdir(new URL('public/onnx/', root), { recursive: true });
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await cp(fileURLToPath(new URL(`node_modules/onnxruntime-web/dist/${name}`, root)), fileURLToPath(new URL(`public/onnx/${name}`, root)));
}
