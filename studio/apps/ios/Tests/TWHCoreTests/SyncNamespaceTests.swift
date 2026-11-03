import XCTest
@testable import TWHCore

final class SyncNamespaceTests: XCTestCase {
    func testManifestSyncNeverCopiesAnotherLibraryOrUnrelatedWorkspaceFile() async throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:base) }
        let local = base.appendingPathComponent("local"), cloud = base.appendingPathComponent("cloud")
        let manifest = SpaceManifest(id:"anonymous-bound",name:"Anonymous")
        let store = try SpaceStore(root:local,manifest:manifest,deviceId:"phone")
        try await store.initialize()
        let bound = try await store.saveOriginal(text:"Bound fictional source",folder:"Notes")
        let other = local.appendingPathComponent("vault/anonymous-other/sources/unrelated.md")
        try FileManager.default.createDirectory(at:other.deletingLastPathComponent(),withIntermediateDirectories:true)
        let bytes = Data("Another fictional library must stay separate".utf8)
        try bytes.write(to:other)
        try bytes.write(to:local.appendingPathComponent("unrelated-workspace-note.md"))
        let sync = FileSync(local:local,cloud:cloud,ledger:base.appendingPathComponent("ledger.json"))
        _ = try await sync.synchronize(allowPhotos:true)
        XCTAssertTrue(FileManager.default.fileExists(atPath:cloud.appendingPathComponent(bound).path))
        XCTAssertFalse(FileManager.default.fileExists(atPath:cloud.appendingPathComponent("vault/anonymous-other").path))
        XCTAssertFalse(FileManager.default.fileExists(atPath:cloud.appendingPathComponent("unrelated-workspace-note.md").path))
        XCTAssertEqual(try Data(contentsOf:other),bytes)
    }
    func testLegacyRootPredictionIsRemovedAtSpaceExpiry() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        var manifest = SpaceManifest(id:"anonymous-legacy",name:"Anonymous")
        manifest.sourcesPath = "sources"; manifest.wikiPath = "wiki"
        let store = try SpaceStore(root:root,manifest:manifest,deviceId:"phone")
        try await store.initialize()
        try await store.writeJSON(["knowledgeBaseId":manifest.id,"anonymous":"prediction"],path:"predictions/state.json")
        try await store.requestDeletion(confirmName:manifest.name)
        let state = try await store.lifecycleState()
        var deletion = SpaceLifecycleEvent(knowledgeBaseId:manifest.id,requestId:state.requestId!,action:"delete",name:manifest.name)
        deletion.at = MobileProtocol.preciseTimestamp(Date().addingTimeInterval(1)); deletion.expiresAt = MobileProtocol.preciseTimestamp(Date().addingTimeInterval(2))
        try await store.writeJSON(deletion,path:".mobile/space-events/\(deletion.id).json")
        try await store.purgeExpiredSpace(now:Date().addingTimeInterval(3))
        XCTAssertFalse(FileManager.default.fileExists(atPath:root.appendingPathComponent("predictions/state.json").path))
    }
}
