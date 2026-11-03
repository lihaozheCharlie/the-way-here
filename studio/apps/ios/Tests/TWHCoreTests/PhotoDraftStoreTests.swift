import XCTest
@testable import TWHCore

final class PhotoDraftStoreTests: XCTestCase {
    func testDiscardPreservesTombstoneAndThirtyDayRecoveryForEveryCopy() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try SpaceStore(root: root, manifest: SpaceManifest(id: "anonymous-photo", name: "Anonymous"), deviceId: "phone")
        try await store.initialize()
        var draft = PhotoDraft(space: "anonymous-photo")
        let bytes = Data([0xff, 0xd8, 0xff, 0xd9])
        for _ in 0..<3 { let path = try await store.savePhoto(bytes, draftId: draft.id); draft.photos.append(MemoryPhoto(path: path)) }
        try await store.savePhotoDraft(draft)
        try await store.discardPhotoDraft(draft)
        let drafts = try await store.photoDrafts()
        XCTAssertEqual(drafts.first?.step, -1)
        let entries = try await store.trashEntries()
        XCTAssertEqual(entries.count, 3)
        for entry in entries {
            XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent(entry.path).path))
            try await store.restoreTrash(entry)
            let restored = try await store.read(entry.path)
            XCTAssertEqual(restored, bytes)
        }
    }
    func testCrossSpaceOrReadOnlyDiscardDoesNotTouchFiles() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try SpaceStore(root: root, manifest: SpaceManifest(id: "anonymous-photo", name: "Anonymous"), deviceId: "phone")
        try await store.initialize()
        do { try await store.discardPhotoDraft(PhotoDraft(space: "another-space")); XCTFail("accepted another space") } catch {}
        let demo = try SpaceStore(root: root, manifest: SpaceManifest(id: "anonymous-photo", name: "Demo", readOnly: true), deviceId: "phone")
        do { try await demo.discardPhotoDraft(PhotoDraft(space: "anonymous-photo")); XCTFail("wrote demo") } catch {}
        let drafts = try await store.photoDrafts(); XCTAssertTrue(drafts.isEmpty)
    }
}
