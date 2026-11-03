import Foundation
import CryptoKit

public enum MobileError: LocalizedError {
    case invalidPath, invalidData(String), readOnly, conflict(URL), unavailable(String)
    public var errorDescription: String? {
        switch self {
        case .invalidPath: return MobileL10n.text("文件位置无效，未写入任何内容。")
        case .invalidData(let reason), .unavailable(let reason): return MobileL10n.text(reason)
        case .readOnly: return MobileL10n.text("演示与理解页面只读。请保存补充或纠正，原页面不会被覆盖。")
        case .conflict: return MobileL10n.text("这份记录已在另一台设备修改。两个版本都已保留，请核对冲突副本。")
        }
    }
}
public enum MobileProtocol {
    public static let version = 1
    public static func validID(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 100 && value.range(of: "^[a-zA-Z0-9_-]+$", options: .regularExpression) != nil
    }
    public static func validPath(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 1000 && !value.hasPrefix("/") && !value.contains("\\") && !value.contains(":") && !value.unicodeScalars.contains { $0.value < 32 } && value.split(separator: "/", omittingEmptySubsequences: false).allSatisfy { !$0.isEmpty && $0 != "." && $0 != ".." }
    }
    static func checkedURL(_ relative: String, under root: URL) throws -> URL {
        guard validPath(relative) else { throw MobileError.invalidPath }
        // Darwin's fixed /private/var and /var spellings refer to the same
        // system directory. Foundation can choose differently for an existing
        // file and its directory, so normalize only this alias for comparisons.
        func systemPath(_ url: URL) -> String {
            let path = url.path
            return path == "/private/var" || path.hasPrefix("/private/var/") ? String(path.dropFirst("/private".count)) : path
        }
        let target = root.appendingPathComponent(relative)
        guard target.path.hasPrefix(root.path + "/"),
              systemPath(root.resolvingSymlinksInPath()) == systemPath(root),
              systemPath(target.resolvingSymlinksInPath()) == systemPath(target) else { throw MobileError.invalidPath }
        // resolvingSymlinksInPath alone can leave a nonexistent leaf unresolved.
        // Inspect each ancestor explicitly, including broken symlinks.
        var component = root
        for part in relative.split(separator: "/") {
            component.appendPathComponent(String(part))
            if (try? FileManager.default.destinationOfSymbolicLink(atPath: component.path)) != nil { throw MobileError.invalidPath }
        }
        return target
    }
    public static func validSourceFolder(_ value: String) -> Bool {
        validPath(value) && value.split(separator: "/").allSatisfy { !$0.hasPrefix(".") }
    }
    public static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    public static func isCloudQuotaError(_ error: Error) -> Bool {
        let value = error as NSError
        if value.domain == NSCocoaErrorDomain && value.code == NSUbiquitousFileNotUploadedDueToQuotaError { return true }
        if let underlying = value.userInfo[NSUnderlyingErrorKey] as? NSError, underlying !== value { return isCloudQuotaError(underlying) }
        return false
    }
    public static func date(_ value: String) -> Date? {
        let basic = ISO8601DateFormatter()
        if let parsed = basic.date(from:value) { return parsed }
        basic.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        return basic.date(from:value)
    }
    public static func preciseTimestamp(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime,.withFractionalSeconds]; return formatter.string(from:date)
    }
    public static func timestamp(_ date: Date = Date()) -> String { ISO8601DateFormatter().string(from: date) }
    public static func encoder() -> JSONEncoder { let e = JSONEncoder(); e.outputFormatting = [.prettyPrinted, .sortedKeys]; return e }
}
public struct SpaceManifest: Codable, Identifiable, Equatable, Sendable {
    public var version = 1
    public var knowledgeBaseId: String
    public var name: String
    public var nickname: String?
    public var sourcesPath: String
    public var wikiPath: String
    public var createdAt: String
    public var readOnly: Bool
    public var id: String { knowledgeBaseId }
    public init(id: String, name: String, readOnly: Bool = false) {
        self.knowledgeBaseId = id; self.name = name; sourcesPath = "vault/\(id)/sources"; wikiPath = "vault/\(id)/wiki"
        createdAt = MobileProtocol.timestamp(); self.readOnly = readOnly
    }
    public func validate() throws {
        guard version == 1, MobileProtocol.validID(id), !name.isEmpty, name.count <= 40, (nickname?.count ?? 0) <= 40, [sourcesPath,wikiPath].allSatisfy({ path in !path.split(separator:"/").contains(where: { $0.hasPrefix(".") || ["knowledge-engine","node_modules","mobile-space.json","the-way-here.config.yaml","agents.md"].contains(String($0).lowercased()) }) }), MobileProtocol.validPath(sourcesPath), MobileProtocol.validPath(wikiPath), !sourcesPath.lowercased().hasPrefix(wikiPath.lowercased() + "/"), !wikiPath.lowercased().hasPrefix(sourcesPath.lowercased() + "/"), sourcesPath.lowercased() != wikiPath.lowercased() else { throw MobileError.invalidData("空间格式不兼容，请更新客户端。") }
    }
}
public enum TaskKind: String, Codable, CaseIterable, Sendable {
    case diary, build, photoStory = "photo-story", chat, letter, prediction, topics, `import`
    public var title: String { switch self { case .diary: return MobileL10n.text("整理成日记"); case .build: return MobileL10n.text("收进理解"); case .photoStory: return MobileL10n.text("照片故事"); case .chat: return MobileL10n.text("聊聊"); case .letter: return MobileL10n.text("近况回信"); case .prediction: return MobileL10n.text("未来预测"); case .topics: return MobileL10n.text("换一批话题"); case .import: return MobileL10n.text("导入资料") } }
}
public struct TaskRequest: Codable, Identifiable, Equatable, Sendable {
    public var version = 1
    public var id: String
    public var knowledgeBaseId: String
    public var deviceId: String
    public var kind: TaskKind
    public var createdAt: String
    public var text: String
    public var sourcePaths: [String]
    public var contextId: String?
    public var options: [String: String]
    public init(space: String, device: String, kind: TaskKind, text: String, paths: [String] = [], context: String? = nil, options: [String: String] = [:]) {
        id = UUID().uuidString.lowercased(); knowledgeBaseId = space; deviceId = device; self.kind = kind; createdAt = MobileProtocol.timestamp(); self.text = text; sourcePaths = paths; contextId = context; self.options = options
    }
    public func validate() throws {
        guard version == 1, MobileProtocol.validID(id), MobileProtocol.validID(knowledgeBaseId), MobileProtocol.validID(deviceId), text.count <= 50_000, sourcePaths.count <= 100, sourcePaths.allSatisfy(MobileProtocol.validPath), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !sourcePaths.isEmpty, options.count <= 20, options.allSatisfy({ MobileProtocol.validID($0.key) && $0.value.count <= 2000 }) else { throw MobileError.invalidData("任务内容或位置无效。") }
    }
}
public struct TaskReceipt: Codable, Identifiable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable { case queued, processing, completed, failed, cancelled, interrupted, waitingApproval = "waiting-approval" }
    public var version: Int
    public var id: String
    public var knowledgeBaseId: String
    public var status: Status
    public var updatedAt: String
    public var runId: String?
    public var message: String?
    public var phase: String?
    public var progress: Double?
    public var resultPaths: [String]?
    public var log: [String]?
    public var pageCount: Int?
    public var result: String?
    public var terminal: Bool { [.completed, .failed, .cancelled, .interrupted].contains(status) }
    public var label: String { switch status { case .queued: return MobileL10n.text("等待 Mac"); case .processing: return MobileL10n.text("Mac 处理中"); case .waitingApproval: return MobileL10n.text("请在 Mac 确认"); case .completed: return MobileL10n.text("已完成"); case .failed: return MobileL10n.text("未完成，可重试"); case .cancelled: return MobileL10n.text("已取消"); case .interrupted: return MobileL10n.text("处理已中断，请核对后重试") } }
}
public struct Draft: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var knowledgeBaseId: String
    public var text: String
    public var folder: String
    public var updatedAt: String
    public var kind: String
    public var status: String?
    public var savedPath: String?
    public init(space: String, text: String = "", folder: String = "随手记", kind: String = "text", id: String = UUID().uuidString.lowercased()) { self.id = id; knowledgeBaseId = space; self.text = text; self.folder = folder; self.kind = kind; updatedAt = MobileProtocol.timestamp() }
}
public struct Document: Identifiable, Equatable, Sendable {
    public var id: String { path }
    public var path: String
    public var title: String
    public var markdown: String
    public var hash: String
    public var modifiedAt: Date
    public var isSource: Bool
    public var category: String
    /// Display content only; hashes and edits continue to use the complete source.
    public var bodyMarkdown: String {
        let normalized = markdown.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        guard lines.first == "---", let end = lines.dropFirst().firstIndex(where: { $0 == "---" || $0 == "..." }) else { return markdown }
        return lines.dropFirst(end + 1).joined(separator: "\n").trimmingCharacters(in: .newlines)
    }
    public var excerpt: String { String(bodyMarkdown.split(separator: "\n").filter { !$0.hasPrefix("#") }.joined(separator: " ").prefix(160)) }
    public init(path: String, markdown: String, modifiedAt: Date = Date(), isSource: Bool, category: String = "sources") {
        self.path = path; self.markdown = markdown; self.modifiedAt = modifiedAt; self.isSource = isSource; self.category = category
        title = markdown.split(separator: "\n").first(where: { $0.hasPrefix("# ") }).map { String($0.dropFirst(2)) } ?? URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        hash = MobileProtocol.hash(Data(markdown.utf8))
    }
}
public struct FaceAnnotation: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID().uuidString.lowercased()
    public var personId: String
    public var name: String
    public var role: String
    public var x: Double; public var y: Double; public var width: Double; public var height: Double
    public init(name: String = "", role: String = "朋友", x: Double, y: Double, width: Double, height: Double, personId: String = UUID().uuidString.lowercased()) {
        self.name = name; self.role = role; self.x = max(0, min(1, x)); self.y = max(0, min(1, y)); self.width = max(0.01, min(1 - self.x, width)); self.height = max(0.01, min(1 - self.y, height)); self.personId = personId
    }
}
public struct MemoryPhoto: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var path: String
    public var faces: [FaceAnnotation]
    public init(path: String, faces: [FaceAnnotation] = []) { id = UUID().uuidString.lowercased(); self.path = path; self.faces = faces }
}
public struct PhotoDraft: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID().uuidString.lowercased()
    public var knowledgeBaseId: String
    public var title = ""
    public var date = MobileProtocol.timestamp()
    public var location = ""
    public var photos: [MemoryPhoto] = []
    public var story = ""
    public var step = 0
    public var updatedAt = MobileProtocol.timestamp()
    public init(space: String) { knowledgeBaseId = space }
}
public struct MobileSnapshot: Codable, Sendable {
    public struct Page: Codable, Sendable { public var relativePath: String; public var category: String; public var links: [String]? }
    public struct Topic: Codable, Identifiable, Sendable {
        public var id: String; public var title: String; public var question: String; public var reason: String; public var currentUnderstanding: String; public var unknown: String
        public var directions: [String]?
    }
    public var version: Int
    public var knowledgeBaseId: String
    public var updatedAt: String
    public var macVersion: String
    public var protocolVersion: Int?
    public var capabilities: [String]?
    public var deviceName: String?
    public var companionshipStartedAt: String?
    public var pages: [Page]
    public var topics: [Topic]
    public struct Lens: Codable, Identifiable, Sendable { public var id: String; public var displayName: String; public var attention: String; public var helperUse: String }
    public struct Card: Codable, Identifiable, Sendable {
        public struct Section: Codable, Sendable { public var heading: String; public var body: String }
        public var id: String; public var title: String; public var excerpt: String; public var category: String; public var relativePath: String?; public var sections: [Section]
    }
    public struct TimelineNode: Codable, Identifiable, Sendable { public var id: String; public var title: String; public var kind: String; public var start: String?; public var end: String?; public var excerpt: String; public var relativePath: String? }
    public struct Stage: Codable, Sendable { public var title: String; public var relativePath: String; public var range: String; public var focus: String; public var lane: Int; public var current: Bool }
    public var lenses: [Lens]?
    public var cards: [Card]?
    public var timeline: [TimelineNode]?
    public var stages: [Stage]?
}
