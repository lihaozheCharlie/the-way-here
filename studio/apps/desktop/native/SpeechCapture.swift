import Foundation

// This state is also compiled in speech-native.test.mjs without requesting microphone access.
struct SpeechTranscript {
    private var segments: [Int: String] = [:]
    mutating func update(segment: Int, text: String) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty && value.count >= (segments[segment]?.count ?? 0) { segments[segment] = value }
    }
    func hasText(segment: Int) -> Bool { !(segments[segment] ?? "").isEmpty }
    var text: String { segments.keys.sorted().compactMap { segments[$0] }.joined(separator: "\n") }
}

// Native capture runtime
import Speech
import AVFoundation

let engine = AVAudioEngine()
let audioLock = NSLock()
var activeRequest: SFSpeechAudioBufferRecognitionRequest?
var recognizer: SFSpeechRecognizer?
var tasks: [Int: SFSpeechRecognitionTask] = [:]
var transcripts = SpeechTranscript()
var currentSegment = 0
var paused = false
var stopping = false
var finished = false
var lastLevelTime: TimeInterval = 0
var recordingFile: AVAudioFile?
var segmentFile: AVAudioFile?
var segmentURLs: [Int: URL] = [:]
let recordingDirectory = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString)
let recordingURL = recordingDirectory.appendingPathComponent("recording.caf")
var recordingError: String?
var recognitionError: String?

func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) {
        print(json); fflush(stdout)
    }
}
func transcript() -> String {
    transcripts.text
}
func retain(_ text: String, segment: Int) {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    // Empty final callbacks must never erase a usable partial result.
    guard !value.isEmpty else { return }
    transcripts.update(segment: segment, text: value)
    try? transcript().write(to: recordingDirectory.appendingPathComponent("transcript-preview.txt"), atomically: true, encoding: .utf8)
    emit(["event": "transcript", "text": transcript()])
}
let recordingLimit: TimeInterval = 20 * 60
let segmentLength: TimeInterval = 45

func finish(_ error: String? = nil) {
    if finished { return }
    finished = true
    engine.stop()
    audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
    for task in tasks.values { task.cancel() }
    // Segment files are temporary retry material; keep the complete recording and text checkpoint.
    for url in segmentURLs.values { try? FileManager.default.removeItem(at: url) }
    let text = transcript()
    let warning = recordingError ?? recognitionError ?? ""
    emit(["text": text, "error": text.isEmpty ? (error ?? "未能识别这段语音，录音已在本机保留，可打开录音重试。") : "", "warning": warning, "recordingPath": recordingURL.path])
    exit(error == nil ? 0 : 1)
}

func stop(_ error: String? = nil) {
    if stopping || finished { return }
    stopping = true
    engine.stop()
    audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
    audioLock.lock(); recordingFile = nil; segmentFile = nil; audioLock.unlock()
    // Live dictation is a preview. The desktop transcribes the complete saved audio with Whisper.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { finish(error) }
}

func startSegment() {
    guard !stopping, !finished, !paused, let recognizer = recognizer else { return }
    let previous = currentSegment
    currentSegment += 1
    let segment = currentSegment
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.requiresOnDeviceRecognition = true
    // Swap requests without stopping the microphone, so the next segment loses no audio.
    audioLock.lock()
    let previousRequest = activeRequest
    if let format = recordingFile?.processingFormat {
        let url = recordingDirectory.appendingPathComponent("segment-\(segment).caf")
        do { segmentFile = try AVAudioFile(forWriting: url, settings: format.settings); segmentURLs[segment] = url }
        catch { recordingError = "录音备份写入失败：\(error.localizedDescription)" }
    }
    activeRequest = request
    previousRequest?.endAudio()
    audioLock.unlock()
    tasks[segment] = recognizer.recognitionTask(with: request) { result, error in
        DispatchQueue.main.async {
            guard !finished else { return }
            if let result = result { retain(result.bestTranscription.formattedString, segment: segment) }
            if result?.isFinal == true || error != nil {
                tasks.removeValue(forKey: segment)
                if segment == currentSegment && !stopping && !paused {
                    // Silence may complete a task early; keep the recording session open.
                    if let error = error, (error as NSError).code != 1110 {
                        // A preview failure must not stop capture: Whisper will read the full saved audio.
                        recognitionError = error.localizedDescription
                        audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
                    } else {
                        startSegment()
                    }
                }
            }
        }
    }
    // Bound old tasks even when the recognizer never sends a final callback.
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
        tasks.removeValue(forKey: previous)?.cancel()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + segmentLength) {
        if segment == currentSegment { startSegment() }
    }
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard !stopping, !finished else { return }
        if status == .authorized {
            recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
            if recognizer?.isAvailable != true || recognizer?.supportsOnDeviceRecognition != true { recognizer = nil }
        }
        // Microphone capture and final local recognition do not depend on Apple's preview service.
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { finish("没有可用的麦克风。"); return }
        do {
            try FileManager.default.createDirectory(at: recordingDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            recordingFile = try AVAudioFile(forWriting: recordingURL, settings: format.settings)
        } catch { finish("无法建立录音备份，请检查本机存储空间后重试。"); return }
        emit(["event": "recording", "recordingPath": recordingURL.path])
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            audioLock.lock()
            activeRequest?.append(buffer)
            do { try recordingFile?.write(from: buffer); try segmentFile?.write(from: buffer) }
            catch { DispatchQueue.main.async { recordingError = "录音备份写入失败：\(error.localizedDescription)" } }
            audioLock.unlock()
            let now = ProcessInfo.processInfo.systemUptime
            if now - lastLevelTime >= 0.08, let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 {
                lastLevelTime = now
                var sum: Float = 0
                for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
                let rms = sqrt(sum / Float(buffer.frameLength))
                let level = min(1, max(0, (20 * log10(max(rms, 0.00001)) + 55) / 45))
                DispatchQueue.main.async {
                    guard !stopping, !finished else { return }
                    print("{\"event\":\"level\",\"level\":\(level)}"); fflush(stdout)
                }
            }
        }
        startSegment()
        do { engine.prepare(); try engine.start() } catch { finish(error.localizedDescription); return }
        print("{\"event\":\"ready\"}"); fflush(stdout)
        DispatchQueue.main.asyncAfter(deadline: .now() + recordingLimit) { stop() }
    }
}
DispatchQueue.global().async {
    while let command = readLine() {
        DispatchQueue.main.async {
            guard !stopping, !finished else { return }
            if command == "pause" {
                paused = true; engine.pause()
                audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
                emit(["event": "paused", "paused": true])
            } else if command == "resume" {
                do {
                    paused = false; startSegment(); try engine.start()
                    emit(["event": "paused", "paused": false])
                } catch { stop(error.localizedDescription) }
            } else { stop() }
        }
    }
    DispatchQueue.main.async { stop() }
}
RunLoop.main.run()
