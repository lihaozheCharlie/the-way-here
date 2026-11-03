import Foundation
public struct MacCompatibility: Sendable {
    public let version: String
    public let protocolVersion: Int?
    public let capabilities: [String]?
    public init(version: String, protocolVersion: Int?, capabilities: [String]?) { self.version = version; self.protocolVersion = protocolVersion; self.capabilities = capabilities }
    public var requiresPhoneUpdate: Bool { (protocolVersion ?? 1) > MobileProtocol.version }
    public var requiresMacUpdate: Bool { version != "demo" && (capabilities == nil || TaskKind.allCases.contains(where:{!(capabilities?.contains($0.rawValue) ?? false)})) }
    public func supports(_ kind: TaskKind) -> Bool { !requiresPhoneUpdate && (capabilities?.contains(kind.rawValue) ?? false) }
    public var affectedFeatures: [String] { TaskKind.allCases.filter { !supports($0) }.map(\.title) }
}
public struct MacHeartbeat: Codable, Sendable {
    public var version: Int
    public var knowledgeBaseId: String
    public var updatedAt: String
    public var macVersion: String
    public var deviceName: String?
    public var online: Bool { MobileProtocol.date(updatedAt).map { Date().timeIntervalSince($0) < 150 } ?? false }
}
extension SpaceStore {
    public func heartbeat() throws -> MacHeartbeat? {
        let file = try url(".mobile/heartbeat.json")
        guard files.fileExists(atPath:file.path) else { return nil }
        let heartbeat = try JSONDecoder().decode(MacHeartbeat.self,from:read(".mobile/heartbeat.json"))
        guard heartbeat.knowledgeBaseId == manifest.id else { throw MobileError.invalidData("Mac 心跳与当前空间不匹配。") }
        return heartbeat
    }
    func assertTaskCapability(_ kind: TaskKind) throws {
        if let snapshot = try snapshot() {
            let compatibility = MacCompatibility(version:snapshot.macVersion,protocolVersion:snapshot.protocolVersion,capabilities:snapshot.capabilities)
            if !compatibility.supports(kind) { throw MobileError.unavailable(compatibility.requiresPhoneUpdate ? "Mac 使用了更新的手机协议。请更新 iPhone App，原文与阅读仍可使用。" : "Mac 版本尚不支持这项手机任务。请先更新 Mac，原文与草稿已保留。") }
        }
        if try lifecycleState().archived { throw MobileError.unavailable("空间已移到最近删除，请先恢复。") }
    }
}
