import Foundation

/// Device-only connection choices. Store directory names, never a stale absolute
/// ubiquity-container URL. Corpus identity remains owned by SpaceDiscoveryRegistry.
public struct CloudConnectionPreferences {
    private let defaults: UserDefaults
    private let prefix: String
    public init(defaults: UserDefaults = .standard, namespace: String? = nil) {
        self.defaults = defaults
        prefix = namespace.map { "acceptance." + $0 + "." } ?? ""
    }
    private var bindingsKey: String { prefix + "sync.cloudBindings" }
    private var detachedKey: String { prefix + "sync.detachedSpaces" }
    private func bindings() throws -> [String: String] {
        guard let value = defaults.object(forKey: bindingsKey) else { return [:] }
        guard let result = value as? [String: String], result.allSatisfy({ MobileProtocol.validID($0.key) && validDirectory($0.value) }) else { throw unreadable() }
        return result
    }
    private func detached() throws -> Set<String> {
        guard let value = defaults.object(forKey: detachedKey) else { return [] }
        guard let result = value as? [String], result.allSatisfy(MobileProtocol.validID) else { throw unreadable() }
        return Set(result)
    }
    private func validDirectory(_ value: String) -> Bool { MobileProtocol.validPath(value) && !value.contains("/") && !value.hasPrefix(".") }
    private func unreadable() -> MobileError { .invalidData("iCloud 连接设置无法读取，原设置已保留。") }

    /// Call after registry validation. Explicit local-only/unlink always wins,
    /// including when the old cloud manifest still exists. No missing preference
    /// is converted into a cloud choice merely because iCloud is available.
    public func destination(spaceID: String, directory: String, cloudRoot: URL?, hasCloudManifest: Bool) throws -> URL? {
        guard MobileProtocol.validID(spaceID), validDirectory(directory) else { throw MobileError.invalidPath }
        let current = try bindings(), exclusions = try detached()
        guard !exclusions.contains(spaceID) else { return nil }
        if let boundDirectory = current[spaceID], boundDirectory != directory { throw MobileError.invalidPath }
        guard let cloudRoot, current[spaceID] == directory || hasCloudManifest else { return nil }
        // Migration is based on an already validated remote manifest, not the
        // existence of a container or a guessed local directory.
        if current[spaceID] == nil { try setLinked(true, spaceID: spaceID, directory: directory) }
        return cloudRoot.appendingPathComponent(directory)
    }
    public func setLinked(_ linked: Bool, spaceID: String, directory: String) throws {
        guard MobileProtocol.validID(spaceID), validDirectory(directory) else { throw MobileError.invalidPath }
        var current = try bindings(), exclusions = try detached()
        if linked { current[spaceID] = directory; exclusions.remove(spaceID) }
        else { current.removeValue(forKey: spaceID); exclusions.insert(spaceID) }
        // Both keys are written synchronously before any upload/activation await.
        // Retain the established detached key for production upgrade compatibility.
        if linked {
            defaults.set(current, forKey: bindingsKey)
            defaults.set(exclusions.sorted(), forKey: detachedKey)
        } else {
            // A process exit between writes must keep unlink fail-closed.
            defaults.set(exclusions.sorted(), forKey: detachedKey)
            defaults.set(current, forKey: bindingsKey)
        }
    }
}
