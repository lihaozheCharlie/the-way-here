import Foundation

public actor ShareInbox {
    private let root: URL
    public init(root: URL) { self.root = root }
    public func list() throws -> [SharePayload] {
        guard FileManager.default.fileExists(atPath: root.path) else { return [] }
        var entries: [SharePayload] = []
        for directory in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isSymbolicLinkKey]) {
            guard MobileProtocol.validID(directory.lastPathComponent), try directory.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { continue }
            let path = directory.appendingPathComponent("payload.json")
            guard FileManager.default.fileExists(atPath: path.path), !FileManager.default.fileExists(atPath: directory.appendingPathComponent("imported.json").path) else { continue }
            let item = try JSONDecoder().decode(SharePayload.self, from: Data(contentsOf: path))
            guard item.id == directory.lastPathComponent, item.text.count <= 50_000, item.attachments.count <= 12, MobileProtocol.validPath(item.folder), item.attachments.allSatisfy({ MobileProtocol.validPath($0) && !$0.contains("/") }) else { throw MobileError.invalidData("分享收件箱的一项内容无效，原文件已保留。") }
            entries.append(item)
        }
        return entries.sorted { $0.createdAt > $1.createdAt }
    }
    public func attachment(_ filename: String, itemID: String) throws -> Data {
        guard MobileProtocol.validID(itemID), MobileProtocol.validPath(filename), !filename.contains("/") else { throw MobileError.invalidPath }
        let file = root.appendingPathComponent(itemID).appendingPathComponent(filename)
        guard file.resolvingSymlinksInPath().path == file.standardizedFileURL.path else { throw MobileError.invalidPath }
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        guard (attributes[.size] as? NSNumber)?.intValue ?? 0 <= 50_000_000 else { throw MobileError.invalidData("分享附件超过 50 MB。") }
        return try Data(contentsOf: file)
    }
    public func markImported(_ id: String, spaceID: String, path: String) throws {
        guard MobileProtocol.validID(id), MobileProtocol.validID(spaceID), MobileProtocol.validPath(path) else { throw MobileError.invalidPath }
        try MobileProtocol.encoder().encode(["knowledgeBaseId": spaceID, "path": path]).write(to: root.appendingPathComponent(id + "/imported.json"), options: .atomic)
    }
}
