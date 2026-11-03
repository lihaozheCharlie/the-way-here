import SwiftUI
import AVFoundation
import Speech
import TWHCore

private final class SpeechAudioSink: @unchecked Sendable {
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var file: AVAudioFile?
    func configure(request: SFSpeechAudioBufferRecognitionRequest?, file: AVAudioFile?) { lock.lock(); defer { lock.unlock() }; self.request = request; self.file = file }
    func consume(_ buffer: AVAudioPCMBuffer) -> Bool {
        lock.lock(); defer { lock.unlock() }
        request?.append(buffer)
        do { try file?.write(from: buffer); return true } catch { return false }
    }
}
@MainActor final class SpeechRecorder: ObservableObject {
    @Published var transcript = ""
    @Published var running = false
    @Published var paused = false
    @Published var seconds = 0
    @Published var level: Float = 0
    @Published var error: String?
    @Published var uncertainWords: [String] = []
    private var recognizer: SFSpeechRecognizer?
    var spaceID: String?
    var retainAudioOverride: Bool?
    var onExternalFinish: (() -> Void)?
    var onExternalPause: (() -> Void)?
    private var commandObserver: NSObjectProtocol?
    private var fixtureMode = false
    private let engine = AVAudioEngine()
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var timer: Timer?
    private var segmentTimer: Timer?
    private var prefix = ""
    private var segment = ""
    private var audioFile: AVAudioFile?
    private var audioURL: URL?
    private let sink = SpeechAudioSink()
    private var tapInstalled = false
    private var lifecycle = RecordingSessionLifecycle()
    private var recordingToken: RecordingSessionLifecycle.Token?
    func start() async {
        guard !running && !tapInstalled && !lifecycle.isStarting else { return }
        let token = lifecycle.beginStart()
        fixtureMode = false
        if UXVerificationFixtures.speechEnabled {
            guard lifecycle.activate(token) else { return }
            recordingToken = token
            fixtureMode = true; transcript = "Anonymous speech fixture: these words are simulated for acceptance testing."; running = true; paused = false; seconds = 4
            LiveCapture.begin(); installCommandObserver(token: token); return
        }
        do {
            let authorized = await withCheckedContinuation { continuation in SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) } }
            try Task.checkCancellation()
            guard lifecycle.acceptsPendingStart(token) else { return }
            guard authorized else { throw MobileError.unavailable("请在系统设置允许语音识别，也可以改用键盘输入。") }
            let microphone = await withCheckedContinuation { continuation in AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) } }
            try Task.checkCancellation()
            guard lifecycle.acceptsPendingStart(token) else { return }
            guard microphone else { throw MobileError.unavailable("请在系统设置允许麦克风，也可以改用键盘输入。") }
            guard lifecycle.activate(token) else { return }
            recordingToken = token
            let preference = UserDefaults.standard.string(forKey: "speech.language") ?? "zh-CN"
            let languages = preference == "auto" ? Locale.preferredLanguages + ["en-US", "zh-CN"] : [preference]
            guard let recognizer = languages.compactMap({ SFSpeechRecognizer(locale: Locale(identifier: $0)) }).first(where: { $0.supportsOnDeviceRecognition }) else { throw MobileError.unavailable("此语言的本机识别暂时不可用。请下载系统语言资源或改用键盘；录音不会发送到服务器。") }
            self.recognizer = recognizer
            let session = AVAudioSession.sharedInstance(); try session.setCategory(.record, mode: .measurement, options: [.duckOthers]); try session.setActive(true)
            let input = engine.inputNode, format = input.outputFormat(forBus: 0)
            var directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("SpeechBackups")
            if let spaceID, MobileProtocol.validID(spaceID) { directory = directory.appendingPathComponent(spaceID) }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent(UUID().uuidString + ".caf")
            audioFile = try AVAudioFile(forWriting: url, settings: format.settings); audioURL = url
            let sink = self.sink
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                // Audio is retained locally throughout recognition; no network fallback.
                guard let self else { return }
                if !sink.consume(buffer) { Task { @MainActor in guard self.lifecycle.acceptsResult(token), self.running else { return }; self.error = "本机录音备份写入失败，已识别文字仍保留。请检查设备存储。" } }
                if let data = buffer.floatChannelData?[0], buffer.frameLength > 0 {
                    let sample = abs(data[0]); Task { @MainActor in guard self.lifecycle.acceptsResult(token), self.running else { return }; self.level = min(1, sample * 20) }
                }
            }
            tapInstalled = true
            prefix = transcript; segment = ""; beginSegment(recognizer, token: token)
            engine.prepare(); try engine.start(); running = true; paused = false
            LiveCapture.begin()
            installCommandObserver(token: token)
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in guard let self, self.lifecycle.acceptsResult(token), self.running, !self.paused else { return }; self.seconds += 1; if self.seconds % 5 == 0 { LiveCapture.update(seconds: self.seconds, paused: self.paused) } } }
            segmentTimer = Timer.scheduledTimer(withTimeInterval: 45, repeats: true) { [weak self] _ in Task { @MainActor in guard let self, self.lifecycle.acceptsResult(token), self.running, !self.paused else { return }; self.prefix = self.transcript + "\n"; self.segment = ""; self.beginSegment(recognizer, token: token) } }
        } catch {
            // An old permission continuation must not stop a newer session.
            guard lifecycle.isCurrent(token) else { return }
            if !(error is CancellationError) { self.error = error.localizedDescription }
            stop()
        }
    }
    private func installCommandObserver(token: RecordingSessionLifecycle.Token) {
    UserDefaults(suiteName: "group.com.thewayhere.shared")?.removeObject(forKey: "recording.pendingCommand")
    commandObserver = NotificationCenter.default.addObserver(forName: .init("twh.recordingControl"), object: nil, queue: .main) { [weak self] notification in
        guard let command = notification.object as? String else { return }
        Task { @MainActor in
            guard let self, self.lifecycle.acceptsResult(token), self.running else { return }
            UserDefaults(suiteName: "group.com.thewayhere.shared")?.removeObject(forKey: "recording.pendingCommand")
            switch command { case "pause": self.pause(); self.onExternalPause?(); case "resume": self.resume(); case "finish": if let finish = self.onExternalFinish { self.onExternalFinish = nil; finish() } else { self.stop() }; default: break }
        }
    }
    }
    private func beginSegment(_ recognizer: SFSpeechRecognizer, token: RecordingSessionLifecycle.Token) {
        task?.cancel(); request?.endAudio()
        let request = SFSpeechAudioBufferRecognitionRequest(); request.shouldReportPartialResults = true; request.requiresOnDeviceRecognition = true; request.addsPunctuation = UserDefaults.standard.object(forKey: "speech.punctuation") as? Bool ?? true
        request.contextualStrings = (UserDefaults.standard.string(forKey: "speech.contextualVocabulary") ?? UserDefaults.standard.string(forKey: "speech.vocabulary") ?? "").components(separatedBy: "\n").filter { !$0.isEmpty }
        self.request = request
        sink.configure(request: request, file: audioFile)
        task = recognizer.recognitionTask(with: request) { [weak self, weak request] result, error in
            Task { @MainActor in
                guard let self, let request, request === self.request,
                      self.lifecycle.acceptsResult(token), self.running else { return }
                if let result { self.uncertainWords = result.bestTranscription.segments.filter { $0.confidence > 0 && $0.confidence < 0.6 }.map(\.substring) }
                if let result, !self.paused {
                    var text = result.bestTranscription.formattedString
                    if UserDefaults.standard.object(forKey: "speech.paragraphs") as? Bool ?? true {
                        let segments = result.bestTranscription.segments
                        for index in segments.indices.dropFirst().reversed() where segments[index].timestamp - (segments[index - 1].timestamp + segments[index - 1].duration) > 1.2 {
                            let location = segments[index].substringRange.location
                            if location <= (text as NSString).length { text = (text as NSString).replacingCharacters(in: NSRange(location: location, length: 0), with: "\n") }
                        }
                        text = text.replacingOccurrences(of: "([。！？!?]) +", with: "$1\n", options: .regularExpression)
                    }
                    if text.count >= self.segment.count / 2 { self.segment = text; self.transcript = self.prefix + text }
                }
                if let error, self.running, !self.paused { self.error = "识别中断，已识别文字与本机录音已保留。\(error.localizedDescription)" }
            }
        }
    }
    func editTranscript(_ value: String) { pause(); transcript = value }
    func pause() { guard running else { return }; if !fixtureMode { engine.pause() }; paused = true; LiveCapture.update(seconds: seconds, paused: true) }
    func resume() { guard running, paused, let token = recordingToken, lifecycle.acceptsResult(token) else { return }; if fixtureMode { paused = false; LiveCapture.update(seconds: seconds, paused: false); return }; do { prefix = transcript.isEmpty ? "" : transcript + "\n"; segment = ""; if let recognizer { beginSegment(recognizer, token: token) }; try engine.start(); paused = false; LiveCapture.update(seconds: seconds, paused: false) } catch { self.error = error.localizedDescription } }
    func stop() {
        // Invalidate pending permission continuations and queued recognition work
        // before stopping hardware or preserving the final visible transcript.
        lifecycle.stop(); recordingToken = nil
        if let commandObserver { NotificationCenter.default.removeObserver(commandObserver); self.commandObserver = nil }; onExternalFinish = nil; onExternalPause = nil
        engine.stop(); if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        let stoppedRequest = request; request = nil
        stoppedRequest?.endAudio(); task?.cancel(); task = nil
        timer?.invalidate(); timer = nil; segmentTimer?.invalidate(); segmentTimer = nil; audioFile = nil
        sink.configure(request: nil, file: nil); LiveCapture.end()
        let retain = retainAudioOverride ?? (UserDefaults.standard.object(forKey: "speech.keepAudio") as? Bool ?? true)
        if !retain, error == nil, let audioURL { try? FileManager.default.removeItem(at: audioURL) }
        if let directory = audioURL?.deletingLastPathComponent(), let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey]) { for file in files { if let date = try? file.resourceValues(forKeys: [.creationDateKey]).creationDate, Date().timeIntervalSince(date) > 7 * 86400 { try? FileManager.default.removeItem(at: file) } } }
        running = false; paused = false; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
