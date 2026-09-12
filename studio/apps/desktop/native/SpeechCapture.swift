import Foundation
import Speech
import AVFoundation

let engine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
var task: SFSpeechRecognitionTask?
var transcript = ""
var finished = false
func finish(_ error: String? = nil) {
    if finished { return }; finished = true
    engine.stop(); request.endAudio(); task?.cancel()
    let result = ["text": transcript, "error": error ?? ""]
    if let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data:data,encoding:.utf8) { print(json); fflush(stdout) }
    exit(error == nil ? 0 : 1)
}
SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard status == .authorized else { finish("请在系统设置的隐私与安全性中允许语音识别。"); return }
        guard let recognizer = SFSpeechRecognizer(locale:Locale(identifier:"zh-CN")), recognizer.isAvailable else { finish("系统语音识别暂不可用，请稍后再试或直接输入。"); return }
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        let input = engine.inputNode
        let format = input.outputFormat(forBus:0)
        guard format.sampleRate > 0 else { finish("没有可用的麦克风。"); return }
        input.installTap(onBus:0,bufferSize:1024,format:format) { buffer,_ in request.append(buffer) }
        task = recognizer.recognitionTask(with:request) { result,error in
            if let result = result { transcript = result.bestTranscription.formattedString; if result.isFinal { finish(); return } }
            if let error = error { finish(transcript.isEmpty ? error.localizedDescription : nil) }
        }
        do { engine.prepare(); try engine.start() } catch { finish(error.localizedDescription) }
        DispatchQueue.main.asyncAfter(deadline:.now()+60) { finish() }
    }
}
DispatchQueue.global().async { _ = readLine(); DispatchQueue.main.async { engine.stop(); request.endAudio(); DispatchQueue.main.asyncAfter(deadline:.now()+1) { finish() } } }
RunLoop.main.run()
