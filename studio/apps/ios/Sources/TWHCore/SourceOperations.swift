import Foundation

extension SpaceStore {
    /// Choose a destination without replacing evidence already stored there.
    public func availableSourcePath(_ proposed: String) throws -> String {
        guard proposed.hasPrefix(manifest.sourcesPath + "/") else { throw MobileError.readOnly }
        let original = try url(proposed)
        if !FileManager.default.fileExists(atPath: original.path) { return proposed }
        let ext = original.pathExtension
        let stem = ext.isEmpty ? proposed : String(proposed.dropLast(ext.count + 1))
        for suffix in 2...10_000 {
            let candidate = stem + "（\(suffix)）" + (ext.isEmpty ? "" : "." + ext)
            if !FileManager.default.fileExists(atPath: try url(candidate).path) { return candidate }
        }
        throw MobileError.invalidData("同名记录过多，请换一个名称。")
    }
    public struct SourceInformation: Codable, Sendable {
        public var knowledgeBaseId: String
        public var path: String
        public var originalName: String
        public var deviceId: String
        public var createdAt: String
    }
    public func sourceInformation(for path: String) throws -> SourceInformation? {
        guard path.hasPrefix(manifest.sourcesPath + "/") else { throw MobileError.readOnly }; _ = try url(path)
        let key = ".mobile/source-info/" + MobileProtocol.hash(Data(path.utf8)) + ".json"
        guard FileManager.default.fileExists(atPath: try url(key).path) else { return nil }
        let info = try JSONDecoder().decode(SourceInformation.self, from: read(key))
        guard info.knowledgeBaseId == manifest.id, info.path == path else { throw MobileError.invalidData("记录元信息不属于当前空间。") }
        return info
    }
    public func importNamedSourceFile(data: Data, filename: String, folder: String) throws -> String {
        let ext = URL(fileURLWithPath: filename).pathExtension.lowercased()
        guard !manifest.readOnly, ["md", "txt", "csv", "json", "zip", "pdf"].contains(ext), data.count <= 50_000_000, MobileProtocol.validSourceFolder(folder), MobileProtocol.validPath(filename), !filename.contains("/"), !filename.hasPrefix(".") else { throw MobileError.invalidData("文件类型不支持、名称无效或超过 50 MB。") }
        let path = try availableSourcePath(manifest.sourcesPath + "/" + folder + "/" + filename)
        let info = SourceInformation(knowledgeBaseId: manifest.id, path: path, originalName: filename, deviceId: deviceId, createdAt: MobileProtocol.timestamp())
        try writeJSON(info, path: ".mobile/source-info/" + MobileProtocol.hash(Data(path.utf8)) + ".json")
        try write(data, to: path, exclusive: true)
        return path
    }
    private func followSourceInformation(from previous: String, to destination: String) throws {
        guard var information = try sourceInformation(for: previous) else { return }
        information.path = destination
        try writeJSON(information, path: ".mobile/source-info/" + MobileProtocol.hash(Data(destination.utf8)) + ".json")
    }
    public func renameSource(path: String, name: String) throws -> String {
        let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.count <= 160, !value.contains("/"), !value.hasPrefix("."), MobileProtocol.validPath(value) else { throw MobileError.invalidPath }
        let ext = URL(fileURLWithPath: path).pathExtension
        let filename = value.hasSuffix("." + ext) ? value : value + "." + ext
        let proposed = (path as NSString).deletingLastPathComponent + "/" + filename
        if proposed == path { return path }
        let destination = try availableSourcePath(proposed)
        let moved = try relocate(path: path, destination: destination); try followSourceInformation(from: path, to: destination); return moved
    }
    public func copySource(path: String, folder: String) throws -> String {
        guard !manifest.readOnly, path.hasPrefix(manifest.sourcesPath + "/"), MobileProtocol.validSourceFolder(folder) else { throw MobileError.readOnly }
        let bytes = try read(path)
        let destination = try availableSourcePath(manifest.sourcesPath + "/" + folder + "/" + URL(fileURLWithPath: path).lastPathComponent)
        // Make relative image references portable before the copy changes directory.
        var text = String(data: bytes, encoding: .utf8)
        if path.hasSuffix(".md"), let input = text, let regex = try? NSRegularExpression(pattern: "!\\[[^\\]]*\\]\\(([^)]+)\\)") {
            let original = input as NSString
            for match in regex.matches(in: input, range: NSRange(location: 0, length: original.length)).reversed() {
                let relative = original.substring(with: match.range(at: 1)).trimmingCharacters(in: CharacterSet(charactersIn: "<>"))
                guard MobileProtocol.validPath(relative), !relative.hasPrefix(manifest.sourcesPath + "/") else { continue }
                let full = (path as NSString).deletingLastPathComponent + "/" + relative; _ = try url(full)
                text = (text! as NSString).replacingCharacters(in: match.range(at: 1), with: "<" + full + ">")
            }
        }
        try write(path.hasSuffix(".md") ? Data((text ?? "").utf8) : bytes, to: destination, exclusive: true)
        if var information = try sourceInformation(for: path) { information.path = destination; information.deviceId = deviceId; information.createdAt = MobileProtocol.timestamp(); try writeJSON(information, path: ".mobile/source-info/" + MobileProtocol.hash(Data(destination.utf8)) + ".json") }
        return destination
    }
    public func moveSource(path: String, folder: String) throws -> String {
        guard MobileProtocol.validSourceFolder(folder) else { throw MobileError.invalidPath }
        let proposed = manifest.sourcesPath + "/" + folder + "/" + URL(fileURLWithPath: path).lastPathComponent
        if proposed == path { return path }
        let destination = try availableSourcePath(proposed)
        return try renameAndMove(path: path, destination: destination)
    }
    private func renameAndMove(path: String, destination: String) throws -> String {
        let moved = try relocate(path: path, destination: destination)
        try followSourceInformation(from: path, to: destination)
        return moved
    }
    /// Validates the entire tree before starting a folder mutation. No symlink is followed.
    public func sourceFiles(in folder: String) throws -> [String] {
        guard MobileProtocol.validSourceFolder(folder) else { throw MobileError.invalidPath }
        let base = manifest.sourcesPath + "/" + folder
        let directory = try url(base)
        guard let iterator = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isSymbolicLinkKey, .isRegularFileKey]) else { return [] }
        var result: [String] = []
        for case let file as URL in iterator {
            let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
            guard values.isSymbolicLink != true else { throw MobileError.invalidPath }
            let canonical = file.standardizedFileURL.resolvingSymlinksInPath().path
            guard canonical.hasPrefix(root.path + "/") else { throw MobileError.invalidPath }
            let relative = String(canonical.dropFirst(root.path.count + 1)); _ = try url(relative)
            if values.isRegularFile == true { result.append(relative) }
        }
        return result.sorted()
    }
    public func relocateFolder(_ folder: String, to destination: String) throws -> String {
        guard !manifest.readOnly, MobileProtocol.validSourceFolder(folder), MobileProtocol.validSourceFolder(destination), destination != folder, !destination.hasPrefix(folder + "/") else { throw MobileError.invalidPath }
        let proposed = manifest.sourcesPath + "/" + destination
        let target = try availableSourcePath(proposed)
        let actual = String(target.dropFirst(manifest.sourcesPath.count + 1))
        let paths = try sourceFiles(in: folder)
        let nested = try folders().filter { $0 == folder || $0.hasPrefix(folder + "/") }
        var completed: [(String, String)] = []
        do {
            try createFolder(actual)
            for child in nested where child != folder { try createFolder(actual + String(child.dropFirst(folder.count))) }
            for path in paths {
                let suffix = String(path.dropFirst((manifest.sourcesPath + "/" + folder).count))
                let newPath = target + suffix
                _ = try renameAndMove(path: path, destination: newPath); completed.append((path, newPath))
            }
            try removeEmptySourceFolder(folder)
            return actual
        } catch {
            for (old, new) in completed.reversed() { _ = try? renameAndMove(path: new, destination: old) }
            throw error
        }
    }
    public func trashFolder(_ folder: String) throws {
        guard !manifest.readOnly else { throw MobileError.readOnly }
        let paths = try sourceFiles(in: folder)
        for path in paths { try trash(path: path) }
        try removeEmptySourceFolder(folder)
    }
    private func removeEmptySourceFolder(_ folder: String) throws {
        // Markers must be removed as well; otherwise a later refresh recreates the folder.
        try writeJSON(["knowledgeBaseId": manifest.id, "path": folder, "deletedAt": MobileProtocol.preciseTimestamp()], path: ".mobile/folder-deletions/" + MobileProtocol.hash(Data(folder.utf8)) + ".json")
        let markerRoot = try url(".mobile/folders")
        if let children = try? FileManager.default.contentsOfDirectory(at: markerRoot, includingPropertiesForKeys: nil) {
            for child in children where child.pathExtension == "json" {
                let relative = ".mobile/folders/" + child.lastPathComponent
                guard let value = try JSONSerialization.jsonObject(with: read(relative)) as? [String: String], value["knowledgeBaseId"] == manifest.id, let path = value["path"], path == folder || path.hasPrefix(folder + "/") else { continue }
                let checked = try url(relative)
                var error: NSError?; var failure: Error?
                NSFileCoordinator().coordinate(writingItemAt: checked, options: .forDeleting, error: &error) { file in do { try FileManager.default.removeItem(at: file) } catch { failure = error } }
                if let error { throw error }; if let failure { throw failure }
            }
        }
        let directory = try url(manifest.sourcesPath + "/" + folder)
        // Only empty directories remain. Re-check against concurrent writes before deletion.
        if !(try sourceFiles(in: folder)).isEmpty { throw MobileError.invalidData("文件夹已更新，请刷新后重试。") }
        var error: NSError?; var failure: Error?
        NSFileCoordinator().coordinate(writingItemAt: directory, options: .forDeleting, error: &error) { file in
            do { if !(try sourceFiles(in: folder)).isEmpty { throw MobileError.invalidData("文件夹已更新。") }; try FileManager.default.removeItem(at: file) } catch { failure = error }
        }
        if let error { throw error }; if let failure { throw failure }
    }
    public func resolveConflict(path: String, expectedHash: String, markdown: String, conflictPath: String, keepCopy: Bool) throws {
        guard conflictPath.hasPrefix(manifest.sourcesPath + "/"), conflictPath.contains(".conflict-"), path != conflictPath else { throw MobileError.invalidPath }
        if !keepCopy { let remote = String(data: try read(path), encoding: .utf8); if markdown != remote { try saveEdit(path: path, expectedHash: expectedHash, markdown: markdown) } }
        if keepCopy {
            let original = URL(fileURLWithPath: path)
            let destination = try availableSourcePath((path as NSString).deletingLastPathComponent + "/" + original.deletingPathExtension().lastPathComponent + "（保留副本）.md")
            _ = try relocate(path: conflictPath, destination: destination)
        } else { try trash(path: conflictPath) }
    }
}

extension SpaceStore {
    public func relocateSource(path: String, destination: String) throws -> String {
        guard !FileManager.default.fileExists(atPath: try url(destination).path) else { throw MobileError.invalidData("原位置已有内容，无法撤销；两份记录均已保留。") }
        return try relocate(path: path, destination: destination)
    }
}
