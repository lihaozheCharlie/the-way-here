import Foundation
extension SpaceStore {
    /// Copy the actual corpus and attachments, never model keys, queue or execution state.
    public func copyContent(to target: SpaceStore) async throws {
        guard !target.manifest.readOnly, manifest.id != target.manifest.id else { throw MobileError.readOnly }
        let roots = [(manifest.sourcesPath,target.manifest.sourcesPath),(manifest.wikiPath,target.manifest.wikiPath)]
        for (old,new) in roots {
            var children = Set<String>()
            for replica in [root,cloudRoot].compactMap({$0}) {
                let directory = try MobileProtocol.checkedURL(old,under:replica)
                guard let iterator = files.enumerator(atPath:directory.path) else { continue }
                for case let child as String in iterator {
                    if child.split(separator:"/").contains(where:{ [".runtime",".DS_Store","node_modules"].contains(String($0)) }) { iterator.skipDescendants(); continue }
                    let source = try MobileProtocol.checkedURL(old + "/" + child,under:replica)
                    let values = try source.resourceValues(forKeys:[.isSymbolicLinkKey,.isRegularFileKey])
                    if values.isSymbolicLink == true { throw MobileError.invalidPath }
                    if values.isRegularFile == true { children.insert(child) }
                }
            }
            for child in children.sorted() {
                let source = try url(old + "/" + child)
                let bytes = try read(old + "/" + child)
                let copied: Data
                if source.pathExtension == "json", child.split(separator:"/").contains(where:{$0.hasPrefix(".")}), let object = try? JSONSerialization.jsonObject(with:bytes) {
                    copied = try JSONSerialization.data(withJSONObject:rebaseJSON(object, target:target.manifest),options:[.sortedKeys])
                } else if source.pathExtension == "md", var text = String(data:bytes,encoding:.utf8) {
                    for (from,to) in roots { for prefix in ["[[","(","(<"] { text = text.replacingOccurrences(of:prefix + from + "/",with:prefix + to + "/") } }
                    copied = Data(text.utf8)
                } else { copied = bytes }
                try await target.write(copied,to:new + "/" + child,exclusive:true)
            }
        }
        for sidecar in ["snapshot.json","understanding.json","prediction.json"] {
            if let data = try? read(".mobile/" + sidecar), let object = try? JSONSerialization.jsonObject(with:data) {
                let rebased = try JSONSerialization.data(withJSONObject:rebaseJSON(object,target:target.manifest),options:[.sortedKeys])
                try await target.write(rebased,to:".mobile/" + sidecar,exclusive:true)
            }
        }
        for folder in try folders() { try await target.createFolder(folder) }
    }
    private func rebaseJSON(_ value: Any, target: SpaceManifest) -> Any {
        if let array = value as? [Any] { return array.map { rebaseJSON($0,target:target) } }
        if let object = value as? [String:Any] { return object.mapValues { rebaseJSON($0,target:target) }.merging(object["knowledgeBaseId"] as? String == manifest.id ? ["knowledgeBaseId":target.id] : [:]) { _,new in new } }
        if let string = value as? String {
            for (old,new) in [(manifest.sourcesPath,target.sourcesPath),(manifest.wikiPath,target.wikiPath)] { if string == old || string.hasPrefix(old + "/") { return new + string.dropFirst(old.count) } }
        }
        return value
    }
}
