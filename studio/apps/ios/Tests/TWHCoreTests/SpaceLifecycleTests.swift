import XCTest
@testable import TWHCore

final class SpaceLifecycleTests: XCTestCase {
    func testRestoreIsCausalAcrossDeviceClockSkewAndArchiveRejectsWrites() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try SpaceStore(root:root,manifest:SpaceManifest(id:"anonymous-lifecycle",name:"Test"),deviceId:"phone")
        try await store.initialize()
        var request = SpaceLifecycleEvent(knowledgeBaseId:"anonymous-lifecycle",requestId:"request",action:"request",name:"Test")
        request.at = MobileProtocol.preciseTimestamp(Date().addingTimeInterval(3600))
        var deletion = SpaceLifecycleEvent(knowledgeBaseId:"anonymous-lifecycle",requestId:"request",action:"delete",name:"Test")
        deletion.at = MobileProtocol.preciseTimestamp(Date().addingTimeInterval(3601)); deletion.expiresAt = MobileProtocol.preciseTimestamp(Date().addingTimeInterval(30*86400))
        try await store.writeJSON(request,path:".mobile/space-events/\(request.id).json")
        try await store.writeJSON(deletion,path:".mobile/space-events/\(deletion.id).json")
        do { _ = try await store.saveOriginal(text:"must not write",folder:"Notes"); XCTFail("archived space accepted content") } catch {}
        try await store.restoreSpace()
        let state = try await store.lifecycleState(); XCTAssertEqual(state.status,"active")
        _ = try await store.saveOriginal(text:"anonymous restored content",folder:"Notes")
    }
    func testExpiryPurgesAllContentSidecarsAndIsRetryable() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let manifest = SpaceManifest(id:"anonymous-expiry",name:"Test")
        let store = try SpaceStore(root:root,manifest:manifest,deviceId:"phone")
        try await store.initialize(); _ = try await store.saveOriginal(text:"anonymous",folder:"Notes")
        try await store.writeJSON(["content":"anonymous"],path:".mobile/understanding.json")
        try await store.requestDeletion(confirmName:"Test")
        let requested = try await store.lifecycleState()
        var deleted = SpaceLifecycleEvent(knowledgeBaseId:manifest.id,requestId:requested.requestId!,action:"delete",name:"Test")
        deleted.at = MobileProtocol.preciseTimestamp(Date().addingTimeInterval(1)); deleted.expiresAt = MobileProtocol.preciseTimestamp(Date().addingTimeInterval(2))
        try await store.writeJSON(deleted,path:".mobile/space-events/\(deleted.id).json")
        try await store.purgeExpiredSpace(now:Date().addingTimeInterval(3))
        try await store.purgeExpiredSpace(now:Date().addingTimeInterval(4))
        let state = try await store.lifecycleState(); XCTAssertEqual(state.status,"purged")
        XCTAssertFalse(FileManager.default.fileExists(atPath:root.appendingPathComponent(".mobile/understanding.json").path))
        XCTAssertFalse(FileManager.default.fileExists(atPath:root.appendingPathComponent(manifest.sourcesPath).path))
        XCTAssertTrue(FileManager.default.fileExists(atPath:root.appendingPathComponent("mobile-space.json").path))
    }
    func testDisplayFrontmatterDoesNotChangeOriginalHash() {
        let raw = "---\nprivate_metadata: do not display\n---\n# Anonymous\n\nBody"
        let doc = Document(path:"sources/note.md",markdown:raw,isSource:true)
        XCTAssertFalse(doc.bodyMarkdown.contains("private_metadata")); XCTAssertFalse(doc.excerpt.contains("private_metadata"))
        XCTAssertEqual(doc.markdown,raw); XCTAssertEqual(doc.hash,MobileProtocol.hash(Data(raw.utf8)))
    }
}
