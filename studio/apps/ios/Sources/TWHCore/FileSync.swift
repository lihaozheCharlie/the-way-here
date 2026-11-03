import Foundation

public struct SyncPendingFile: Identifiable, Sendable { public var id: String { path }; public var path: String; public var reason: String; public init(path:String,reason:String) { self.path = path; self.reason = reason } }
public struct SyncReport: Sendable { public init() {}
 public var pendingFiles: [SyncPendingFile] = []; public var availableDocuments = 0; public var totalDocuments = 0; public var uploaded = 0; public var downloaded = 0; public var pendingPhotos = 0; public var conflicts = 0; public var pendingCloudUploads = 0; public var cloudQuotaExceeded = false }
/// A three-way, hash-based replica. The local ledger is deliberately outside
/// iCloud. Deletions require an explicit trash tombstone, never mere absence.
public actor FileSync {
    private let local: URL
    private let cloud: URL
    private let ledger: URL
    private let files = FileManager.default
    public init(local: URL, cloud: URL, ledger: URL) { self.local = local.standardizedFileURL.resolvingSymlinksInPath(); self.cloud = cloud.standardizedFileURL.resolvingSymlinksInPath(); self.ledger = ledger.standardizedFileURL }
    public func synchronize(allowPhotos: Bool, progress: (@Sendable (Int, Int) -> Void)? = nil) throws -> SyncReport {
        let localLock = try safeURL(".mobile/coordination.lock", under: local), cloudLock = try safeURL(".mobile/coordination.lock", under: cloud)
        for lock in [localLock, cloudLock] { try files.createDirectory(at: lock.deletingLastPathComponent(), withIntermediateDirectories: true) }
        var error: NSError?; var result: Result<SyncReport, Error>?
        // Restore uses this same local transaction intent. Hold it while reading
        // tombstones and applying deletions, not just while copying one file.
        NSFileCoordinator().coordinate(writingItemAt: localLock, options: [], writingItemAt: cloudLock, options: [], error: &error) { _, _ in
            result = Result { try synchronizeLocked(allowPhotos: allowPhotos, progress: progress) }
        }
        if let error { throw error }; return try result!.get()
    }
    private func synchronizeLocked(allowPhotos: Bool, progress: (@Sendable (Int, Int) -> Void)?) throws -> SyncReport {
        var previous: [String: String] = [:]
        if files.fileExists(atPath: ledger.path) { previous = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: ledger)) }
        var report = SyncReport()
        var localPaths = try paths(local), remotePaths = try paths(cloud)
        let manifestFiles = try [local,cloud].map { try safeURL("mobile-space.json",under:$0) }.filter { files.fileExists(atPath:$0.path) }
        let manifests = try manifestFiles.map { try JSONDecoder().decode(SpaceManifest.self,from:Data(contentsOf:$0)) }
        for manifest in manifests { try manifest.validate() }
        if let first = manifests.first, manifests.contains(where:{$0.id != first.id || $0.sourcesPath != first.sourcesPath || $0.wikiPath != first.wikiPath}) { throw MobileError.invalidData("两端不是同一个空间，未同步资料。") }
        let manifest = manifests.first
        let contentRoots = manifest.map { [$0.sourcesPath,$0.wikiPath] } ?? []
        if let manifest {
            let parent = (manifest.wikiPath as NSString).deletingLastPathComponent
            let prediction = (parent.isEmpty ? "" : parent + "/") + "predictions/state.json"
            func belongs(_ path:String) -> Bool { ["mobile-space.json","the-way-here.config.yaml","AGENTS.md",prediction].contains(path) || path.hasPrefix(".mobile/") || contentRoots.contains(where:{path.hasPrefix($0 + "/")}) }
            localPaths = localPaths.filter(belongs); remotePaths = remotePaths.filter(belongs)
        }
        func isContent(_ path: String) -> Bool { contentRoots.contains { path.hasPrefix($0 + "/") } && !path.split(separator:"/").contains(where:{$0.hasPrefix(".")}) }
        let union = Set(localPaths + remotePaths)
        report.totalDocuments = union.filter { isContent($0) && $0.hasSuffix(".md") }.count
        var spaceEvents: [SpaceLifecycleEvent] = []
        for relative in union.filter({$0.hasPrefix(".mobile/space-events/") && $0.hasSuffix(".json")}) {
            for root in [local,cloud] { let file = try safeURL(relative,under:root); if files.fileExists(atPath:file.path) { spaceEvents.append(try JSONDecoder().decode(SpaceLifecycleEvent.self,from:Data(contentsOf:file))) } }
        }
        let purged = manifest.map { SpaceLifecycleState.reduce(spaceEvents,space:$0.id).status == "purged" } ?? false
        var folderDeletions: [String: FolderDeletion] = [:]
        for relative in union.filter({$0.hasPrefix(".mobile/folder-deletions/") && $0.hasSuffix(".json")}) {
            let entries = try [local,cloud].compactMap { root -> FolderDeletion? in let file = try safeURL(relative,under:root); return files.fileExists(atPath:file.path) ? try JSONDecoder().decode(FolderDeletion.self,from:Data(contentsOf:file)) : nil }
            if let newest = entries.filter({$0.knowledgeBaseId == manifest?.id && MobileProtocol.validSourceFolder($0.path)}).max(by:{
                let left = max(MobileProtocol.date($0.deletedAt) ?? .distantPast, $0.restoredAt.flatMap(MobileProtocol.date) ?? .distantPast)
                let right = max(MobileProtocol.date($1.deletedAt) ?? .distantPast, $1.restoredAt.flatMap(MobileProtocol.date) ?? .distantPast)
                return left == right ? $0.restoredAt == nil && $1.restoredAt != nil : left < right
            }) { folderDeletions[newest.path] = newest }
        }
        var deleted: [String: String] = [:]
        var purgedBlobs = Set<String>()
        for relative in Set(localPaths + remotePaths).filter({ $0.hasPrefix(".mobile/trash/") && $0.hasSuffix(".json") }) {
            let localFile = try safeURL(relative, under: local), remoteFile = try safeURL(relative, under: cloud)
            let candidates = [localFile, remoteFile].filter { files.fileExists(atPath: $0.path) }
            let entries = try candidates.map { try JSONDecoder().decode(SpaceStore.TrashEntry.self, from: Data(contentsOf: $0)) }
            if let purged = entries.first(where: { $0.purgedAt != nil }), MobileProtocol.validID(purged.id) { purgedBlobs.insert(".mobile/trash/" + purged.id + ".md") }
            if entries.contains(where: { $0.restoredAt != nil }) { continue }
            if let entry = entries.first, MobileProtocol.validPath(entry.path) { deleted[entry.path] = entry.hash }
        }
        let allPaths = Set(localPaths + remotePaths).sorted()
        var processed = 0; progress?(0, allPaths.count)
        for relative in allPaths {
            defer { processed += 1; progress?(processed, allPaths.count) }
            try Task.checkCancellation()
            let from = try safeURL(relative, under: local), to = try safeURL(relative, under: cloud)
            if purged && ((relative == "predictions/state.json" || relative.hasSuffix("/predictions/state.json")) || contentRoots.contains(where:{relative.hasPrefix($0 + "/")}) || relative.hasPrefix(".mobile/") && !relative.hasPrefix(".mobile/space-events/") && relative != ".mobile/executor.json") {
                for target in [from,to] where files.fileExists(atPath:target.path) { try files.removeItem(at:target) }; previous.removeValue(forKey:relative); continue
            }
            if relative.hasPrefix(".mobile/folders/"), relative.hasSuffix(".json") {
                let markerFile = files.fileExists(atPath:from.path) ? from : to
                let marker = try JSONSerialization.jsonObject(with:Data(contentsOf:markerFile)) as? [String:String]
                if let path = marker?["path"], folderDeletions.values.contains(where:{$0.restoredAt == nil && (path == $0.path || path.hasPrefix($0.path + "/"))}) {
                    for target in [from,to] where files.fileExists(atPath:target.path) { try files.removeItem(at:target) }; previous.removeValue(forKey:relative); continue
                }
            }
            let attachment = !["md","txt","json","yaml","yml","html","csv"].contains(from.pathExtension.lowercased())
            if attachment && !files.fileExists(atPath:from.path) { continue } // downloaded on demand by SpaceStore.read
            if !allowPhotos && ["jpg", "jpeg", "png", "heic", "m4a"].contains(from.pathExtension.lowercased()) && files.fileExists(atPath: from.path) { report.pendingPhotos += 1; if isContent(relative) { report.pendingFiles.append(SyncPendingFile(path:relative,reason:"等待 Wi-Fi 或退出低电量模式")) }; continue }
            if files.fileExists(atPath: to.path) {
                let status = try to.resourceValues(forKeys: [.isUbiquitousItemKey, .ubiquitousItemUploadingErrorKey, .ubiquitousItemDownloadingErrorKey, .ubiquitousItemIsUploadedKey])
                if status.isUbiquitousItem == true {
                    if status.ubiquitousItemIsUploaded != true && isContent(relative) { report.pendingCloudUploads += 1; report.pendingFiles.append(SyncPendingFile(path:relative,reason:"iCloud 正在上传")) }
                    if let error = status.ubiquitousItemUploadingError ?? status.ubiquitousItemDownloadingError { report.cloudQuotaExceeded = report.cloudQuotaExceeded || MobileProtocol.isCloudQuotaError(error) }
                    try files.startDownloadingUbiquitousItem(at: to)
                }
            }
            var coordinationError: NSError?; var failure: Error?
            try files.createDirectory(at: to.deletingLastPathComponent(), withIntermediateDirectories: true)
            try files.createDirectory(at: from.deletingLastPathComponent(), withIntermediateDirectories: true)
            NSFileCoordinator().coordinate(writingItemAt: from, options: [], writingItemAt: to, options: [], error: &coordinationError) { localCoordinated, coordinated in
                do {
                    _ = try safeURL(relative, under: local); _ = try safeURL(relative, under: cloud)
                    if purgedBlobs.contains(relative) {
                        for target in [localCoordinated, coordinated] where files.fileExists(atPath: target.path) { try files.removeItem(at: target) }
                        previous.removeValue(forKey: relative); return
                    }
                    var localData = files.fileExists(atPath: localCoordinated.path) ? try Data(contentsOf: localCoordinated) : nil
                    for version in NSFileVersion.unresolvedConflictVersionsOfItem(at: coordinated) ?? [] {
                        let bytes = try Data(contentsOf: version.url)
                        let name = coordinated.deletingPathExtension().lastPathComponent + ".conflict-system-" + UUID().uuidString.lowercased() + "." + coordinated.pathExtension
                        try bytes.write(to: coordinated.deletingLastPathComponent().appendingPathComponent(name), options: .withoutOverwriting)
                        try bytes.write(to: localCoordinated.deletingLastPathComponent().appendingPathComponent(name), options: .withoutOverwriting)
                        version.isResolved = true; report.conflicts += 1
                    }
                    var remoteData = files.fileExists(atPath: coordinated.path) ? try Data(contentsOf: coordinated) : nil
                    if relative.hasPrefix(".mobile/folder-deletions/"), let entry = folderDeletions.values.first(where:{relative == ".mobile/folder-deletions/" + MobileProtocol.hash(Data($0.path.utf8)) + ".json"}) {
                        let bytes = try MobileProtocol.encoder().encode(entry); try bytes.write(to:localCoordinated,options:.atomic); try bytes.write(to:coordinated,options:.atomic); localData = bytes; remoteData = bytes
                    }
                    if relative.hasPrefix(".mobile/trash/"), relative.hasSuffix(".json") {
                        let entries = try [localData, remoteData].compactMap { $0 }.map { try JSONDecoder().decode(SpaceStore.TrashEntry.self, from: $0) }
                        if let dominant = entries.first(where: { $0.restoredAt != nil }) ?? entries.first(where: { $0.purgedAt != nil }) {
                            let bytes = try MobileProtocol.encoder().encode(dominant)
                            try bytes.write(to: localCoordinated, options: .atomic); try bytes.write(to: coordinated, options: .atomic)
                            localData = bytes; remoteData = bytes
                        }
                    }
                    let localHash = localData.map(MobileProtocol.hash), remoteHash = remoteData.map(MobileProtocol.hash)
                    if let deletedHash = deleted[relative] {
                        if remoteHash == deletedHash { try files.removeItem(at: coordinated) }
                        if localHash == deletedHash { try files.removeItem(at: localCoordinated) }
                        // A newer edit is preserved and may be reviewed as a conflict;
                        // a tombstone never deletes a different content hash.
                        if remoteHash == deletedHash || localHash == deletedHash { previous.removeValue(forKey: relative); return }
                    }
                    if localHash == remoteHash { if let localHash { previous[relative] = localHash }; return }
                    if let localData, remoteData == nil || remoteHash == previous[relative] {
                        try localData.write(to: coordinated, options: .atomic); previous[relative] = localHash; report.uploaded += 1
                    } else if let remoteData, localData == nil || localHash == previous[relative] {
                        try files.createDirectory(at: from.deletingLastPathComponent(), withIntermediateDirectories: true)
                        try remoteData.write(to: localCoordinated, options: .atomic); previous[relative] = remoteHash; report.downloaded += 1
                    } else if let localData, let remoteData {
                        // Never choose a winner by clock time. Preserve the local edit under
                        // a new name on BOTH replicas, then read the remote original.
                        let conflict = from.deletingPathExtension().lastPathComponent + ".conflict-" + UUID().uuidString.lowercased() + "." + from.pathExtension
                        let localCopy = from.deletingLastPathComponent().appendingPathComponent(conflict)
                        let cloudCopy = coordinated.deletingLastPathComponent().appendingPathComponent(conflict)
                        try localData.write(to: localCopy, options: .withoutOverwriting)
                        try localData.write(to: cloudCopy, options: .withoutOverwriting)
                        try remoteData.write(to: localCoordinated, options: .atomic); previous[relative] = remoteHash; report.conflicts += 1
                    }
                } catch { failure = error }
            }
            if let coordinationError { throw coordinationError }; if let failure { throw failure }
        }
        if let manifest {
            for entry in folderDeletions.values where entry.knowledgeBaseId == manifest.id && entry.restoredAt == nil && MobileProtocol.validSourceFolder(entry.path) {
                for root in [local,cloud] {
                    let directory = try safeURL(manifest.sourcesPath + "/" + entry.path,under:root)
                    if files.fileExists(atPath:directory.path), (try files.contentsOfDirectory(atPath:directory.path)).isEmpty { try files.removeItem(at:directory) }
                }
            }
        }
        report.availableDocuments = try paths(local).filter { isContent($0) && $0.hasSuffix(".md") }.count
        try files.createDirectory(at: ledger.deletingLastPathComponent(), withIntermediateDirectories: true)
        try MobileProtocol.encoder().encode(previous).write(to: ledger, options: .atomic)
        return report
    }
    private func safeURL(_ relative: String, under root: URL) throws -> URL {
        try MobileProtocol.checkedURL(relative, under: root)
    }

    private func paths(_ root: URL) throws -> [String] {
        guard let iterator = files.enumerator(atPath: root.path) else { return [] }
        var result: [String] = []
        for case let relative as String in iterator {
            guard MobileProtocol.validPath(relative) else { continue }
            // This replica transports user content, never executable requests.
            // Preserve old queues on disk without publishing or replaying them.
            if relative == ".mobile/queue" || relative.hasPrefix(".mobile/queue/") { iterator.skipDescendants(); continue }
            let file = root.appendingPathComponent(relative)
            let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
            if values.isSymbolicLink == true { iterator.skipDescendants(); continue }
            if relative == ".mobile/coordination.lock" { continue }
            if relative.split(separator: "/").contains(where: { [".git", ".runtime", "node_modules", "knowledge-engine", ".DS_Store"].contains(String($0)) }) { iterator.skipDescendants(); continue }
            if values.isRegularFile == true && MobileProtocol.validPath(relative) { result.append(relative) }
        }
        return result
    }
}
