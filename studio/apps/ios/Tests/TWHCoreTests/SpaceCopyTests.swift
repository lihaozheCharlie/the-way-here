import XCTest
@testable import TWHCore
final class SpaceCopyTests: XCTestCase {
    func testCopyIncludesCloudOnlyAttachmentsAndRebasesLinksWithoutKeysOrQueue() async throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:base) }
        let original = SpaceManifest(id:"anonymous-original",name:"Original"), copied = SpaceManifest(id:"anonymous-copy",name:"Copy")
        let cloud = base.appendingPathComponent("cloud"), local = base.appendingPathComponent("local")
        let remote = try SpaceStore(root:cloud,manifest:original,deviceId:"mac"); try await remote.initialize()
        let photo = original.sourcesPath + "/Photos/anonymous.jpg"
        try await remote.write(Data([1,2,3]),to:photo)
        let source = try SpaceStore(root:local,manifest:original,deviceId:"phone",cloudRoot:cloud); try await source.initialize()
        let path = try await source.saveOriginal(text:"![](<\(photo)>)",folder:"Notes",title:"Anonymous")
        try await source.writeJSON(["secret":"must not copy"],path:".mobile/queue/anonymous.json")
        let target = try SpaceStore(root:base.appendingPathComponent("copy"),manifest:copied,deviceId:"phone"); try await target.initialize()
        try await source.copyContent(to:target)
        let bytes = try await target.read(copied.sourcesPath + "/Photos/anonymous.jpg"); XCTAssertEqual(bytes,Data([1,2,3]))
        let targetPath = path.replacingOccurrences(of:original.sourcesPath,with:copied.sourcesPath)
        let text = String(data:try await target.read(targetPath),encoding:.utf8)!
        XCTAssertTrue(text.contains(copied.sourcesPath + "/Photos/anonymous.jpg")); XCTAssertFalse(FileManager.default.fileExists(atPath:target.root.appendingPathComponent(".mobile/queue").path))
        let unchanged = String(data:try await source.read(path),encoding:.utf8)!; XCTAssertTrue(unchanged.contains(photo))
    }
}
