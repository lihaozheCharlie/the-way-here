import * as ort from "onnxruntime-web/wasm";
import { faceAlignment, faceTensorPixels } from "./photo-face-alignment";
import { normalizedDescriptor } from "./photo-face-groups";

let session: Promise<ort.InferenceSession> | undefined;
export async function describePhotoFace(bitmap: ImageBitmap, keypoints: Array<{ x: number; y: number }>, origin: string): Promise<number[] | undefined> {
  const transform = faceAlignment(keypoints.map((point) => ({ x: point.x * bitmap.width, y: point.y * bitmap.height })));
  if (!transform) return;
  ort.env.wasm.wasmPaths = `${origin}/onnx/`;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  session ||= ort.InferenceSession.create(`${origin}/models/face-recognition-sface.onnx`, { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 });
  const model = await session;
  const canvas = new OffscreenCanvas(112, 112);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取人脸特征");
  context.fillStyle = "black"; context.fillRect(0, 0, 112, 112);
  context.setTransform(...transform); context.drawImage(bitmap, 0, 0);
  const tensor = new ort.Tensor("float32", faceTensorPixels(context.getImageData(0, 0, 112, 112).data), [1, 3, 112, 112]);
  let result: Record<string, ort.Tensor> | undefined;
  try {
    result = await model.run({ [model.inputNames[0]!]: tensor });
    return normalizedDescriptor(result[model.outputNames[0]!]!.data as Float32Array);
  } finally {
    tensor.dispose(); Object.values(result ?? {}).forEach((value) => value.dispose());
    canvas.width = 0; canvas.height = 0;
  }
}
