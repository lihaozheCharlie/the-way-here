import XCTest
@testable import TWHCore

final class SpaceStoreTests: XCTestCase {
    func fixture(readOnly: Bool = false) throws -> (SpaceStore, URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return (try SpaceStore(root: root, manifest: SpaceManifest(id: "anonymous", name: "匿名测试", readOnly: readOnly), deviceId: "test-device"), root)
    }
    func testOriginalsNeverCollideAndDraftsRemainSpaceBound() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await store.initialize()
        let a = try await store.saveOriginal(text: "原话一", folder: "随手记"), b = try await store.saveOriginal(text: "原话二", folder: "随手记")
        XCTAssertNotEqual(a, b)
        let documents = try await store.documents(); XCTAssertEqual(documents.count, 2)
        let wrong = Draft(space: "other", text: "不能串库")
        do { try await store.saveDraft(wrong); XCTFail("accepted cross-space draft") } catch {}
    }
    func testConcurrentEditPreservesBothVersions() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await store.initialize()
        let path = try await store.saveOriginal(text: "原文", folder: "笔记")
        let before = try await store.read(path)
        try await store.saveEdit(path: path, expectedHash: MobileProtocol.hash(before), markdown: "Mac 新版")
        do { try await store.saveEdit(path: path, expectedHash: MobileProtocol.hash(before), markdown: "iPhone 新版"); XCTFail("overwrote concurrent edit") } catch MobileError.conflict(let copy) { XCTAssertEqual(try String(contentsOf: copy), "iPhone 新版") }
        let current = try await store.read(path); XCTAssertEqual(String(data: current, encoding: .utf8), "Mac 新版")
    }
    func testTraversalSymlinkAndWikiWritesRejected() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await store.initialize()
        for path in ["../escape", "/absolute", "a//b", "a\\b", "a/./b", "a/../b"] { do { _ = try await store.url(path); XCTFail(path) } catch {} }
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("outside"), withDestinationURL: root.deletingLastPathComponent())
        do { _ = try await store.url("outside/escape"); XCTFail("followed symlink") } catch {}
        do { try await store.saveEdit(path: "vault/anonymous/wiki/test.md", expectedHash: "", markdown: "changed"); XCTFail("edited wiki") } catch {}
    }
    func testQueueIsImmutableAndCancellationDoesNotRewriteRequest() async throws {
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await store.initialize()
        let request = TaskRequest(space: "anonymous", device: "test-device", kind: .letter, text: "写一封信")
        try await store.enqueue(request); try await store.cancel(request.id)
        do { try await store.enqueue(request); XCTFail("duplicate request") } catch {}
        let requests = try await store.requests(); XCTAssertEqual(requests, [request])
        let wrong = TaskRequest(space: "other", device: "test-device", kind: .build, text: "不能串库")
        do { try await store.enqueue(wrong); XCTFail("cross-space task") } catch {}
    }
    func testDemoIsReadOnlyAndCorruptionIsVisible() async throws {
        let (demo, demoRoot) = try fixture(readOnly: true); defer { try? FileManager.default.removeItem(at: demoRoot) }
        do { _ = try await demo.saveOriginal(text: "不会写入", folder: "笔记"); XCTFail("demo write") } catch {}
        let (store, root) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        try await store.initialize(); let dir = root.appendingPathComponent(".mobile/drafts")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try Data("invalid".utf8).write(to: dir.appendingPathComponent("broken.json"))
        do { _ = try await store.drafts(); XCTFail("silently ignored corruption") } catch {}
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.appendingPathComponent("broken.json").path))
    }
}
