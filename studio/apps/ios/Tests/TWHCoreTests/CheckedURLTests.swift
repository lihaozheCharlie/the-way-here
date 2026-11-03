import XCTest
@testable import TWHCore

final class CheckedURLTests: XCTestCase {
    private func fixture() throws -> URL {
        // Exercise Darwin's real /private/var alias, not an arbitrary test
        // symlink that the product is required to reject.
        let temporary = FileManager.default.temporaryDirectory.path
        let physical = temporary.hasPrefix("/var/") || temporary.hasPrefix("/tmp/") ? "/private" + temporary : temporary
        let root = URL(fileURLWithPath: physical).appendingPathComponent("anonymous-path-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
    func testSystemAliasRootAcceptsMissingThenExistingLeafWithoutChangingItsBinding() throws {
        let root = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let alternatePath = root.path.hasPrefix("/private/var/") ? String(root.path.dropFirst("/private".count)) : root.path
        let spellings = [root, URL(fileURLWithPath: alternatePath)]
        for (index, candidate) in spellings.enumerated() {
            let relative = "Anonymous/record-\(index).md"
            let first = try MobileProtocol.checkedURL(relative, under: candidate)
            try FileManager.default.createDirectory(at: first.deletingLastPathComponent(), withIntermediateDirectories: true)
            let bytes = Data("ANONYMOUS_SYSTEM_ALIAS_RECORD_\(index)".utf8)
            try bytes.write(to: first, options: .withoutOverwriting)
            for existingRoot in spellings {
                let second = try MobileProtocol.checkedURL(relative, under: existingRoot)
                XCTAssertEqual(try Data(contentsOf: second), bytes)
                XCTAssertEqual(second.standardizedFileURL.path, root.appendingPathComponent(relative).standardizedFileURL.path)
            }
        }
    }
    func testRealFileSyncAcceptsTheSecondPassAndStillUploadsExactBytes() async throws {
        let base = try fixture(); defer { try? FileManager.default.removeItem(at: base) }
        let local = base.appendingPathComponent("Local"), cloud = base.appendingPathComponent("Cloud")
        let manifest = SpaceManifest(id: "anonymous-system-alias", name: "Anonymous")
        let store = try SpaceStore(root: local, manifest: manifest, deviceId: "anonymous-device")
        try await store.initialize()
        let source = try await store.saveOriginal(text: "ANONYMOUS_FIRST_SYNC", folder: "Anonymous")
        let engine = FileSync(local: local, cloud: cloud, ledger: base.appendingPathComponent("ledger.json"))
        _ = try await engine.synchronize(allowPhotos: true)
        let before = try await store.read(source)
        try await store.saveEdit(path: source, expectedHash: MobileProtocol.hash(before), markdown: "ANONYMOUS_SECOND_SYNC")
        _ = try await engine.synchronize(allowPhotos: true)
        XCTAssertEqual(try String(contentsOf: cloud.appendingPathComponent(source), encoding: .utf8), "ANONYMOUS_SECOND_SYNC")
        let remote = try JSONDecoder().decode(SpaceManifest.self, from: Data(contentsOf: cloud.appendingPathComponent("mobile-space.json")))
        XCTAssertEqual(remote.id, manifest.id)
    }
    func testTraversalAndEveryChildLinkAreRejectedIncludingMissingLeaves() throws {
        let base = try fixture(); defer { try? FileManager.default.removeItem(at: base) }
        let root = base.appendingPathComponent("Root"), outside = base.appendingPathComponent("Outside")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
        let secret = outside.appendingPathComponent("untouched.md")
        try Data("ANONYMOUS_OUTSIDE_SENTINEL".utf8).write(to: secret)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("ancestor"), withDestinationURL: outside)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("leaf.md"), withDestinationURL: secret)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("broken"), withDestinationURL: outside.appendingPathComponent("absent"))
        let inside = root.appendingPathComponent("Inside")
        try FileManager.default.createDirectory(at: inside, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("internal-link"), withDestinationURL: inside)
        for relative in ["../Outside/new.md", "/absolute", "a//b", "a/./b", "a/../b", "a\\b", "a:b", "ancestor/untouched.md", "ancestor/missing.md", "leaf.md", "broken/missing.md", "internal-link/new.md"] {
            XCTAssertThrowsError(try MobileProtocol.checkedURL(relative, under: root), relative) { error in
                guard case MobileError.invalidPath = error else { return XCTFail("Unexpected error: \(error)") }
            }
        }
        XCTAssertEqual(try String(contentsOf: secret, encoding: .utf8), "ANONYMOUS_OUTSIDE_SENTINEL")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: outside.path), ["untouched.md"])
    }
    func testArbitraryRootAndAncestorAliasesAreNotAcceptedAsSystemAliases() throws {
        let base = try fixture(); defer { try? FileManager.default.removeItem(at: base) }
        let real = base.appendingPathComponent("Real")
        try FileManager.default.createDirectory(at: real.appendingPathComponent("Nested"), withIntermediateDirectories: true)
        let alias = base.appendingPathComponent("UserChosenAlias")
        try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: real)
        XCTAssertThrowsError(try MobileProtocol.checkedURL("missing.md", under: alias))
        XCTAssertThrowsError(try MobileProtocol.checkedURL("missing.md", under: alias.appendingPathComponent("Nested")))
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: real.appendingPathComponent("Nested").path).isEmpty)
    }
}
