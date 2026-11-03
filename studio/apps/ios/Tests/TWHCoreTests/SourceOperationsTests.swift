import XCTest
@testable import TWHCore

final class SourceOperationsTests: XCTestCase {
    func fixture() throws -> (SpaceStore, URL) { let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString); try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true); return (try SpaceStore(root: root, manifest: SpaceManifest(id: "anonymous", name: "Test"), deviceId: "test-device"), root) }
    func testDuplicateCopyAndMoveNeverOverwriteAndFolderJournalCoversNestedFiles() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }; try await store.initialize()
        let path = try await store.saveOriginal(text: "Anonymous", folder: "A/Nested", title: "Note")
        try await store.createFolder("A/Empty")
        let copy = try await store.copySource(path: path, folder: "A/Nested")
        XCTAssertTrue(copy.contains("（2）"))
        _ = try await store.relocateFolder("A", to: "B")
        let folders = try await store.folders(); XCTAssertTrue(folders.contains("B/Empty")); XCTAssertFalse(folders.contains("A/Empty"))
        let docs = try await store.documents(); XCTAssertEqual(docs.count, 2); XCTAssertTrue(docs.allSatisfy { $0.path.contains("/B/Nested/") })
        let journals = try await store.jsonFiles(".mobile/relocations", as: SpaceStore.SourceRelocation.self); XCTAssertEqual(journals.count, 2)
        try await store.trashFolder("B")
        let trash = try await store.trashEntries(); XCTAssertTrue(trash.contains { $0.path.contains("/B/Nested/") })
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent(".mobile/folder-deletions/" + MobileProtocol.hash(Data("B".utf8)) + ".json").path))
    }
    func testFolderRejectsSymlinkBeforeMovingAnyFile() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }; try await store.initialize()
        let path = try await store.saveOriginal(text: "Safe", folder: "A")
        let directory = try await store.url((path as NSString).deletingLastPathComponent)
        try FileManager.default.createSymbolicLink(at: directory.appendingPathComponent("escape"), withDestinationURL: root.deletingLastPathComponent())
        do { _ = try await store.relocateFolder("A", to: "B"); XCTFail("accepted symlink") } catch {}
        let original = try await store.read(path); XCTAssertFalse(original.isEmpty)
    }
    func testKeepBothResolvesLabelWithoutOverwritingRemote() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }; try await store.initialize()
        let path = try await store.saveOriginal(text: "Initial", folder: "A"); let old = try await store.read(path)
        try await store.saveEdit(path: path, expectedHash: MobileProtocol.hash(old), markdown: "Remote")
        var conflict = ""
        do { try await store.saveEdit(path: path, expectedHash: MobileProtocol.hash(old), markdown: "Local") } catch MobileError.conflict(let url) { conflict = String(url.path.dropFirst(root.path.count + 1)) }
        try await store.resolveConflict(path: path, expectedHash: MobileProtocol.hash(Data("Remote".utf8)), markdown: "Local", conflictPath: conflict, keepCopy: true)
        let documents = try await store.documents(); XCTAssertEqual(documents.count, 2); XCTAssertFalse(documents.contains { $0.path.contains(".conflict-") }); XCTAssertEqual(Set(documents.map(\.markdown)), ["Remote", "Local"])
    }
    func testNamedImportsPreserveOriginalMetadataAcrossMoveAndRename() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }; try await store.initialize()
        let path = try await store.importNamedSourceFile(data: Data("anonymous".utf8), filename: "original.txt", folder: "Imports")
        let duplicate = try await store.importNamedSourceFile(data: Data("second".utf8), filename: "original.txt", folder: "Imports")
        XCTAssertTrue(duplicate.hasSuffix("original（2）.txt"))
        let moved = try await store.moveSource(path: path, folder: "Moved")
        let renamed = try await store.renameSource(path: moved, name: "renamed")
        let info = try await store.sourceInformation(for: renamed)
        XCTAssertEqual(info?.originalName, "original.txt"); XCTAssertEqual(info?.knowledgeBaseId, "anonymous"); XCTAssertEqual(info?.path, renamed)
        let bytes = try await store.read(renamed); XCTAssertEqual(bytes, Data("anonymous".utf8))
    }

}
