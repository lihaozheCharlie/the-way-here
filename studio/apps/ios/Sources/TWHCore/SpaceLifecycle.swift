import Foundation

public struct SpaceLifecycleEvent: Codable, Sendable {
    public var version = 1
    public var id = UUID().uuidString.lowercased()
    public var knowledgeBaseId: String
    public var requestId: String
    public var action: String
    public var at = MobileProtocol.timestamp()
    public var name: String
    public var expiresAt: String?
}
public struct SpaceLifecycleState: Codable, Sendable {
    public var status = "active"
    public var requestId: String?
    public var requestedAt: String?
    public var deletedAt: String?
    public var expiresAt: String?
    public var name: String?
    public init() {}
    public var archived: Bool { status == "deleted" || status == "purged" }
    public var canRestore: Bool { status == "deleted" && (expiresAt.flatMap { MobileProtocol.date($0) } ?? .distantPast) > Date() }
    public static func reduce(_ events: [SpaceLifecycleEvent], space: String) -> Self {
        var result = Self()
        let priority = ["request":0,"delete":1,"cancel":2,"restore":2,"purge":3]
        for event in events.filter({ $0.version == 1 && $0.knowledgeBaseId == space && MobileProtocol.validID($0.id) && MobileProtocol.validID($0.requestId) && priority[$0.action] != nil && MobileProtocol.date($0.at) != nil }).sorted(by: { MobileProtocol.date($0.at) == MobileProtocol.date($1.at) ? priority[$0.action]! == priority[$1.action]! ? $0.id < $1.id : priority[$0.action]! < priority[$1.action]! : MobileProtocol.date($0.at)! < MobileProtocol.date($1.at)! }) {
            if event.action == "request" && result.status == "active" { result.status = "requested"; result.requestId = event.requestId; result.requestedAt = event.at; result.name = event.name }
            else if result.requestId == event.requestId {
                if event.action == "cancel" && result.status == "requested" { result = Self() }
                if event.action == "delete" && result.status == "requested", let expiry = event.expiresAt, MobileProtocol.date(expiry) != nil, MobileProtocol.date(expiry)! > MobileProtocol.date(event.at)! { result.status = "deleted"; result.deletedAt = event.at; result.expiresAt = expiry }
                if event.action == "restore" && result.status == "deleted", let expiry = result.expiresAt, MobileProtocol.date(event.at)! < MobileProtocol.date(expiry)! { result = Self() }
                if event.action == "purge" && result.status == "deleted", let expiry = result.expiresAt, MobileProtocol.date(event.at)! >= MobileProtocol.date(expiry)! { result.status = "purged" }
            }
        }
        return result
    }
}
extension SpaceStore {
    public func lifecycleEvents() throws -> [SpaceLifecycleEvent] { try jsonFiles(".mobile/space-events",as:SpaceLifecycleEvent.self) }
    public func lifecycleState() throws -> SpaceLifecycleState { SpaceLifecycleState.reduce(try lifecycleEvents(), space:manifest.id) }
    public func requestDeletion(confirmName: String) throws {
        guard !manifest.readOnly, confirmName == manifest.name, try lifecycleState().status == "active" else { throw MobileError.invalidData("空间名称或状态已变化，请重新核对。") }
        let requestId = UUID().uuidString.lowercased()
        try writeSpaceEvent(SpaceLifecycleEvent(knowledgeBaseId:manifest.id,requestId:requestId,action:"request",name:manifest.name))
    }
    public func cancelDeletion() throws {
        let state = try lifecycleState()
        guard state.status == "requested", let requestId = state.requestId else { throw MobileError.unavailable("没有可撤销的删除申请。") }
        try writeSpaceEvent(SpaceLifecycleEvent(knowledgeBaseId:manifest.id,requestId:requestId,action:"cancel",name:manifest.name))
    }
    public func restoreSpace() throws {
        let state = try lifecycleState()
        guard state.canRestore, let requestId = state.requestId else { throw MobileError.unavailable("空间已超过 30 天恢复期限。") }
        try writeSpaceEvent(SpaceLifecycleEvent(knowledgeBaseId:manifest.id,requestId:requestId,action:"restore",name:manifest.name))
    }
    private func writeSpaceEvent(_ input: SpaceLifecycleEvent) throws {
        var event = input
        let latest = try jsonFiles(".mobile/space-events", as: SpaceLifecycleEvent.self).filter { $0.knowledgeBaseId == manifest.id }.compactMap { MobileProtocol.date($0.at) }.max() ?? .distantPast
        let causalDate = max(MobileProtocol.date(event.at) ?? Date(), latest.addingTimeInterval(0.001))
        event.at = MobileProtocol.preciseTimestamp(causalDate)
        try writeJSON(event,path:".mobile/space-events/\(event.id).json",exclusive:true) }
    public func purgeExpiredSpace(now: Date = Date()) throws {
        let state = try lifecycleState()
        guard (state.status == "deleted" || state.status == "purged"), let expiry = state.expiresAt.flatMap({ MobileProtocol.date($0) }), expiry <= now, let requestId = state.requestId else { return }
        var event = SpaceLifecycleEvent(knowledgeBaseId:manifest.id,requestId:requestId,action:"purge",name:manifest.name); event.at = MobileProtocol.timestamp(now)
        if state.status != "purged" { try writeSpaceEvent(event) }
        let mobile = try url(".mobile")
        let sidecars = files.fileExists(atPath:mobile.path) ? try files.contentsOfDirectory(at:mobile,includingPropertiesForKeys:nil).filter { !["space-events","coordination.lock","executor.json"].contains($0.lastPathComponent) }.map { ".mobile/" + $0.lastPathComponent } : []
        for path in [manifest.sourcesPath,manifest.wikiPath] + sidecars {
            let target = try url(path)
            guard files.fileExists(atPath:target.path) else { continue }
            var error: NSError?; var failure: Error?
            NSFileCoordinator().coordinate(writingItemAt:target,options:.forDeleting,error:&error) { value in do { try files.removeItem(at:value) } catch { failure = error } }
            if let error { throw error }; if let failure { throw failure }
        }
        let parent = (manifest.wikiPath as NSString).deletingLastPathComponent
        let prediction = (parent.isEmpty ? "" : parent + "/") + "predictions/state.json"
        if let value = try? JSONSerialization.jsonObject(with:read(prediction)) as? [String:Any], value["knowledgeBaseId"] as? String == manifest.id { try files.removeItem(at:url(prediction)) }
    }
    public func contentBytes() throws -> Int64 {
        var total: Int64 = 0
        for base in [manifest.sourcesPath,manifest.wikiPath] {
            guard let iterator = files.enumerator(atPath:try url(base).path) else { continue }
            for case let name as String in iterator { let file = try url(base + "/" + name); let values = try file.resourceValues(forKeys:[.isRegularFileKey,.fileSizeKey,.isSymbolicLinkKey]); if values.isSymbolicLink == true { iterator.skipDescendants(); continue }; if values.isRegularFile == true { total += Int64(values.fileSize ?? 0) } }
        }
        return total
    }
}
