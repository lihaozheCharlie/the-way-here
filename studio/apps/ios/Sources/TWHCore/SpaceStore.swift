import Foundation

/// The store is actor-isolated. iCloud access additionally participates in Apple's
/// file coordination; hashes are checked INSIDE the coordinated write.
public actor SpaceStore {
    public nonisolated let root: URL
    public nonisolated let manifest: SpaceManifest
    public nonisolated let deviceId: String
    public nonisolated let cloudRoot: URL?
    let files = FileManager.default
    public init(root: URL, manifest: SpaceManifest, deviceId: String, cloudRoot: URL? = nil) throws {
        try manifest.validate()
        guard MobileProtocol.validID(deviceId) else { throw MobileError.invalidPath }
        self.cloudRoot = cloudRoot?.standardizedFileURL.resolvingSymlinksInPath()
        self.root = root.standardizedFileURL.resolvingSymlinksInPath(); self.manifest = manifest; self.deviceId = deviceId
    }
    public func url(_ relative: String) throws -> URL {
        try MobileProtocol.checkedURL(relative, under: root)
    }

    public func read(_ path: String) throws -> Data {
        if path.hasPrefix(manifest.sourcesPath + "/") || path.hasPrefix(manifest.wikiPath + "/") { try assertContentActive() }
        let target = try url(path)
        if !files.fileExists(atPath:target.path), let cloudRoot {
            let remote = try MobileProtocol.checkedURL(path,under:cloudRoot)
            if files.fileExists(atPath:remote.path) {
                if try remote.resourceValues(forKeys:[.isUbiquitousItemKey]).isUbiquitousItem == true { try files.startDownloadingUbiquitousItem(at:remote) }
                try files.createDirectory(at:target.deletingLastPathComponent(),withIntermediateDirectories:true)
                var coordinationError: NSError?; var downloaded: Result<Data,Error>?
                NSFileCoordinator().coordinate(readingItemAt:remote,options:[],writingItemAt:target,options:[],error:&coordinationError) { source,destination in
                    downloaded = Result { let bytes = try Data(contentsOf:source); if !files.fileExists(atPath:destination.path) { try bytes.write(to:destination,options:.withoutOverwriting) }; return try Data(contentsOf:destination) }
                }
                if let coordinationError { throw coordinationError }; return try downloaded!.get()
            }
        }
        var error: NSError?; var result: Result<Data, Error>?
        NSFileCoordinator().coordinate(readingItemAt: target, options: [], error: &error) { coordinated in result = Result { try Data(contentsOf: coordinated) } }
        if let error { throw error }; return try result!.get()
    }
    func assertContentActive() throws {
        guard !(try lifecycleState().archived) else { throw MobileError.unavailable("空间已删除，请先在已删除空间中恢复。") }
    }
    func write(_ data: Data, to relative: String, exclusive: Bool = false) throws {
        guard !manifest.readOnly else { throw MobileError.readOnly }
        if !relative.hasPrefix(".mobile/space-events/") { try assertContentActive() }
        let target = try url(relative)
        try files.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        var error: NSError?; var failure: Error?
        NSFileCoordinator().coordinate(writingItemAt: target, options: [], error: &error) { coordinated in
            do { try data.write(to: coordinated, options: exclusive ? .withoutOverwriting : .atomic) } catch { failure = error }
        }
        if let error { throw error }; if let failure { throw failure }
    }
    public func writeJSON<T: Encodable>(_ value: T, path: String, exclusive: Bool = false) throws { try write(MobileProtocol.encoder().encode(value), to: path, exclusive: exclusive) }
    public func initialize() throws {
        if manifest.readOnly { return }
        try files.createDirectory(at: try url(manifest.sourcesPath), withIntermediateDirectories: true)
        try files.createDirectory(at: try url(manifest.wikiPath), withIntermediateDirectories: true)
        try writeJSON(manifest, path: "mobile-space.json", exclusive: true)
    }
    public func documents() throws -> [Document] {
        var categories: [String: String] = [:]
        if files.fileExists(atPath: try url(".mobile/snapshot.json").path) {
            let snapshot = try JSONDecoder().decode(MobileSnapshot.self, from: read(".mobile/snapshot.json"))
            guard snapshot.version == 1, snapshot.knowledgeBaseId == manifest.id else { throw MobileError.invalidData("Mac 快照与当前空间不匹配。") }
            for page in snapshot.pages { categories[page.relativePath] = page.category }
        }
        var result: [Document] = []
        for (base, source) in [(manifest.sourcesPath, true), (manifest.wikiPath, false)] {
            let baseURL = try url(base)
            guard files.fileExists(atPath: baseURL.path), let enumerator = files.enumerator(atPath: baseURL.path) else { continue }
            for case let child as String in enumerator {
                if child.split(separator: "/").contains(where: { $0.hasPrefix(".") }) { enumerator.skipDescendants(); continue }
                let file = baseURL.appendingPathComponent(child)
                let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .contentModificationDateKey])
                if values.isSymbolicLink == true { enumerator.skipDescendants(); continue }
                guard values.isRegularFile == true, file.pathExtension.lowercased() == "md" else { continue }
                let relative = base + "/" + child
                let content = try read(relative)
                guard let markdown = String(data: content, encoding: .utf8) else { throw MobileError.invalidData("一份记录不是 UTF-8 文本，请在 Mac 检查，原文件已保留。") }
                result.append(Document(path: relative, markdown: markdown, modifiedAt: values.contentModificationDate ?? .distantPast, isSource: source, category: categories[relative] ?? (source ? "sources" : "other")))
            }
        }
        return result.sorted { $0.modifiedAt > $1.modifiedAt }
    }
    public func saveOriginal(text: String, folder: String, title: String? = nil) throws -> String {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 50_000, MobileProtocol.validSourceFolder(folder) else { throw MobileError.invalidData("请填写有效的记录与保存位置。") }
        let date = DateFormatter(); date.dateFormat = "yyyy-MM-dd"
        let stamp = "\(date.string(from: Date()))-\(deviceId)-\(UUID().uuidString.lowercased())"
        let heading = (title ?? "\(date.string(from: Date())) 原文").replacingOccurrences(of: "\n", with: " ")
        let path = "\(manifest.sourcesPath)/\(folder)/\(stamp).md"
        try write(Data("# \(heading)\n\n\(text)\n".utf8), to: path, exclusive: true)
        return path
    }
    public func saveEdit(path: String, expectedHash: String, markdown: String) throws {
        guard path.hasPrefix(manifest.sourcesPath + "/"), path.hasSuffix(".md"), !manifest.readOnly else { throw MobileError.readOnly }
        let target = try url(path)
        try assertContentActive()
        var coordinationError: NSError?; var failure: Error?
        NSFileCoordinator().coordinate(writingItemAt: target, options: [], error: &coordinationError) { coordinated in
            do {
                let current = try Data(contentsOf: coordinated)
                if MobileProtocol.hash(current) != expectedHash {
                    let copy = coordinated.deletingPathExtension().appendingPathExtension("conflict-\(deviceId)-\(UUID().uuidString.lowercased()).md")
                    try Data(markdown.utf8).write(to: copy, options: .withoutOverwriting)
                    failure = MobileError.conflict(copy)
                } else { try Data(markdown.utf8).write(to: coordinated, options: .atomic) }
            } catch { failure = error }
        }
        if let coordinationError { throw coordinationError }; if let failure { throw failure }
    }
    public func correction(document: Document, reason: String, text: String) throws -> String {
        // A separate source is the append-only correction log. Never rewrite Wiki.
        try saveOriginal(text: "## 用户纠正\n\n对象：\(document.path)\n原因：\(reason)\n\n原判断：\n> \(document.excerpt)\n\n用户原话：\n\(text)", folder: "用户纠正", title: "纠正：\(document.title)")
    }
    public func saveDraft(_ draft: Draft) throws {
        guard draft.knowledgeBaseId == manifest.id, MobileProtocol.validID(draft.id), MobileProtocol.validSourceFolder(draft.folder) else { throw MobileError.invalidData("草稿不属于当前空间。") }
        try writeJSON(draft, path: ".mobile/drafts/\(draft.id)-\(deviceId).json")
    }
    public func drafts() throws -> [Draft] { try jsonFiles(".mobile/drafts", as: Draft.self).filter { $0.knowledgeBaseId == manifest.id }.sorted { $0.updatedAt > $1.updatedAt } }
    public func savePhotoDraft(_ draft: PhotoDraft) throws {
        guard draft.knowledgeBaseId == manifest.id, MobileProtocol.validID(draft.id), draft.photos.count <= 12, draft.photos.allSatisfy({ MobileProtocol.validPath($0.path) }) else { throw MobileError.invalidData("照片草稿无效。") }
        try writeJSON(draft, path: ".mobile/photo-drafts/\(draft.id).json")
    }
    public func photoDrafts() throws -> [PhotoDraft] { try jsonFiles(".mobile/photo-drafts", as: PhotoDraft.self).filter { $0.knowledgeBaseId == manifest.id } }
    public func savePhoto(_ data: Data, draftId: String) throws -> String {
        guard MobileProtocol.validID(draftId), data.count <= 15_000_000 else { throw MobileError.invalidData("照片副本过大。") }
        let path = "\(manifest.sourcesPath)/照片回忆/\(draftId)/\(UUID().uuidString.lowercased()).jpg"
        try write(data, to: path, exclusive: true); return path
    }
    public func enqueue(_ task: TaskRequest) throws {
        try assertTaskCapability(task.kind)
        try task.validate(); guard task.knowledgeBaseId == manifest.id else { throw MobileError.invalidData("任务不属于当前空间。") }
        for path in task.sourcePaths { guard path.hasPrefix(manifest.sourcesPath + "/") else { throw MobileError.readOnly }; _ = try url(path) }
        try writeJSON(task, path: ".mobile/queue/\(task.id).json", exclusive: true)
    }
    public func requests() throws -> [TaskRequest] { try jsonFiles(".mobile/queue", as: TaskRequest.self).filter { $0.knowledgeBaseId == manifest.id }.sorted { $0.createdAt > $1.createdAt } }
    public func receipts() throws -> [TaskReceipt] { try jsonFiles(".mobile/receipts", as: TaskReceipt.self).filter { $0.knowledgeBaseId == manifest.id } }
    public func cancel(_ id: String) throws {
        guard MobileProtocol.validID(id) else { throw MobileError.invalidPath }
        try writeJSON(["id": id, "knowledgeBaseId": manifest.id], path: ".mobile/cancel/\(id).json", exclusive: true)
    }
    public func snapshot() throws -> MobileSnapshot? {
        guard files.fileExists(atPath: try url(".mobile/snapshot.json").path) else { return nil }
        let value = try JSONDecoder().decode(MobileSnapshot.self, from: read(".mobile/snapshot.json"))
        guard value.version == 1, value.knowledgeBaseId == manifest.id else { throw MobileError.invalidData("Mac 快照与当前空间不匹配。") }
        return value
    }
    public func createFolder(_ folder: String) throws {
        try assertContentActive()
        guard !manifest.readOnly else { throw MobileError.readOnly }
        guard MobileProtocol.validSourceFolder(folder) else { throw MobileError.invalidPath }
        try files.createDirectory(at: try url("\(manifest.sourcesPath)/\(folder)"), withIntermediateDirectories: true)
        try restoreFolderAncestors(for:folder)
        try writeJSON(FolderMarker(knowledgeBaseId: manifest.id, path: folder), path: ".mobile/folders/\(MobileProtocol.hash(Data(folder.utf8))).json")
    }
    public struct SourceRelocation: Codable, Sendable {
        public var version = 1; public var knowledgeBaseId: String; public var previousPath: String; public var storedPath: String; public var hash: String
    }
    public func folders() throws -> [String] {
        var result = Set<String>()
        let base = try url(manifest.sourcesPath)
        if let iterator = files.enumerator(atPath: base.path) {
            for case let relative as String in iterator {
                let values = try base.appendingPathComponent(relative).resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
                if values.isSymbolicLink == true || relative.split(separator: "/").contains(where: { $0.hasPrefix(".") }) { iterator.skipDescendants(); continue }
                if values.isDirectory == true { result.insert(relative) }
            }
        }
        for marker in try jsonFiles(".mobile/folders", as: FolderMarker.self) where marker.knowledgeBaseId == manifest.id && MobileProtocol.validSourceFolder(marker.path) {
            result.insert(marker.path)
            if !manifest.readOnly { try files.createDirectory(at: try url(manifest.sourcesPath + "/" + marker.path), withIntermediateDirectories: true) }
        }
        return result.sorted()
    }
    private struct FolderMarker: Codable { var knowledgeBaseId: String; var path: String }
    public func move(path: String, folder: String) throws -> String {
        guard MobileProtocol.validSourceFolder(folder) else { throw MobileError.invalidPath }
        return try relocate(path: path, destination: manifest.sourcesPath + "/" + folder + "/" + URL(fileURLWithPath: path).lastPathComponent)
    }
    public func rename(path: String, name: String) throws -> String {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 160, !name.contains("/"), !name.hasPrefix("."), MobileProtocol.validPath(name) else { throw MobileError.invalidPath }
        let source = URL(fileURLWithPath: path)
        let filename = name.hasSuffix("." + source.pathExtension) ? name : name + "." + source.pathExtension
        return try relocate(path: path, destination: (path as NSString).deletingLastPathComponent + "/" + filename)
    }
    func relocate(path: String, destination: String) throws -> String {
        try assertContentActive()
        guard !manifest.readOnly, path.hasPrefix(manifest.sourcesPath + "/"), destination.hasPrefix(manifest.sourcesPath + "/") else { throw MobileError.readOnly }
        if path == destination { return path }
        let source = try url(path), target = try url(destination)
        try files.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        var error: NSError?; var failure: Error?
        NSFileCoordinator().coordinate(writingItemAt: source, options: .forDeleting, writingItemAt: target, options: [], error: &error) { from, to in
            do {
                let original = try Data(contentsOf: from), id = UUID().uuidString.lowercased(), hash = MobileProtocol.hash(original)
                let bytes = try portableImageLinks(original, path: path)
                try bytes.write(to: to, options: .withoutOverwriting)
                // The journal reconciles Mac import manifests after both paths synchronize.
                try writeJSON(SourceRelocation(knowledgeBaseId: manifest.id, previousPath: path, storedPath: destination, hash: MobileProtocol.hash(bytes)), path: ".mobile/relocations/\(id).json", exclusive: true)
                try write(original, to: ".mobile/trash/\(id).md", exclusive: true)
                try writeJSON(TrashEntry(id: id, path: path, deletedAt: MobileProtocol.timestamp(), hash: hash, restoredAt: nil), path: ".mobile/trash/\(id).json", exclusive: true)
                try files.removeItem(at: from)
            } catch { failure = error }
        }
        if let error { throw error }; if let failure { throw failure }; return destination
    }
    func portableImageLinks(_ bytes: Data, path: String) throws -> Data {
        guard path.hasSuffix(".md"), var text = String(data: bytes, encoding: .utf8) else { return bytes }
        let regex = try NSRegularExpression(pattern: "!\\[[^\\]]*\\]\\(([^)]+)\\)")
        let input = text as NSString
        for match in regex.matches(in: text, range: NSRange(location: 0, length: input.length)).reversed() {
            let relative = input.substring(with: match.range(at: 1)).trimmingCharacters(in: CharacterSet(charactersIn: "<>"))
            guard MobileProtocol.validPath(relative), !relative.hasPrefix(manifest.sourcesPath + "/") else { continue }
            let fullPath = (path as NSString).deletingLastPathComponent + "/" + relative
            _ = try url(fullPath)
            text = (text as NSString).replacingCharacters(in: match.range(at: 1), with: "<" + fullPath + ">")
        }
        return Data(text.utf8)
    }
    public func trash(path: String) throws {
        guard path.hasPrefix(manifest.sourcesPath + "/"), !manifest.readOnly else { throw MobileError.readOnly }
        let target = try url(path)
        var error: NSError?; var failure: Error?
        NSFileCoordinator().coordinate(writingItemAt: target, options: .forDeleting, error: &error) { coordinated in
            do {
                let bytes = try Data(contentsOf: coordinated), id = UUID().uuidString.lowercased()
                try write(bytes, to: ".mobile/trash/\(id).md", exclusive: true)
                try writeJSON(TrashEntry(id: id, path: path, deletedAt: MobileProtocol.timestamp(), hash: MobileProtocol.hash(bytes), restoredAt: nil), path: ".mobile/trash/\(id).json", exclusive: true)
                try files.removeItem(at: coordinated)
            } catch { failure = error }
        }
        if let error { throw error }; if let failure { throw failure }
    }
    public func importFile(data: Data, filename: String, folder: String) throws -> String {
        let ext = URL(fileURLWithPath: filename).pathExtension.lowercased()
        guard ["md", "txt", "csv", "json", "zip", "pdf"].contains(ext), data.count <= 50_000_000, MobileProtocol.validSourceFolder(folder) else { throw MobileError.invalidData("文件类型不支持或超过 50 MB。") }
        let path = "\(manifest.sourcesPath)/\(folder)/\(deviceId)-\(UUID().uuidString.lowercased()).\(ext)"
        try write(data, to: path, exclusive: true); return path
    }
    public func importShare(_ payload: SharePayload, attachments: [(name: String, data: Data)]) throws -> (String, [String]) {
        guard MobileProtocol.validID(payload.id), MobileProtocol.validSourceFolder(payload.folder), attachments.count <= 12, payload.knowledgeBaseId == nil || payload.knowledgeBaseId == manifest.id else { throw MobileError.invalidData("请回到分享时选择的空间导入，资料不会写入其他空间。") }
        let folder = manifest.sourcesPath + "/" + payload.folder + "/share-" + payload.id
        var paths: [String] = []
        func writeOnce(_ bytes: Data, _ path: String) throws {
            let target = try url(path)
            if files.fileExists(atPath: target.path) { guard try read(path) == bytes else { throw MobileError.conflict(target) }; return }
            try write(bytes, to: path, exclusive: true)
        }
        for attachment in attachments {
            guard MobileProtocol.validPath(attachment.name), !attachment.name.contains("/"), attachment.data.count <= 50_000_000 else { throw MobileError.invalidPath }
            let path = folder + "/" + attachment.name; try writeOnce(attachment.data, path); paths.append(path)
        }
        let text = "# 分享记录\n\n\(payload.text)\n\n\(payload.note)\n\n" + attachments.map { "[\($0.name)](\($0.name))" }.joined(separator: "\n") + "\n"
        let path = folder + "/分享记录.md"; try writeOnce(Data(text.utf8), path)
        return (path, paths)
    }
    public struct TrashEntry: Codable, Identifiable, Sendable {
        public var id: String; public var path: String; public var deletedAt: String; public var hash: String; public var restoredAt: String?; public var purgedAt: String? = nil
    }
    public func trashEntries() throws -> [TrashEntry] { try jsonFiles(".mobile/trash", as: TrashEntry.self).filter { $0.restoredAt == nil && $0.purgedAt == nil }.sorted { $0.deletedAt > $1.deletedAt } }
    public func purgeExpiredTrash(now: Date = Date()) throws {
        guard !manifest.readOnly, !(try lifecycleState().archived) else { return }
        for entry in try jsonFiles(".mobile/trash", as: TrashEntry.self) where entry.restoredAt == nil {
            guard MobileProtocol.validID(entry.id), let date = MobileProtocol.date(entry.deletedAt), now.timeIntervalSince(date) >= 30 * 24 * 3600 else { continue }
            var purged = entry; purged.purgedAt = entry.purgedAt ?? MobileProtocol.timestamp(now)
            // Keep the tombstone after purging its recovery bytes, so an old offline
            // device cannot resurrect a deleted original by absence alone.
            try writeJSON(purged, path: ".mobile/trash/\(entry.id).json")
            let blob = try url(".mobile/trash/\(entry.id).md")
            var error: NSError?; var failure: Error?
            NSFileCoordinator().coordinate(writingItemAt: blob, options: .forDeleting, error: &error) { target in do { if files.fileExists(atPath: target.path) { try files.removeItem(at: target) } } catch { failure = error } }
            if let error { throw error }; if let failure { throw failure }
        }
    }
    public func restoreTrash(_ entry: TrashEntry) throws {
        let lock = try url(".mobile/coordination.lock")
        try files.createDirectory(at: lock.deletingLastPathComponent(), withIntermediateDirectories: true)
        var error: NSError?; var failure: Error?
        NSFileCoordinator().coordinate(writingItemAt: lock, options: [], error: &error) { _ in do { try restoreTrashLocked(entry) } catch { failure = error } }
        if let error { throw error }; if let failure { throw failure }
    }
    private func restoreTrashLocked(_ entry: TrashEntry) throws {
        guard entry.purgedAt == nil, let deleted = MobileProtocol.date(entry.deletedAt), Date().timeIntervalSince(deleted) < 30 * 24 * 3600 else { throw MobileError.unavailable("这份记录已超过 30 天恢复期限。") }
        guard MobileProtocol.validID(entry.id), entry.path.hasPrefix(manifest.sourcesPath + "/") else { throw MobileError.invalidPath }
        let bytes = try read(".mobile/trash/\(entry.id).md")
        try restoreFolderAncestors(for:entry.path)
        let target = try url(entry.path)
        let destination = files.fileExists(atPath: target.path) ? (entry.path as NSString).deletingPathExtension + ".restored-\(UUID().uuidString.lowercased())." + (entry.path as NSString).pathExtension : entry.path
        var restored = entry; restored.restoredAt = MobileProtocol.timestamp(); try writeJSON(restored, path: ".mobile/trash/\(entry.id).json")
        do { try write(bytes, to: destination, exclusive: true) }
        catch { try writeJSON(entry, path: ".mobile/trash/\(entry.id).json"); throw error }
    }
    public func exportArchive() throws -> URL {
        // Export is an explicit request for all files, including attachments not
        // downloaded during ordinary reading. Preserve local unsynced originals.
        if let cloudRoot, let iterator = files.enumerator(atPath:cloudRoot.path) {
            for case let relative as String in iterator {
                if relative.split(separator:"/").contains(where:{[".git",".runtime","node_modules","knowledge-engine"].contains(String($0))}) { iterator.skipDescendants(); continue }
                let remote = try MobileProtocol.checkedURL(relative,under:cloudRoot)
                if try remote.resourceValues(forKeys:[.isRegularFileKey]).isRegularFile == true, !files.fileExists(atPath:try url(relative).path) { _ = try read(relative) }
            }
        }
        let destination = files.temporaryDirectory.appendingPathComponent("The-Way-Here-\(UUID().uuidString.lowercased()).zip")
        var coordinationError: NSError?; var failure: Error?
        NSFileCoordinator().coordinate(readingItemAt: root, options: .forUploading, error: &coordinationError) { archive in
            do { try files.copyItem(at: archive, to: destination) } catch { failure = error }
        }
        if let coordinationError { throw coordinationError }; if let failure { throw failure }; return destination
    }
    func jsonFiles<T: Decodable>(_ relative: String, as type: T.Type) throws -> [T] {
        let directory = try url(relative)
        guard files.fileExists(atPath: directory.path) else { return [] }
        return try files.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).filter { $0.pathExtension == "json" }.map {
            try JSONDecoder().decode(type, from: read(relative + "/" + $0.lastPathComponent))
        }
    }
}
