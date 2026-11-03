import Foundation
import AppIntents

enum CaptureAction: String, AppEnum {
    case speak, write, photos, letter
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "记录入口")
    static var caseDisplayRepresentations: [CaptureAction: DisplayRepresentation] = [.speak: "说一段", .write: "写一段", .photos: "找照片", .letter: "读最近回信"]
    var route: String { switch self { case .speak: return "record"; case .write: return "write"; case .photos: return "photos"; case .letter: return "letters" } }
}
struct OpenCaptureIntent: AppIntent {
    static var title: LocalizedStringResource = "在 The Way Here 记一笔"
    static var openAppWhenRun = true
    @Parameter(title: "方式", default: .speak) var action: CaptureAction
    init() {}
    init(_ action: CaptureAction) { self.action = action }
    func perform() async throws -> some IntentResult {
        let shared = UserDefaults(suiteName: "group.com.thewayhere.shared")
        let route = action == .letter ? shared?.string(forKey: "system.latestUnreadLetterURL") ?? "thewayhere://letters" : "thewayhere://\(action.route)"
        shared?.set(route, forKey: "intent.pendingURL")
        await MainActor.run { NotificationCenter.default.post(name: .init("twh.deepLink"), object: URL(string: route)) }
        return .result()
    }
}
struct CaptureShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: OpenCaptureIntent(.speak), phrases: ["在 \(.applicationName) 记一笔", "用 \(.applicationName) 说一段"], shortTitle: "说一段", systemImageName: "mic")
        AppShortcut(intent: OpenCaptureIntent(.write), phrases: ["用 \(.applicationName) 写一段"], shortTitle: "写一段", systemImageName: "square.and.pencil")
        AppShortcut(intent: OpenCaptureIntent(.photos), phrases: ["用 \(.applicationName) 讲照片故事"], shortTitle: "找照片", systemImageName: "photo")
        AppShortcut(intent: OpenCaptureIntent(.letter), phrases: ["读 \(.applicationName) 最近回信"], shortTitle: "读最近回信", systemImageName: "envelope")
    }
}

enum RecordingCommand: String, AppEnum {
    case pause, resume, finish
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "录音控制")
    static var caseDisplayRepresentations: [RecordingCommand: DisplayRepresentation] = [.pause: "暂停录音", .resume: "继续录音", .finish: "完成录音"]
}
struct RecordingCommandIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "控制当前录音"
    static var openAppWhenRun = false
    @Parameter(title: "动作", default: .finish) var command: RecordingCommand
    init() {}
    init(_ command: RecordingCommand) { self.command = command }
    @MainActor func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: "group.com.thewayhere.shared")?.set(command.rawValue, forKey: "recording.pendingCommand")
        NotificationCenter.default.post(name: .init("twh.recordingControl"), object: command.rawValue)
        return .result()
    }
}
