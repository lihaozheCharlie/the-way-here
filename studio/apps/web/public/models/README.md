# Local face detector

`blaze-face-short-range.tflite` is the unmodified Google MediaPipe BlazeFace short-range float16 v1 model.

Source: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

Documentation and model card: https://developers.google.com/edge/mediapipe/solutions/vision/face_detector

The model and the `@mediapipe/tasks-vision` WASM runtime are served locally. The application does not contact a CDN for detection. Generated WASM copies in `public/mediapipe` come from the installed package at dev/build time and are not source assets.

## Local face grouping

`face-recognition-sface.onnx` is OpenCV Zoo's unmodified `face_recognition_sface_2021dec.onnx` (MobileFaceNet trained with SFace loss).

Source: https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx

SHA-256: `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`

License: Apache-2.0, see `SFACE-LICENSE` and https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface.

The model receives raw RGB 112×112 NCHW pixels. It normalizes inputs internally. This integration estimates a similarity transform using BlazeFace's two eyes, nose and mouth centre, rather than OpenCV's five-landmark detector. Suggestions use conservative pairwise cosine similarity ≥0.6; this is a product threshold, not a calibrated identity guarantee. Tiny/low-confidence faces stay ungrouped. Descriptors only live in browser memory for the current batch; only suggested member IDs are saved in the local draft. Models and ONNX WASM assets are served locally, with no CDN calls during use.
