import Foundation

extension SpaceStore {
    /// Retain the tombstone and use the existing 30-day trash protocol for bytes.
    public func discardPhotoDraft(_ draft: PhotoDraft) throws {
        guard draft.knowledgeBaseId == manifest.id, !manifest.readOnly else { throw MobileError.readOnly }
        guard draft.photos.allSatisfy({ $0.path.hasPrefix(manifest.sourcesPath + "/照片回忆/" + draft.id + "/") && MobileProtocol.validPath($0.path) }) else { throw MobileError.invalidPath }
        // Persist the tombstone first, so an interrupted removal never resurrects a group.
        var value = draft; value.step = -1; value.updatedAt = MobileProtocol.timestamp()
        try savePhotoDraft(value)
        for photo in draft.photos {
            guard photo.path.hasPrefix(manifest.sourcesPath + "/照片回忆/" + draft.id + "/") else { throw MobileError.invalidPath }
            let target = try url(photo.path)
            if FileManager.default.fileExists(atPath: target.path) { try trash(path: photo.path) }
        }
    }
}
