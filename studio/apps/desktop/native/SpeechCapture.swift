import Foundation
import Speech
import AVFoundation

let engine = AVAudioEngine()
let audioLock = NSLock()
var activeRequest: SFSpeechAudioBufferRecognitionRequest?
var recognizer: SFSpeechRecognizer?
var tasks: [Int: SFSpeechRecognitionTask] = [:]
var transcripts: [Int: String] = [:]
var currentSegment = 0
var stopping = false
var finished = false
let recordingLimit: TimeInterval = 20 * 60
let segmentLength: TimeInterval = 50

func finish(_ error: String? = nil) {
    if finished { return }
    finished = true
    engine.stop()
    audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
    for task in tasks.values { task.cancel() }
    let text = transcripts.keys.sorted().compactMap { transcripts[$0] }.filter { !$0.isEmpty }.joined(separator: "\n")
    let result = ["text": text, "error": error ?? ""]
    if let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) {
        print(json); fflush(stdout)
    }
    exit(error == nil ? 0 : 1)
}

func stop(_ error: String? = nil) {
    if stopping || finished { return }
    stopping = true
    engine.stop()
    audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
    // Let final recognition callbacks settle before returning the collected text.
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
        finish(transcripts.values.allSatisfy { $0.isEmpty } ? error : nil)
    }
}

func startSegment() {
    guard !stopping, !finished, let recognizer = recognizer else { return }
    let previous = currentSegment
    currentSegment += 1
    let segment = currentSegment
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    // Swap requests without stopping the microphone, so the next segment loses no audio.
    audioLock.lock()
    let previousRequest = activeRequest
    activeRequest = request
    previousRequest?.endAudio()
    audioLock.unlock()
    tasks[segment] = recognizer.recognitionTask(with: request) { result, error in
        DispatchQueue.main.async {
            guard !finished else { return }
            if let result = result { transcripts[segment] = result.bestTranscription.formattedString }
            if result?.isFinal == true || error != nil {
                tasks.removeValue(forKey: segment)
                if segment == currentSegment && !stopping {
                    // Silence may complete a task early; keep the recording session open.
                    if let error = error, (error as NSError).code != 1110 {
                        stop(error.localizedDescription)
                    } else {
                        startSegment()
                    }
                }
            }
        }
    }
    // Bound old tasks even when the recognizer never sends a final callback.
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
        tasks.removeValue(forKey: previous)?.cancel()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + segmentLength) {
        if segment == currentSegment { startSegment() }
    }
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard !stopping, !finished else { return }
        guard status == .authorized else { finish("请在系统设置的隐私与安全性中允许语音识别。"); return }
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
        guard recognizer?.isAvailable == true else { finish("系统语音识别暂不可用，请稍后再试或直接输入。"); return }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { finish("没有可用的麦克风。"); return }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            audioLock.lock(); activeRequest?.append(buffer); audioLock.unlock()
        }
        startSegment()
        do { engine.prepare(); try engine.start() } catch { finish(error.localizedDescription); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + recordingLimit) { stop() }
    }
}
DispatchQueue.global().async { _ = readLine(); DispatchQueue.main.async { stop() } }
RunLoop.main.run()
