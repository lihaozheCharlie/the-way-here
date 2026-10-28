import Foundation

// This state is also compiled in speech-native.test.mjs without requesting microphone access.
struct SpeechTranscript {
    private var segments: [Int: String] = [:]
    mutating func update(segment: Int, text: String) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty && value.count >= (segments[segment]?.count ?? 0) { segments[segment] = value }
    }
    // The utterance accumulator already preserves completed audio ranges, so a
    // live correction may safely shorten its current utterance.
    mutating func revise(segment: Int, text: String) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty { segments[segment] = value }
    }
    // A final callback can contain only the tail of a segment. Treat a large
    // loss of text as incomplete recognition, while allowing small corrections.
    @discardableResult
    mutating func finalize(segment: Int, text: String) -> Bool {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let previous = segments[segment] ?? ""
        guard previous.isEmpty || value.count * 2 >= previous.count else { return false }
        if !value.isEmpty { segments[segment] = value }
        return true
    }
    func hasText(segment: Int) -> Bool { !(segments[segment] ?? "").isEmpty }
    var text: String { segments.keys.sorted().compactMap { segments[$0] }.joined(separator: "\n") }
}

// SFSpeechRecognizer may emit several completed utterances before isFinal.
// Timed results replace their own audio range; untimed results revise only the
// current utterance. Text length cannot distinguish a correction from a reset.
struct SpeechRecognitionText {
    struct Utterance { let start: Double; let end: Double; let text: String }
    private var utterances: [Utterance] = []
    private var pending = ""
    mutating func update(text: String, start: Double = 0, end: Double = 0) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        if end > start {
            utterances.removeAll { $0.start < end && $0.end > start }
            utterances.append(Utterance(start: start, end: end, text: value))
            utterances.sort { $0.start < $1.start }
            pending = ""
        } else {
            pending = value
        }
    }
    var text: String { (utterances.map { $0.text } + [pending]).filter { !$0.isEmpty }.joined(separator: "\n") }
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
var liveTranscripts: [Int: SpeechRecognitionText] = [:]
var currentSegment = 0
var recognitionFailures = 0
var paused = false
var stopping = false
var finished = false
var finalizing = false
var finalTask: SFSpeechRecognitionTask?
var failedSegments = Set<Int>()
var lastLevelTime: TimeInterval = 0
var recordingFile: AVAudioFile?
var segmentFile: AVAudioFile?
var segmentURLs: [Int: URL] = [:]
// Explicit offline replay uses the same capture/recognition path without a microphone.
let replayIndex = CommandLine.arguments.firstIndex(of: "--replay")
let replayURL = replayIndex.flatMap { $0 + 1 < CommandLine.arguments.count ? URL(fileURLWithPath: CommandLine.arguments[$0 + 1]) : nil }
let recordingRoot = CommandLine.arguments.dropFirst().first ?? NSTemporaryDirectory()
let recordingDirectory = URL(fileURLWithPath: recordingRoot).appendingPathComponent(UUID().uuidString)
var replayFile: AVAudioFile?
var replayTimer: DispatchSourceTimer?
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
    transcripts.revise(segment: segment, text: value)
    try? transcript().write(to: recordingDirectory.appendingPathComponent("transcript-preview.txt"), atomically: true, encoding: .utf8)
    emit(["event": "transcript", "text": transcript()])
}
let recordingLimit: TimeInterval = 20 * 60
let segmentLength: TimeInterval = 45

func finish(_ error: String? = nil) {
    if finished { return }
    finished = true
    replayTimer?.cancel(); replayTimer = nil
    engine.stop()
    audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
    for task in tasks.values { task.cancel() }
    finalTask?.cancel()
    // Segment files are temporary retry material; keep the complete recording and text checkpoint.
    for (segment, url) in segmentURLs where !failedSegments.contains(segment) { try? FileManager.default.removeItem(at: url) }
    try? transcript().write(to: recordingDirectory.appendingPathComponent("transcript-final.txt"), atomically: true, encoding: .utf8)
    let text = transcript()
    let warning = recordingError ?? recognitionError ?? ""
    emit(["text": text, "error": text.isEmpty ? (error ?? "未能识别这段语音，录音已在本机保留，可打开录音重试。") : "", "warning": warning, "recordingPath": recordingURL.path])
    exit(error == nil ? 0 : 1)
}

// Re-read every saved segment; partial callbacks alone are not a complete recording.
func transcribeSegments(_ remaining: ArraySlice<Int>, total: Int, error: String?) {
    guard !finished else { return }
    guard let segment = remaining.first, let recognizer = recognizer, let url = segmentURLs[segment] else {
        emit(["event": "progress", "percent": 100]); finish(error); return
    }
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = true
    request.addsPunctuation = true
    request.taskHint = .dictation
    var completed = false
    var recognized = SpeechRecognitionText()
    func complete(_ successful: Bool) {
        guard !completed, !finished else { return }
        completed = true
        finalTask?.cancel(); finalTask = nil
        let best = recognized.text
        let accepted = successful && transcripts.finalize(segment: segment, text: best)
        if !accepted { transcripts.update(segment: segment, text: best) }
        if !accepted {
            failedSegments.insert(segment)
            recognitionError = "部分语音未能完成识别，已保留识别文字和原始录音。"
        }
        emit(["event": "transcript", "text": transcript()])
        try? transcript().write(to: recordingDirectory.appendingPathComponent("transcript-final.txt"), atomically: true, encoding: .utf8)
        emit(["event": "progress", "percent": (total - remaining.count + 1) * 100 / max(total, 1)])
        // Yield before starting another task so late callbacks cannot affect the next one.
        DispatchQueue.main.async { transcribeSegments(remaining.dropFirst(), total: total, error: error) }
    }
    finalTask = recognizer.recognitionTask(with: request) { result, failure in
        DispatchQueue.main.async {
            guard !completed, !finished else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                let words = result.bestTranscription.segments
                recognized.update(text: text, start: words.first?.timestamp ?? 0,
                                  end: words.last.map { $0.timestamp + $0.duration } ?? 0)
                if result.isFinal { complete(true); return }
            }
            if let failure = failure {
                // Silence in a segment is valid; do not warn merely because no words were spoken.
                complete((failure as NSError).code == 1110 && recognized.text.isEmpty && !transcripts.hasText(segment: segment))
            }
        }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 60) { complete(false) }
}

