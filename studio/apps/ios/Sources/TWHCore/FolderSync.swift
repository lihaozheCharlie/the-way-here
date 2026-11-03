import Foundation
struct FolderDeletion: Codable {
    var knowledgeBaseId: String
    var path: String
    var deletedAt: String
    var restoredAt: String?
}
extension SpaceStore {
    func restoreFolderAncestors(for source: String) throws {
        let relative = source.hasPrefix(manifest.sourcesPath + "/") ? String(source.dropFirst(manifest.sourcesPath.count + 1)) : source
        for var entry in try jsonFiles(".mobile/folder-deletions",as:FolderDeletion.self) where entry.knowledgeBaseId == manifest.id && MobileProtocol.validSourceFolder(entry.path) && (relative == entry.path || relative.hasPrefix(entry.path + "/")) && entry.restoredAt == nil {
            entry.restoredAt = MobileProtocol.preciseTimestamp()
            try writeJSON(entry,path:".mobile/folder-deletions/\(MobileProtocol.hash(Data(entry.path.utf8))).json")
        }
    }
}
