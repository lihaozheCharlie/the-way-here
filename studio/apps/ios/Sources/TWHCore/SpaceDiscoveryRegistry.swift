import Foundation

/// Local and cloud counterparts may share an identity only when their directory
/// and bound corpus paths agree. A second copy must have its own portable ID.
public struct SpaceDiscoveryRegistry {
    private struct Identity: Equatable {
        var directory: String
        var sources: String
        var wiki: String
    }
    private var identities: [String: Identity] = [:]
    public private(set) var conflictingSpaceIDs: Set<String> = []
    public init() {}
    public var conflictDescription: String? { conflictingSpaceIDs.isEmpty ? nil : conflictError().localizedDescription }
    public mutating func register(_ manifest: SpaceManifest, directory: String) throws {
        try manifest.validate()
        let identity = Identity(directory: directory, sources: manifest.sourcesPath, wiki: manifest.wikiPath)
        if let previous = identities[manifest.id], previous != identity {
            conflictingSpaceIDs.insert(manifest.id)
        } else if identities[manifest.id] == nil { identities[manifest.id] = identity }
    }
    public func validateSelection(_ spaceID: String) throws {
        if conflictingSpaceIDs.contains(spaceID) { throw conflictError() }
    }
    private func conflictError() -> MobileError {
        .invalidData("发现空间身份冲突，已暂停打开有冲突的空间。其他空间仍可选择；请在 Mac 创建独立副本，原文件均已保留。")
    }
}