func stop(_ error: String? = nil, discard: Bool = false) {
    if stopping || finished { return }
    stopping = true
    replayTimer?.cancel(); replayTimer = nil
    engine.stop()
    audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil
    recordingFile = nil; segmentFile = nil; audioLock.unlock()
    if discard { finish(error); return }
    finalizing = true
    for task in tasks.values { task.cancel() }; tasks.removeAll()
    recognitionError = nil
    emit(["event": "processing"])
    emit(["event": "progress", "percent": 0])
    let segments = segmentURLs.keys.sorted()
    transcribeSegments(segments[...], total: segments.count, error: error)
}

func startSegment() {
    guard !stopping, !finished, !paused, let recognizer = recognizer else { return }
    let previous = currentSegment
    currentSegment += 1
    let segment = currentSegment
    if replayURL != nil { emit(["event": "replay-segment", "segment": segment]) }
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.requiresOnDeviceRecognition = true
    request.addsPunctuation = true
    request.taskHint = .dictation
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
            guard !finished, !finalizing else { return }
            if let result = result {
                let words = result.bestTranscription.segments
                if !result.bestTranscription.formattedString.isEmpty { recognitionFailures = 0 }
                var recognized = liveTranscripts[segment] ?? SpeechRecognitionText()
                recognized.update(text: result.bestTranscription.formattedString,
                                  start: words.first?.timestamp ?? 0,
                                  end: words.last.map { $0.timestamp + $0.duration } ?? 0)
                liveTranscripts[segment] = recognized
                retain(recognized.text, segment: segment)
            }
            if result?.isFinal == true || error != nil {
                tasks.removeValue(forKey: segment)
                if segment == currentSegment {
                    audioLock.lock(); activeRequest = nil; audioLock.unlock()
                }
                // A task may end on silence or a service interruption. Never keep
                // appending to that dead request until the 45-second timer fires.
                if segment == currentSegment && !paused && !stopping {
                    recognitionFailures = error == nil ? 0 : min(recognitionFailures + 1, 5)
                    let delay = error == nil ? 0.25 : min(5, pow(2, Double(recognitionFailures - 1)) * 0.25)
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                        if segment == currentSegment { startSegment() }
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

if replayURL != nil { emit(["event": "replay-start", "pid": ProcessInfo.processInfo.processIdentifier]) }
SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard !stopping, !finished else { return }
        guard status == .authorized else {
            finish("请在系统设置的隐私与安全性中允许语音识别后重试。"); return
        }
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
        guard recognizer?.isAvailable == true, recognizer?.supportsOnDeviceRecognition == true else {
            finish("本机中文语音识别尚不可用，请在系统设置中启用中文听写并完成系统语音资源下载后重试。"); return
        }
        let input = replayURL == nil ? engine.inputNode : nil
        if let url = replayURL {
            do { replayFile = try AVAudioFile(forReading: url) }
            catch { finish("无法读取重放录音：\(error.localizedDescription)"); return }
        }
        guard let format = replayFile?.processingFormat ?? input?.outputFormat(forBus: 0), format.sampleRate > 0 else {
            finish("没有可用的音频输入。"); return
        }
        do {
            try FileManager.default.createDirectory(at: recordingDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            recordingFile = try AVAudioFile(forWriting: recordingURL, settings: format.settings)
        } catch { finish("无法建立录音备份，请检查本机存储空间后重试。"); return }
        emit(["event": "recording", "recordingPath": recordingURL.path])
        let consume: (AVAudioPCMBuffer) -> Void = { buffer in
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
        if let file = replayFile {
            let timer = DispatchSource.makeTimerSource(queue: .main)
            replayTimer = timer
            timer.schedule(deadline: .now(), repeating: 1024 / format.sampleRate)
            timer.setEventHandler {
                guard !stopping, !finished, !paused else { return }
                do {
                    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1024)!
                    try file.read(into: buffer)
                    if buffer.frameLength == 0 { stop() } else { consume(buffer) }
                } catch { stop(error.localizedDescription) }
            }
            timer.resume()
        } else {
            input?.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in consume(buffer) }
            do { engine.prepare(); try engine.start() } catch { finish(error.localizedDescription); return }
        }
        print("{\"event\":\"ready\"}"); fflush(stdout)
        DispatchQueue.main.asyncAfter(deadline: .now() + recordingLimit) { stop() }
    }
}
if replayURL == nil || CommandLine.arguments.contains("--replay-commands") { DispatchQueue.global().async {
    while let command = readLine() {
        DispatchQueue.main.async {
            guard !stopping, !finished else { return }
            if command == "pause" {
                paused = true; engine.pause()
                audioLock.lock(); activeRequest?.endAudio(); activeRequest = nil; audioLock.unlock()
                emit(["event": "paused", "paused": true])
            } else if command == "resume" {
                do {
                    paused = false; startSegment(); if replayURL == nil { try engine.start() }
                    emit(["event": "paused", "paused": false])
                } catch { stop(error.localizedDescription) }
            } else { stop(discard: command == "discard") }
        }
    }
    DispatchQueue.main.async { stop() }
} }
RunLoop.main.run()
