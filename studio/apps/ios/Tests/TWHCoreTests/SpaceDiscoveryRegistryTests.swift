import XCTest
@testable import TWHCore

final class SpaceDiscoveryRegistryTests: XCTestCase {
    func testLocalAndCloudCounterpartsMayShareTheirBoundIdentity() throws {
        var registry = SpaceDiscoveryRegistry()
        let manifest = SpaceManifest(id: "anonymous", name: "Anonymous")
        try registry.register(manifest, directory: "anonymous-copy")
        var renamed = manifest; renamed.name = "New display name"
        try registry.register(renamed, directory: "anonymous-copy")
        XCTAssertTrue(registry.conflictingSpaceIDs.isEmpty)
        XCTAssertNoThrow(try registry.validateSelection(manifest.id))
    }
    func testDuplicateCopiesRemainAmbiguousInsteadOfLastDirectoryWinning() throws {
        var registry = SpaceDiscoveryRegistry()
        let manifest = SpaceManifest(id: "personal", name: "Anonymous")
        try registry.register(manifest, directory: "personal-first")
        try registry.register(manifest, directory: "personal-second")
        try registry.register(manifest, directory: "personal-first")
        XCTAssertEqual(registry.conflictingSpaceIDs, ["personal"])
        XCTAssertThrowsError(try registry.validateSelection("personal"))
        XCTAssertNoThrow(try registry.validateSelection("another-independent-space"))
    }
    func testSameDirectoryCannotChangeTheBoundCorpusForAnIdentity() throws {
        var registry = SpaceDiscoveryRegistry()
        var manifest = SpaceManifest(id: "anonymous", name: "Anonymous")
        try registry.register(manifest, directory: "same-directory")
        manifest.sourcesPath = "other/sources"; manifest.wikiPath = "other/wiki"
        try registry.register(manifest, directory: "same-directory")
        XCTAssertThrowsError(try registry.validateSelection(manifest.id))
    }
    func testFreshPortableIDsKeepCopiesIndependentEvenWithTheSameCorpusPaths() throws {
        var registry = SpaceDiscoveryRegistry()
        var first = SpaceManifest(id: "copy-one", name: "First")
        first.sourcesPath = "vault/personal/sources"; first.wikiPath = "vault/personal/wiki"
        var second = SpaceManifest(id: "copy-two", name: "Second")
        second.sourcesPath = first.sourcesPath; second.wikiPath = first.wikiPath
        try registry.register(first, directory: "personal-one")
        try registry.register(second, directory: "personal-two")
        XCTAssertTrue(registry.conflictingSpaceIDs.isEmpty)
        XCTAssertNoThrow(try registry.validateSelection(first.id))
        XCTAssertNoThrow(try registry.validateSelection(second.id))
    }
}
